import { Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { Autorizacion, PatronRecurrencia, Vigencia, esExito } from '@ncr/domain-core';
import type { Acompanante } from '@ncr/domain-core';
import type {
  AutorizacionEnLista,
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
 */
@Injectable()
export class RepositorioAutorizacionesPg
  implements RepositorioAutorizaciones, RepositorioDeConsultaDeAutorizaciones
{
  constructor(
    private readonly pool: Pool,
    private readonly claims: Record<string, unknown> = {},
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

  async guardar(copropiedadId: string, a: Autorizacion, actorId: string): Promise<void> {
    await this.conContexto(async (c) => {
      await c.query('BEGIN');
      try {
        const visitanteId = await this.visitanteDe(c, copropiedadId, a.personaId, actorId);
        await c.query(
          `INSERT INTO public.autorizaciones
             (id, copropiedad_id, vivienda_id, visitante_id, autorizado_por, tipo,
              vigencia, observaciones, estado, creado_por, actualizado_por,
              revocada_en, revocada_por, motivo_revocacion)
           VALUES ($1,$2,$3,$4,$5,$6, tstzrange($7,$8,'[)'), NULL, $9, $5,$5, $10, $11, $12)
           ON CONFLICT (id) DO UPDATE
             SET estado = EXCLUDED.estado,
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
            actorId,
            a.esRecurrente ? 'recurrente' : 'unica',
            a.vigencia.desde,
            a.vigencia.hasta,
            a.estado === 'revocada' ? 'revocada' : 'activa',
            a.revocadaEn,
            a.estado === 'revocada' ? actorId : null,
            a.motivoRevocacion,
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
    }>(
      `SELECT a.id, a.vivienda_id, v.persona_id,
              lower(a.vigencia) AS desde, upper(a.vigencia) AS hasta,
              a.estado::text AS estado, a.revocada_en, a.motivo_revocacion
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
      }>(
        `SELECT a.id, a.vivienda_id, vi.identificador AS vivienda,
                p.nombre_completo AS visitante, p.numero_documento AS documento,
                lower(a.vigencia) AS desde, upper(a.vigencia) AS hasta,
                a.tipo::text AS tipo, a.estado::text AS estado, a.placa,
                a.revocada_en, a.motivo_revocacion,
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
      }));
    });
  }
}

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
