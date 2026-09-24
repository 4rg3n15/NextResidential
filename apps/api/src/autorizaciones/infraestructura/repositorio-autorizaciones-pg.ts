import { Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { Autorizacion, PatronRecurrencia, Placa, Vigencia, esExito } from '@ncr/domain-core';
import type { Acompanante } from '@ncr/domain-core';
import { ViviendaSinTitular } from '../aplicacion/puertos';
import type {
  AutorizacionEnLista,
  CriterioDeLectura,
  FotografiaDeVisitante,
  RepositorioAutorizaciones,
  RepositorioDeConsultaDeAutorizaciones,
} from '../aplicacion/puertos';

/**
 * Adaptador PostgreSQL del agregado `Autorización` — ETAPA 09-B.
 *
 * **Por qué no existía.** La ETAPA 05 construyó el agregado y el motor de
 * reglas, que son puros y se prueban sin base; nada los persistía todavía. La
 * pantalla de visitantes es el primer consumidor real, y con ella aparece la
 * pregunta que el diseño había aplazado: cómo se guarda.
 *
 * Tres decisiones que conviene leer juntas:
 *
 * 1. **El `visitante` se resuelve o se crea aquí, no en el dominio.** El
 *    agregado habla de `personaId` porque lo que le importa es *quién* entra;
 *    la base tiene además una fila `visitantes` que agrupa categoría y empresa.
 *    Traducir entre los dos es trabajo de adaptador: si el dominio conociera la
 *    tabla `visitantes`, dejaría de ser puro por un detalle de almacenamiento.
 * 2. **Todo el guardado va en UNA transacción.** Una autorización con su
 *    patrón a medias es una autorización que permite lo que no debe: las filas
 *    de `patrones_recurrencia` restringen, y si faltan, la autorización aplica
 *    siempre.
 * 3. **La revocación no borra.** RN-19 y CA-02: `estado='revocada'` con su
 *    momento y su motivo. El historial es la mitad del producto.
 * 4. **Quien «autoriza» es el titular de la vivienda, no quien pulsa** —ETAPA
 *    15-D, [SUPUESTO] S-38—. La base exige que `autorizado_por` sea un residente
 *    titular activo de la vivienda destino (RN-05, `tg_autorizacion_coherente`),
 *    y hasta ahora se escribía el identificador del USUARIO de la consola: el
 *    disparador lo rechazaba y ninguna autorización creada desde administración
 *    o portería llegaba a existir contra base real (D-113). El administrador
 *    autoriza EN NOMBRE de la vivienda; `creado_por` conserva quién fue.
 */
@Injectable()
export class RepositorioAutorizacionesPg
  implements RepositorioAutorizaciones, RepositorioDeConsultaDeAutorizaciones
{
  constructor(
    private readonly pool: Pool,
    private readonly claims: Record<string, unknown> = {},
    /** Nombre del bucket que figura en `evidencias.bucket` (D-19). */
    private readonly bucket: string = 'en-memoria',
  ) {}

  private async conContexto<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(this.claims),
      ]);
      return await fn(cliente);
    } finally {
      cliente.release();
    }
  }

  /** Devuelve el `visitante_id` de esa persona, creándolo si aún no existe. */
  private async visitanteDe(
    c: PoolClient,
    copropiedadId: string,
    personaId: string,
    actorId: string,
  ): Promise<string> {
    const existente = await c.query<{ id: string }>(
      `SELECT id FROM public.visitantes
        WHERE copropiedad_id=$1 AND persona_id=$2 AND estado='activo'`,
      [copropiedadId, personaId],
    );
    if (existente.rows[0] !== undefined) return existente.rows[0].id;
    const creado = await c.query<{ id: string }>(
      `INSERT INTO public.visitantes (copropiedad_id, persona_id, creado_por, actualizado_por)
       VALUES ($1,$2,$3,$3) RETURNING id`,
      [copropiedadId, personaId, actorId],
    );
    return creado.rows[0]!.id;
  }

  /**
   * Quién figura como autorizante (decisión 4): el que ya tiene la fila si
   * existe —cambiarlo al editar sería reescribir la historia— y, si es nueva,
   * el titular activo de la vivienda destino. Sin titular no hay a nombre de
   * quién autorizar, y se dice con un error tipado en vez de con un 500.
   */
  private async autorizanteDe(
    c: PoolClient,
    copropiedadId: string,
    a: Autorizacion,
  ): Promise<string> {
    const actual = await c.query<{ autorizado_por: string }>(
      `SELECT autorizado_por FROM public.autorizaciones WHERE copropiedad_id=$1 AND id=$2`,
      [copropiedadId, a.id],
    );
    if (actual.rows[0] !== undefined) return actual.rows[0].autorizado_por;
    const titular = await c.query<{ id: string }>(
      `SELECT id FROM public.residentes
        WHERE copropiedad_id=$1 AND vivienda_id=$2 AND es_titular AND estado='activo'
        ORDER BY creado_en LIMIT 1`,
      [copropiedadId, a.viviendaId],
    );
    if (titular.rows[0] === undefined) throw new ViviendaSinTitular(a.viviendaId);
    return titular.rows[0].id;
  }

  async guardar(copropiedadId: string, a: Autorizacion, actorId: string): Promise<void> {
    await this.conContexto(async (c) => {
      await c.query('BEGIN');
      try {
        const visitanteId = await this.visitanteDe(c, copropiedadId, a.personaId, actorId);
        const autorizanteId = await this.autorizanteDe(c, copropiedadId, a);
        await c.query(
          `INSERT INTO public.autorizaciones
             (id, copropiedad_id, vivienda_id, visitante_id, autorizado_por, tipo,
              vigencia, placa, permite_acceso_vehicular, observaciones,
              estado, creado_por, actualizado_por,
              revocada_en, revocada_por, motivo_revocacion)
           VALUES ($1,$2,$3,$4,$5,$6, tstzrange($7,$8,'[)'), $13::text, $13::text IS NOT NULL, $14::text,
                   $9, $15,$15, $10, $11, $12)
           ON CONFLICT (id) DO UPDATE
             SET vigencia = EXCLUDED.vigencia,
                 placa = EXCLUDED.placa,
                 permite_acceso_vehicular = EXCLUDED.permite_acceso_vehicular,
                 observaciones = EXCLUDED.observaciones,
                 estado = EXCLUDED.estado,
                 revocada_en = EXCLUDED.revocada_en,
                 revocada_por = EXCLUDED.revocada_por,
                 motivo_revocacion = EXCLUDED.motivo_revocacion,
                 actualizado_en = now(),
                 actualizado_por = EXCLUDED.actualizado_por`,
          [
            a.id,
            copropiedadId,
            a.viviendaId,
            visitanteId,
            autorizanteId,
            a.esRecurrente ? 'recurrente' : 'unica',
            a.vigencia.desde,
            a.vigencia.hasta,
            a.estado === 'revocada' ? 'revocada' : 'activa',
            a.revocadaEn,
            a.estado === 'revocada' ? actorId : null,
            a.motivoRevocacion,
            a.placa === null ? null : a.placa.valor,
            a.observaciones,
            actorId,
          ],
        );

        // Zonas, acompañantes y patrón se reescriben enteros: son colecciones
        // del agregado, y un `UPDATE` incremental obligaría a este adaptador a
        // saber qué cambió — información que el agregado no expone y no debe.
        await c.query(
          `DELETE FROM public.autorizaciones_zona WHERE copropiedad_id=$1 AND autorizacion_id=$2`,
          [copropiedadId, a.id],
        );
        for (const zonaId of a.zonasPermitidas) {
          await c.query(
            `INSERT INTO public.autorizaciones_zona
               (copropiedad_id, autorizacion_id, zona_id, creado_por, actualizado_por)
             VALUES ($1,$2,$3,$4,$4)`,
            [copropiedadId, a.id, zonaId, actorId],
          );
        }
        await c.query(
          `DELETE FROM public.autorizacion_acompanantes
            WHERE copropiedad_id=$1 AND autorizacion_id=$2`,
          [copropiedadId, a.id],
        );
        for (const acompanante of a.acompanantes) {
          await c.query(
            `INSERT INTO public.autorizacion_acompanantes
               (copropiedad_id, autorizacion_id, persona_id, creado_por, actualizado_por)
             VALUES ($1,$2,$3,$4,$4)`,
            [copropiedadId, a.id, acompanante.personaId, actorId],
          );
        }
        await c.query(
          `DELETE FROM public.patrones_recurrencia WHERE copropiedad_id=$1 AND autorizacion_id=$2`,
          [copropiedadId, a.id],
        );
        if (a.patron !== null) {
          for (const dia of a.patron.dias) {
            await c.query(
              `INSERT INTO public.patrones_recurrencia
                 (copropiedad_id, autorizacion_id, dia_semana, hora_inicio, hora_fin,
                  creado_por, actualizado_por)
               VALUES ($1,$2,$3,$4::time,$5::time,$6,$6)`,
              [
                copropiedadId,
                a.id,
                // El dominio usa 0..6 con domingo=0; la base exige ISO 1..7 con
                // domingo=7. La conversión vive aquí, en el único punto donde
                // los dos vocabularios se tocan.
                dia === 0 ? 7 : dia,
                minutosAHora(a.patron.minutoInicio),
                minutosAHora(a.patron.minutoFin),
                actorId,
              ],
            );
          }
        }
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        // `check_violation` con la marca RN-05: el disparador de la base dijo
        // lo mismo que `autorizanteDe`, sólo que después (carrera con una baja).
        const error = e as { code?: string; message?: string };
        if (error.code === '23514' && (error.message ?? '').includes('RN-05')) {
          throw new ViviendaSinTitular(a.viviendaId);
        }
        throw e;
      }
    });
  }

  async porId(copropiedadId: string, autorizacionId: string): Promise<Autorizacion | null> {
    return this.conContexto(async (c) => this.leer(c, copropiedadId, autorizacionId));
  }

  private async leer(
    c: PoolClient,
    copropiedadId: string,
    autorizacionId: string,
  ): Promise<Autorizacion | null> {
    const { rows } = await c.query<{
      id: string;
      vivienda_id: string;
      persona_id: string;
      desde: Date;
      hasta: Date;
      estado: string;
      revocada_en: Date | null;
      motivo_revocacion: string | null;
      placa: string | null;
      observaciones: string | null;
    }>(
      `SELECT a.id, a.vivienda_id, v.persona_id,
              lower(a.vigencia) AS desde, upper(a.vigencia) AS hasta,
              a.estado::text AS estado, a.revocada_en, a.motivo_revocacion,
              a.placa, a.observaciones
         FROM public.autorizaciones a
         JOIN public.visitantes v
           ON v.copropiedad_id = a.copropiedad_id AND v.id = a.visitante_id
        WHERE a.copropiedad_id=$1 AND a.id=$2`,
      [copropiedadId, autorizacionId],
    );
    const fila = rows[0];
    if (fila === undefined) return null;

    const vigencia = Vigencia.crear(fila.desde, fila.hasta);
    if (!esExito(vigencia)) return null;

    const zonas = await c.query<{ zona_id: string }>(
      `SELECT zona_id FROM public.autorizaciones_zona
        WHERE copropiedad_id=$1 AND autorizacion_id=$2`,
      [copropiedadId, autorizacionId],
    );
    const acompanantes = await c.query<{ persona_id: string; nombre_completo: string }>(
      `SELECT ac.persona_id, p.nombre_completo
         FROM public.autorizacion_acompanantes ac
         JOIN public.personas p
           ON p.copropiedad_id = ac.copropiedad_id AND p.id = ac.persona_id
        WHERE ac.copropiedad_id=$1 AND ac.autorizacion_id=$2`,
      [copropiedadId, autorizacionId],
    );
    const patronFilas = await c.query<{
      dia_semana: number;
      hora_inicio: string;
      hora_fin: string;
    }>(
      `SELECT dia_semana, hora_inicio::text AS hora_inicio, hora_fin::text AS hora_fin
         FROM public.patrones_recurrencia
        WHERE copropiedad_id=$1 AND autorizacion_id=$2
        ORDER BY dia_semana`,
      [copropiedadId, autorizacionId],
    );

    let patron: PatronRecurrencia | null = null;
    if (patronFilas.rows[0] !== undefined) {
      const primera = patronFilas.rows[0];
      const reconstruido = PatronRecurrencia.crear({
        dias: patronFilas.rows.map((f) => (f.dia_semana === 7 ? 0 : f.dia_semana)),
        minutoInicio: horaAMinutos(primera.hora_inicio),
        minutoFin: horaAMinutos(primera.hora_fin),
        desplazamientoUtcMinutos: 0,
      });
      if (esExito(reconstruido)) patron = reconstruido.valor;
    }

    const lista: Acompanante[] = acompanantes.rows.map((f) => ({
      personaId: f.persona_id,
      nombre: f.nombre_completo,
    }));

    return Autorizacion.rehidratar({
      id: fila.id,
      copropiedadId,
      viviendaId: fila.vivienda_id,
      personaId: fila.persona_id,
      vigencia: vigencia.valor,
      estado: fila.estado === 'revocada' ? 'revocada' : 'vigente',
      acompanantes: lista,
      zonasPermitidas: zonas.rows.map((z) => z.zona_id),
      patron,
      // El máximo no se persiste: es una política, no un hecho. Se rehidrata
      // con el mismo valor por defecto del agregado para que una autorización
      // vieja no quede con un límite distinto al de una nueva.
      maximoAcompanantes: Math.max(5, lista.length),
      revocadaEn: fila.revocada_en,
      motivoRevocacion: fila.motivo_revocacion,
      placa: placaDesde(fila.placa),
      observaciones: fila.observaciones,
    });
  }

  async vigentesDePersona(
    copropiedadId: string,
    personaId: string,
  ): Promise<readonly Autorizacion[]> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `SELECT a.id
           FROM public.autorizaciones a
           JOIN public.visitantes v
             ON v.copropiedad_id = a.copropiedad_id AND v.id = a.visitante_id
          WHERE a.copropiedad_id=$1 AND v.persona_id=$2
            AND a.estado='activa' AND upper(a.vigencia) > now()`,
        [copropiedadId, personaId],
      );
      const salida: Autorizacion[] = [];
      for (const f of rows) {
        const a = await this.leer(c, copropiedadId, f.id);
        if (a !== null) salida.push(a);
      }
      return salida;
    });
  }

  /**
   * Lectura para pantalla. **Una consulta, no N+1**: los acompañantes y los
   * días del patrón se agregan en la misma sentencia. La alternativa —una
   * consulta por autorización— es la que convierte una lista de cincuenta
   * filas en ciento cincuenta viajes a la base.
   */
  /**
   * ═════════════════════════════════════════════════════════════════════════
   * D-25 · LO QUE EL MOTOR PAGA POR CADA LECTURA: UNA CONSULTA
   *
   * `vigentesDePersona` rehidrata con `leer` fila a fila —cuatro consultas por
   * autorización—, y para una pantalla está bien. Para el motor no: se llama
   * por cada vehículo que pasa, y una lectura de placa con tres autorizaciones
   * costaría trece viajes a la base. Aquí acompañantes, zonas y patrón salen
   * como agregados JSON en la MISMA sentencia.
   *
   * Vuelven las ACTIVAS —no revocadas— aunque estén vencidas: el motor es
   * quien decide que una vencida es VIGENCIA_EXPIRADA, y filtrarla aquí lo
   * dejaría sin saber que existió, que es PLACA_DESCONOCIDA. Son dos motivos
   * distintos del contrato, y la diferencia se decide en el dominio.
   */
  async activasParaLectura(
    copropiedadId: string,
    criterio: CriterioDeLectura,
  ): Promise<readonly Autorizacion[]> {
    if (criterio.placa === null && criterio.personaId === null) return [];
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{
        id: string;
        vivienda_id: string;
        persona_id: string;
        desde: Date;
        hasta: Date;
        estado: string;
        revocada_en: Date | null;
        motivo_revocacion: string | null;
        placa: string | null;
        observaciones: string | null;
        zonas: string[] | null;
        acompanantes: { persona_id: string; nombre_completo: string }[] | null;
        patron: { dia_semana: number; hora_inicio: string; hora_fin: string }[] | null;
      }>(
        `SELECT a.id, a.vivienda_id, v.persona_id,
                lower(a.vigencia) AS desde, upper(a.vigencia) AS hasta,
                a.estado::text AS estado, a.revocada_en, a.motivo_revocacion,
                a.placa, a.observaciones,
                (SELECT array_agg(z.zona_id) FROM public.autorizaciones_zona z
                  WHERE z.copropiedad_id = a.copropiedad_id AND z.autorizacion_id = a.id) AS zonas,
                (SELECT json_agg(json_build_object('persona_id', ac.persona_id,
                                                   'nombre_completo', p.nombre_completo))
                   FROM public.autorizacion_acompanantes ac
                   JOIN public.personas p
                     ON p.copropiedad_id = ac.copropiedad_id AND p.id = ac.persona_id
                  WHERE ac.copropiedad_id = a.copropiedad_id
                    AND ac.autorizacion_id = a.id) AS acompanantes,
                (SELECT json_agg(json_build_object('dia_semana', pr.dia_semana,
                                                   'hora_inicio', pr.hora_inicio::text,
                                                   'hora_fin', pr.hora_fin::text)
                                 ORDER BY pr.dia_semana)
                   FROM public.patrones_recurrencia pr
                  WHERE pr.copropiedad_id = a.copropiedad_id
                    AND pr.autorizacion_id = a.id) AS patron
           FROM public.autorizaciones a
           JOIN public.visitantes v
             ON v.copropiedad_id = a.copropiedad_id AND v.id = a.visitante_id
          WHERE a.copropiedad_id = $1
            AND a.estado = 'activa'
            AND (($2::text IS NOT NULL AND a.placa = $2)
                 OR ($3::uuid IS NOT NULL AND v.persona_id = $3))
          ORDER BY upper(a.vigencia) DESC
          LIMIT 50`,
        [copropiedadId, criterio.placa, criterio.personaId],
      );

      const salida: Autorizacion[] = [];
      for (const f of rows) {
        const vigencia = Vigencia.crear(f.desde, f.hasta);
        if (!esExito(vigencia)) continue;
        let patron: PatronRecurrencia | null = null;
        const primera = f.patron?.[0];
        if (primera !== undefined && f.patron !== null) {
          const reconstruido = PatronRecurrencia.crear({
            dias: f.patron.map((x) => (x.dia_semana === 7 ? 0 : x.dia_semana)),
            minutoInicio: horaAMinutos(primera.hora_inicio),
            minutoFin: horaAMinutos(primera.hora_fin),
            desplazamientoUtcMinutos: 0,
          });
          if (esExito(reconstruido)) patron = reconstruido.valor;
        }
        const acompanantes: Acompanante[] = (f.acompanantes ?? []).map((x) => ({
          personaId: x.persona_id,
          nombre: x.nombre_completo,
        }));
        salida.push(
          Autorizacion.rehidratar({
            id: f.id,
            copropiedadId,
            viviendaId: f.vivienda_id,
            personaId: f.persona_id,
            vigencia: vigencia.valor,
            estado: f.estado === 'revocada' ? 'revocada' : 'vigente',
            acompanantes,
            zonasPermitidas: f.zonas ?? [],
            patron,
            maximoAcompanantes: Math.max(5, acompanantes.length),
            revocadaEn: f.revocada_en,
            motivoRevocacion: f.motivo_revocacion,
            placa: placaDesde(f.placa),
            observaciones: f.observaciones,
          }),
        );
      }
      return salida;
    });
  }

  async listar(
    copropiedadId: string,
    solo: 'activas' | 'historial',
  ): Promise<readonly AutorizacionEnLista[]> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{
        id: string;
        vivienda_id: string;
        vivienda: string;
        visitante: string;
        documento: string;
        desde: Date;
        hasta: Date;
        tipo: string;
        estado: string;
        placa: string | null;
        acompanantes: string[] | null;
        dias: number[] | null;
        hora_inicio: string | null;
        hora_fin: string | null;
        revocada_en: Date | null;
        motivo_revocacion: string | null;
        observaciones: string | null;
        tiene_fotografia: boolean;
      }>(
        `SELECT a.id, a.vivienda_id, vi.identificador AS vivienda,
                p.nombre_completo AS visitante, p.numero_documento AS documento,
                lower(a.vigencia) AS desde, upper(a.vigencia) AS hasta,
                a.tipo::text AS tipo, a.estado::text AS estado, a.placa,
                a.revocada_en, a.motivo_revocacion, a.observaciones,
                (a.evidencia_foto_id IS NOT NULL) AS tiene_fotografia,
                (SELECT array_agg(pa.nombre_completo ORDER BY pa.nombre_completo)
                   FROM public.autorizacion_acompanantes ac
                   JOIN public.personas pa
                     ON pa.copropiedad_id = ac.copropiedad_id AND pa.id = ac.persona_id
                  WHERE ac.copropiedad_id = a.copropiedad_id
                    AND ac.autorizacion_id = a.id) AS acompanantes,
                (SELECT array_agg(pr.dia_semana ORDER BY pr.dia_semana)
                   FROM public.patrones_recurrencia pr
                  WHERE pr.copropiedad_id = a.copropiedad_id
                    AND pr.autorizacion_id = a.id) AS dias,
                (SELECT min(pr.hora_inicio)::text FROM public.patrones_recurrencia pr
                  WHERE pr.copropiedad_id = a.copropiedad_id
                    AND pr.autorizacion_id = a.id) AS hora_inicio,
                (SELECT max(pr.hora_fin)::text FROM public.patrones_recurrencia pr
                  WHERE pr.copropiedad_id = a.copropiedad_id
                    AND pr.autorizacion_id = a.id) AS hora_fin
           FROM public.autorizaciones a
           JOIN public.visitantes v
             ON v.copropiedad_id = a.copropiedad_id AND v.id = a.visitante_id
           JOIN public.personas p
             ON p.copropiedad_id = v.copropiedad_id AND p.id = v.persona_id
           JOIN public.viviendas vi
             ON vi.copropiedad_id = a.copropiedad_id AND vi.id = a.vivienda_id
          WHERE a.copropiedad_id = $1
            AND ($2 = 'historial'
                 OR (a.estado = 'activa' AND upper(a.vigencia) > now()))
          ORDER BY lower(a.vigencia) DESC
          LIMIT 300`,
        [copropiedadId, solo],
      );

      return rows.map((f) => ({
        id: f.id,
        viviendaId: f.vivienda_id,
        vivienda: f.vivienda,
        visitante: f.visitante,
        documento: f.documento,
        desde: f.desde.toISOString(),
        hasta: f.hasta.toISOString(),
        tipo: f.tipo === 'recurrente' ? ('recurrente' as const) : ('unica' as const),
        estado: f.estado === 'revocada' ? ('revocada' as const) : ('activa' as const),
        placa: f.placa,
        acompanantes: f.acompanantes ?? [],
        patron:
          f.dias === null || f.dias.length === 0
            ? null
            : {
                dias: f.dias.map((d) => (d === 7 ? 0 : d)),
                horaInicio: (f.hora_inicio ?? '00:00:00').slice(0, 5),
                horaFin: (f.hora_fin ?? '00:00:00').slice(0, 5),
              },
        revocadaEn: f.revocada_en === null ? null : f.revocada_en.toISOString(),
        motivoRevocacion: f.motivo_revocacion,
        observaciones: f.observaciones,
        tieneFotografia: f.tiene_fotografia,
      }));
    });
  }

  /**
   * La fotografía entra como fila de `evidencias` —bucket, ruta, hash, tamaño;
   * nunca una URL (D-19)— y la autorización pasa a apuntarle. La fila anterior,
   * si la había, se conserva: la evidencia no se reescribe, se sustituye la
   * referencia. Todo en una transacción: una evidencia sin autorización que la
   * señale sería un objeto huérfano en el bucket.
   */
  async adjuntarFotografia(
    copropiedadId: string,
    autorizacionId: string,
    fotografia: FotografiaDeVisitante,
    actorId: string,
  ): Promise<boolean> {
    return this.conContexto(async (c) => {
      await c.query('BEGIN');
      try {
        const evidencia = await c.query<{ id: string }>(
          `INSERT INTO public.evidencias
             (copropiedad_id, bucket, ruta, tipo, hash_sha256, tipo_mime, tamano_bytes, creado_por)
           VALUES ($1,$2,$3,'foto_visitante',$4,$5,$6,$7) RETURNING id`,
          [
            copropiedadId,
            this.bucket,
            fotografia.clave,
            fotografia.hashSha256,
            fotografia.tipoMime,
            fotografia.tamanoBytes,
            actorId,
          ],
        );
        const enlazada = await c.query(
          `UPDATE public.autorizaciones
              SET evidencia_foto_id = $3, actualizado_en = now(), actualizado_por = $4
            WHERE copropiedad_id = $1 AND id = $2`,
          [copropiedadId, autorizacionId, evidencia.rows[0]!.id, actorId],
        );
        if ((enlazada.rowCount ?? 0) === 0) {
          await c.query('ROLLBACK');
          return false;
        }
        await c.query('COMMIT');
        return true;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    });
  }

  async fotografiaDe(
    copropiedadId: string,
    autorizacionId: string,
  ): Promise<Pick<FotografiaDeVisitante, 'clave' | 'tipoMime'> | null> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{ ruta: string; tipo_mime: string }>(
        `SELECT e.ruta, e.tipo_mime
           FROM public.autorizaciones a
           JOIN public.evidencias e
             ON e.copropiedad_id = a.copropiedad_id AND e.id = a.evidencia_foto_id
          WHERE a.copropiedad_id = $1 AND a.id = $2`,
        [copropiedadId, autorizacionId],
      );
      const fila = rows[0];
      return fila === undefined ? null : { clave: fila.ruta, tipoMime: fila.tipo_mime };
    });
  }
}

/** Una placa guardada que no pase el objeto de valor se trata como ausente. */
const placaDesde = (texto: string | null): Placa | null => {
  if (texto === null) return null;
  const placa = Placa.crear(texto);
  return esExito(placa) ? placa.valor : null;
};

const minutosAHora = (minutos: number): string => {
  const acotado = Math.min(minutos, 24 * 60 - 1);
  const h = Math.floor(acotado / 60);
  const m = acotado % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
};

const horaAMinutos = (hora: string): number => {
  const [h, m] = hora.split(':');
  return Number(h ?? '0') * 60 + Number(m ?? '0');
};
