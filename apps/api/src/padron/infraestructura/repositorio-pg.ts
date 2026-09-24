import type { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { Injectable } from '@nestjs/common';
import type {
  AltaPersona,
  AltaResidente,
  AltaVehiculo,
  AltaVivienda,
  EdicionDeVehiculo,
  EdicionDeVivienda,
  FilaExportada,
  FiltroDeViviendas,
  GeneracionDeViviendas,
  HistorialDeVehiculo,
  HistorialDeVivienda,
  PersonaEnLista,
  RepositorioPadron,
  ResultadoAltaPersona,
  ResultadoAltaVivienda,
  ResultadoDeGeneracion,
  ResultadoEdicionVehiculo,
  ResultadoEdicionVivienda,
  ResultadoRegistroVehiculo,
  TipoDeVehiculo,
  TotalesDePadron,
  VehiculoEnLista,
  VehiculoResuelto,
  ViviendaEnLista,
} from '../aplicacion/puertos';
import type { Placa, TipoDeDocumento, ViviendaProyectada } from '@ncr/domain-core';

/** Violación de restricción única en PostgreSQL. */
const VIOLACION_UNICA = '23505';

type Ejecutor = Pool | PoolClient;

/**
 * Adaptador PostgreSQL del padrón.
 *
 * Dos decisiones que sostienen ADR-04 y hay que leer juntas:
 *
 * 1. **No hay `SELECT` previo para comprobar si la placa existe.** Se INSERTA y
 *    se deja que el índice único parcial decida. Un `SELECT`-luego-`INSERT` es
 *    correcto en pruebas secuenciales y falso bajo concurrencia: entre las dos
 *    sentencias caben otras cien. KPI-03 exige 0 duplicados en 100 inserciones
 *    simultáneas, y solo la base puede garantizarlo.
 * 2. **`23505` se traduce a un valor de negocio, no se propaga.** El caso de
 *    uso no debe saber qué es un código SQLSTATE.
 *
 * Cada operación fija `request.jwt.claims` en la MISMA conexión que ejecuta la
 * sentencia: las políticas RLS leen esa variable de sesión, y usar el pool sin
 * fijarla dejaría las consultas sin contexto de tenant.
 */
@Injectable()
export class RepositorioPadronPg implements RepositorioPadron {
  constructor(
    private readonly pool: Pool,
    private readonly claims: Record<string, unknown>,
    private readonly ejecutor: Ejecutor = pool,
  ) {}

  private async conContexto<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    if ('release' in this.ejecutor) {
      // Ya estamos dentro de una transacción con su contexto fijado.
      return fn(this.ejecutor as PoolClient);
    }
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

  /**
   * D-25 · una sola consulta por lectura. El índice único parcial de placa
   * activa garantiza que aquí hay a lo sumo una fila viva; la vivienda se trae
   * en el mismo viaje porque es lo único que el motor va a preguntar después.
   */
  async resolverPlaca(copropiedadId: string, placa: Placa): Promise<VehiculoResuelto | null> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{
        vehiculo_id: string;
        vivienda_id: string;
        vivienda_estado: string;
        desactivado_en: Date | null;
        persona_id: string | null;
        creado_en: Date;
      }>(
        `SELECT ve.id AS vehiculo_id, ve.vivienda_id, vi.estado::text AS vivienda_estado,
                vi.desactivado_en, ve.persona_id, ve.creado_en
           FROM public.vehiculos ve
           JOIN public.viviendas vi
             ON vi.copropiedad_id = ve.copropiedad_id AND vi.id = ve.vivienda_id
          WHERE ve.copropiedad_id = $1 AND ve.placa = $2 AND ve.estado = 'activo'
          LIMIT 1`,
        [copropiedadId, placa.valor],
      );
      const f = rows[0];
      if (f === undefined) return null;
      return {
        vehiculoId: f.vehiculo_id,
        viviendaId: f.vivienda_id,
        viviendaActiva: f.vivienda_estado === 'activo',
        viviendaDesactivadaEn: f.desactivado_en,
        personaId: f.persona_id,
        registradoEn: f.creado_en,
      };
    });
  }

  async registrarVehiculo(alta: AltaVehiculo): Promise<ResultadoRegistroVehiculo> {
    return this.conContexto(async (c) => {
      try {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO public.vehiculos
             (copropiedad_id, vivienda_id, persona_id, placa, marca, modelo, color,
              creado_por, actualizado_por, tipo)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9)
           RETURNING id`,
          [
            alta.copropiedadId,
            alta.viviendaId,
            alta.personaId,
            alta.placa.valor,
            alta.marca ?? null,
            alta.modelo ?? null,
            alta.color ?? null,
            alta.actorId,
            alta.tipo ?? 'automovil',
          ],
        );
        return { tipo: 'registrado', id: rows[0]!.id };
      } catch (e) {
        if (
          typeof e === 'object' &&
          e !== null &&
          (e as { code?: string }).code === VIOLACION_UNICA
        ) {
          return { tipo: 'placa_activa_duplicada' };
        }
        throw e;
      }
    });
  }

  async registrarVivienda(alta: AltaVivienda): Promise<ResultadoAltaVivienda> {
    return this.conContexto(async (c) => {
      try {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO public.viviendas
             (copropiedad_id, identificador, agrupacion, creado_por, actualizado_por)
           VALUES ($1,$2,$3,$4,$4)
           RETURNING id`,
          [alta.copropiedadId, alta.identificador, alta.agrupacion ?? null, alta.actorId],
        );
        return { tipo: 'registrada', id: rows[0]!.id };
      } catch (e) {
        if (
          typeof e === 'object' &&
          e !== null &&
          (e as { code?: string }).code === VIOLACION_UNICA
        ) {
          // `viviendas_identificador_uk` es parcial sobre `estado='activo'` y
          // COMPUESTO desde la 0029: un identificador reutilizado tras una baja
          // NO choca —deliberado, RN-19— y el 101 de la Torre 1 no choca con el
          // de la Torre 2. Aquí solo llega el choque con una vivienda viva del
          // mismo par.
          return { tipo: 'identificador_duplicado' };
        }
        throw e;
      }
    });
  }

  /**
   * Los totales salen de la MISMA consulta que las filas, con `count(*) OVER ()`
   * filtrado por estado. Traerlos aparte abriría una ventana en la que la lista
   * y el contador se contradicen —«3 activas» sobre una tabla de 4—, y ese
   * desajuste no lo ve nadie hasta que alguien lo cuenta a mano.
   *
   * Los conteos de residentes, vehículos y autorizaciones vigentes van por
   * subconsulta escalar y no por `JOIN` + `GROUP BY`: con tres agregados sobre
   * tablas distintas, el `JOIN` multiplica filas y los tres conteos salen mal a
   * la vez, cada uno por el cardinal del otro.
   */
  async listarViviendas(
    copropiedadId: string,
    filtro: FiltroDeViviendas,
  ): Promise<{
    readonly totales: TotalesDePadron;
    readonly viviendas: readonly ViviendaEnLista[];
  }> {
    return this.conContexto(async (c) => {
      const busqueda = (filtro.busqueda ?? '').trim();
      const { rows } = await c.query<{
        id: string;
        identificador: string;
        agrupacion: string | null;
        estado: 'activo' | 'inactivo';
        estado_administrativo: string;
        residentes: string;
        vehiculos: string;
        autorizaciones_vigentes: string;
        desactivado_en: Date | null;
        motivo_desactivacion: string | null;
        total_activas: string;
        total_inactivas: string;
      }>(
        `SELECT v.id, v.identificador, v.agrupacion, v.estado,
                v.estado_administrativo::text AS estado_administrativo,
                v.desactivado_en, v.motivo_desactivacion,
                (SELECT count(*) FROM public.residentes r
                  WHERE r.copropiedad_id = v.copropiedad_id AND r.vivienda_id = v.id
                    AND r.estado = 'activo')::text AS residentes,
                (SELECT count(*) FROM public.vehiculos ve
                  WHERE ve.copropiedad_id = v.copropiedad_id AND ve.vivienda_id = v.id
                    AND ve.estado = 'activo')::text AS vehiculos,
                (SELECT count(*) FROM public.autorizaciones a
                  WHERE a.copropiedad_id = v.copropiedad_id AND a.vivienda_id = v.id
                    AND a.estado = 'activa' AND upper(a.vigencia) > now())::text
                  AS autorizaciones_vigentes,
                (SELECT count(*) FROM public.viviendas t
                  WHERE t.copropiedad_id = $1 AND t.estado = 'activo')::text AS total_activas,
                (SELECT count(*) FROM public.viviendas t
                  WHERE t.copropiedad_id = $1 AND t.estado = 'inactivo')::text AS total_inactivas
           FROM public.viviendas v
          WHERE v.copropiedad_id = $1
            AND ($2::text IS NULL OR v.estado::text = $2)
            AND ($3::text = '' OR v.identificador ILIKE '%' || $3 || '%'
                              OR coalesce(v.agrupacion, '') ILIKE '%' || $3 || '%'
                              OR coalesce(v.agrupacion, '') || ' ' || v.identificador
                                   ILIKE '%' || $3 || '%')
          -- Por agrupación primero y por número DENTRO de ella: el directorio
          -- se pinta agrupado, y un orden alfabético puro pondría el 1000 antes
          -- del 101. Las viviendas sin agrupación quedan al final.
          ORDER BY coalesce(v.agrupacion, '~~~'),
                   nullif(regexp_replace(v.identificador, '[^0-9]', '', 'g'), '')::bigint
                     NULLS LAST,
                   v.identificador
          LIMIT 500`,
        [copropiedadId, filtro.estado ?? null, busqueda],
      );

      // Los totales son de la COPROPIEDAD, no de la página: se leen aunque el
      // filtro no devuelva ninguna fila, que es justo cuando hacen falta.
      const totales =
        rows[0] === undefined
          ? await this.totalesDeViviendas(c, copropiedadId)
          : {
              activas: Number(rows[0].total_activas),
              inactivas: Number(rows[0].total_inactivas),
            };

      return {
        totales,
        viviendas: rows.map((f) => ({
          id: f.id,
          identificador: f.identificador,
          agrupacion: f.agrupacion,
          estado: f.estado,
          estadoAdministrativo: f.estado_administrativo,
          residentes: Number(f.residentes),
          vehiculos: Number(f.vehiculos),
          autorizacionesVigentes: Number(f.autorizaciones_vigentes),
          desactivadaEn: f.desactivado_en === null ? null : f.desactivado_en.toISOString(),
          motivoDesactivacion: f.motivo_desactivacion,
        })),
      };
    });
  }

  private async totalesDeViviendas(c: PoolClient, copropiedadId: string): Promise<TotalesDePadron> {
    const { rows } = await c.query<{ activas: string; inactivas: string }>(
      `SELECT count(*) FILTER (WHERE estado='activo')::text   AS activas,
              count(*) FILTER (WHERE estado='inactivo')::text AS inactivas
         FROM public.viviendas WHERE copropiedad_id = $1`,
      [copropiedadId],
    );
    return {
      activas: Number(rows[0]?.activas ?? '0'),
      inactivas: Number(rows[0]?.inactivas ?? '0'),
    };
  }

  async listarVehiculos(copropiedadId: string): Promise<readonly VehiculoEnLista[]> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{
        id: string;
        placa: string;
        marca: string | null;
        modelo: string | null;
        color: string | null;
        tipo: TipoDeVehiculo;
        estado: 'activo' | 'inactivo';
        vivienda_id: string;
        vivienda_identificador: string;
        propietario_id: string | null;
        propietario_nombre: string | null;
      }>(
        `SELECT ve.id, ve.placa, ve.marca, ve.modelo, ve.color, ve.tipo::text AS tipo,
                ve.estado, ve.vivienda_id,
                vi.identificador AS vivienda_identificador,
                ve.persona_id AS propietario_id,
                p.nombre_completo AS propietario_nombre
           FROM public.vehiculos ve
           JOIN public.viviendas vi
             ON vi.copropiedad_id = ve.copropiedad_id AND vi.id = ve.vivienda_id
           LEFT JOIN public.personas p
             ON p.copropiedad_id = ve.copropiedad_id AND p.id = ve.persona_id
          WHERE ve.copropiedad_id = $1
          ORDER BY ve.estado, ve.placa
          LIMIT 500`,
        [copropiedadId],
      );
      return rows.map((f) => ({
        id: f.id,
        placa: f.placa,
        marca: f.marca,
        modelo: f.modelo,
        color: f.color,
        tipo: f.tipo,
        estado: f.estado,
        viviendaId: f.vivienda_id,
        viviendaIdentificador: f.vivienda_identificador,
        propietarioId: f.propietario_id,
        propietarioNombre: f.propietario_nombre,
      }));
    });
  }

  async desactivarVehiculo(
    copropiedadId: string,
    vehiculoId: string,
    motivo: string,
    actorId: string,
  ): Promise<boolean> {
    return this.conContexto(async (c) => {
      // Baja LÓGICA (RN-19). No existe `DELETE` en este adaptador, y no es un
      // olvido: la migración 0015 revoca `DELETE` a todos los roles, así que
      // escribirlo produciría un fallo de permisos en vez de un borrado.
      const { rowCount } = await c.query(
        `UPDATE public.vehiculos
            SET estado='inactivo', desactivado_en=now(), desactivado_por=$4,
                motivo_desactivacion=$3, actualizado_por=$4
          WHERE copropiedad_id=$1 AND id=$2 AND estado='activo'`,
        [copropiedadId, vehiculoId, motivo, actorId],
      );
      return (rowCount ?? 0) > 0;
    });
  }

  /**
   * Búsqueda de personas por nombre o por documento (D-72).
   *
   * `unaccent` no está disponible como extensión garantizada, así que la
   * insensibilidad a la tilde se resuelve con `ILIKE` sobre el texto tal cual
   * MÁS la coincidencia exacta por documento normalizado, que es el camino que
   * de verdad desambigua. El `LIMIT` llega del caso de uso: un buscador
   * incremental sin tope descarga el padrón letra a letra.
   *
   * El `LEFT JOIN` lateral trae la vivienda de la que la persona es residente
   * activa. Sin él, dos homónimos son indistinguibles en la lista y quien
   * autoriza elige a ciegas — que es la misma clase de defecto que pedir el
   * UUID, solo que más difícil de ver.
   */
  async buscarPersonas(
    copropiedadId: string,
    texto: string,
    documentoNormalizado: string,
    limite: number,
  ): Promise<readonly PersonaEnLista[]> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{
        id: string;
        nombre_completo: string;
        tipo_documento: TipoDeDocumento;
        numero_documento: string;
        es_residente: boolean;
        vivienda_identificador: string | null;
      }>(
        `SELECT p.id,
                p.nombre_completo,
                p.tipo_documento,
                p.numero_documento,
                (r.id IS NOT NULL)   AS es_residente,
                v.identificador      AS vivienda_identificador
           FROM public.personas p
           LEFT JOIN LATERAL (
                SELECT r.id, r.vivienda_id
                  FROM public.residentes r
                 WHERE r.persona_id = p.id
                   AND r.copropiedad_id = p.copropiedad_id
                   AND r.estado = 'activo'
                 LIMIT 1
           ) r ON true
           LEFT JOIN public.viviendas v ON v.id = r.vivienda_id
          WHERE p.copropiedad_id = $1
            AND p.estado = 'activo'
            AND (
                  p.nombre_completo ILIKE '%' || $2 || '%'
                  OR ($3 <> '' AND p.numero_documento LIKE $3 || '%')
                )
          ORDER BY p.nombre_completo
          LIMIT $4`,
        [copropiedadId, texto, documentoNormalizado, limite],
      );
      return rows.map((f) => ({
        id: f.id,
        nombreCompleto: f.nombre_completo,
        tipoDocumento: f.tipo_documento,
        numeroDocumento: f.numero_documento,
        esResidente: f.es_residente,
        viviendaIdentificador: f.vivienda_identificador,
      }));
    });
  }

  /**
   * Alta de persona. **Sin `SELECT` previo** (ADR-04): el índice único parcial
   * `personas_documento_uk` decide, y si ya había alguien con ese documento
   * activo se devuelve ESA persona en vez de crear una segunda. El documento es
   * la identidad (RN-06); duplicarla es justo la fuga que `personas` cerró.
   */
  async registrarPersona(alta: AltaPersona): Promise<ResultadoAltaPersona> {
    return this.conContexto(async (c) => {
      const insertada = await c.query<{ id: string; nombre_completo: string }>(
        `INSERT INTO public.personas
           (copropiedad_id, tipo_documento, numero_documento, nombre_completo,
            telefono, correo, creado_por, actualizado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
         ON CONFLICT (copropiedad_id, tipo_documento, numero_documento)
           WHERE estado = 'activo'
           DO NOTHING
         RETURNING id, nombre_completo`,
        [
          alta.copropiedadId,
          alta.documento.tipo,
          alta.documento.numero,
          alta.nombreCompleto,
          alta.telefono ?? null,
          alta.correo ?? null,
          alta.actorId,
        ],
      );
      const nueva = insertada.rows[0];
      if (nueva !== undefined) {
        return { tipo: 'registrada', id: nueva.id, nombreCompleto: nueva.nombre_completo };
      }

      // `DO NOTHING` no devuelve fila: la persona ya estaba. Se lee la que hay
      // —con su nombre real, que puede no ser el que acaban de teclear— para
      // que la consola pueda DECIRLO en vez de fingir que creó algo.
      const { rows } = await c.query<{ id: string; nombre_completo: string }>(
        `SELECT id, nombre_completo
           FROM public.personas
          WHERE copropiedad_id = $1
            AND tipo_documento = $2
            AND numero_documento = $3
            AND estado = 'activo'
          LIMIT 1`,
        [alta.copropiedadId, alta.documento.tipo, alta.documento.numero],
      );
      const existente = rows[0];
      if (existente === undefined) {
        // Solo llega aquí si la RLS ocultó la fila que el índice sí vio: es una
        // condición de aislamiento, no un duplicado, y callarla la escondería.
        throw new Error('No se pudo resolver la persona tras el conflicto de documento');
      }
      return { tipo: 'ya_existia', id: existente.id, nombreCompleto: existente.nombre_completo };
    });
  }

  /**
   * Solo viviendas ACTIVAS, que es lo que garantiza el índice único parcial: si
   * también mirara las inactivas, «Casa 12» podría resolver a una vivienda dada
   * de baja y la carga colgaría residentes de un registro histórico.
   */
  async buscarViviendaPorIdentificador(
    copropiedadId: string,
    agrupacion: string | null,
    identificador: string,
  ): Promise<{ readonly id: string } | null> {
    return this.conContexto(async (c) => {
      // `coalesce` a los dos lados, igual que el índice: comparar contra NULL
      // con `=` no devuelve nunca verdadero, así que sin esto una parcelación
      // sin secciones no encontraría ninguna de sus casas.
      const { rows } = await c.query<{ id: string }>(
        `SELECT id FROM public.viviendas
          WHERE copropiedad_id = $1
            AND coalesce(agrupacion, '') = coalesce($2::text, '')
            AND identificador = $3
            AND estado = 'activo'
          LIMIT 1`,
        [copropiedadId, agrupacion, identificador],
      );
      const fila = rows[0];
      return fila === undefined ? null : { id: fila.id };
    });
  }

  /**
   * Las del plan que YA existen activas. Lectura para informar a la vista
   * previa; la garantía sigue siendo el índice (ADR-04).
   */
  async viviendasExistentes(
    copropiedadId: string,
    viviendas: readonly ViviendaProyectada[],
  ): Promise<readonly ViviendaProyectada[]> {
    if (viviendas.length === 0) return [];
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{ agrupacion: string | null; identificador: string }>(
        `SELECT v.agrupacion, v.identificador
           FROM public.viviendas v
           JOIN unnest($2::text[], $3::text[]) AS p(agrupacion, identificador)
             ON coalesce(v.agrupacion, '') = p.agrupacion
            AND v.identificador = p.identificador
          WHERE v.copropiedad_id = $1 AND v.estado = 'activo'`,
        [
          copropiedadId,
          viviendas.map((v) => v.agrupacion ?? ''),
          viviendas.map((v) => v.identificador),
        ],
      );
      return rows.map((f) => ({ agrupacion: f.agrupacion, identificador: f.identificador }));
    });
  }

  /**
   * **El padrón entero en UNA sentencia, sin `SELECT` previo.**
   *
   * `ON CONFLICT … DO NOTHING` deja que el índice decida vivienda a vivienda, y
   * `RETURNING` dice cuáles entraron. Si entraron menos de las pedidas, la
   * diferencia ES la lista de colisiones: se calcula restando, no consultando,
   * y la transacción se revierte entera. Así el operador recibe TODAS las que
   * chocaron —no la primera— y no queda media generación aplicada.
   *
   * El rastro va en la MISMA transacción, por el mismo motivo que en el cambio
   * de configuración (§2.7.8): si se escribiera después, una caída entre las
   * dos dejaría 300 viviendas sin constancia de quién las creó ni con qué plan.
   */
  async generarViviendas(generacion: GeneracionDeViviendas): Promise<ResultadoDeGeneracion> {
    const { copropiedadId, viviendas, actorId } = generacion;
    if (viviendas.length === 0) return { creadas: 0, colisiones: [] };

    const cliente = await this.pool.connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(this.claims),
      ]);
      await cliente.query('BEGIN');
      try {
        const modo = generacion.modo ?? 'estricto';
        let reactivadas = 0;
        if (modo === 'sobrescribir') {
          /**
           * O3 · «sobrescribir» sólo escribe encima de lo que RN-19 permite: el
           * estado de baja. Una vivienda inactiva cuya identidad está en el
           * plan vuelve a estar activa —con su historial intacto— y así la
           * inserción de abajo la encuentra como colisión y la conserva.
           */
          const { rowCount } = await cliente.query(
            `UPDATE public.viviendas v
                SET estado = 'activo', desactivado_en = NULL, desactivado_por = NULL,
                    motivo_desactivacion = NULL, actualizado_en = now(), actualizado_por = $4
               FROM unnest($2::text[], $3::text[]) AS p(agrupacion, identificador)
              WHERE v.copropiedad_id = $1 AND v.estado = 'inactivo'
                AND coalesce(v.agrupacion, '') = p.agrupacion
                AND v.identificador = p.identificador
                AND NOT EXISTS (SELECT 1 FROM public.viviendas a
                                 WHERE a.copropiedad_id = v.copropiedad_id AND a.estado = 'activo'
                                   AND coalesce(a.agrupacion, '') = p.agrupacion
                                   AND a.identificador = p.identificador)`,
            [
              copropiedadId,
              viviendas.map((v) => v.agrupacion ?? ''),
              viviendas.map((v) => v.identificador),
              actorId,
            ],
          );
          reactivadas = rowCount ?? 0;
        }

        const { rows } = await cliente.query<{ agrupacion: string | null; identificador: string }>(
          `INSERT INTO public.viviendas
             (copropiedad_id, agrupacion, identificador, creado_por, actualizado_por)
           SELECT $1, nullif(p.agrupacion, ''), p.identificador, $4, $4
             FROM unnest($2::text[], $3::text[]) AS p(agrupacion, identificador)
           ON CONFLICT (copropiedad_id, coalesce(agrupacion, ''), identificador)
             WHERE estado = 'activo'
           DO NOTHING
           RETURNING agrupacion, identificador`,
          [
            copropiedadId,
            viviendas.map((v) => v.agrupacion ?? ''),
            viviendas.map((v) => v.identificador),
            actorId,
          ],
        );

        const entraron = new Set(
          rows.map((f) => JSON.stringify([f.agrupacion ?? '', f.identificador])),
        );
        const colisiones = viviendas.filter(
          (v) => !entraron.has(JSON.stringify([v.agrupacion ?? '', v.identificador])),
        );
        if (colisiones.length > 0 && modo === 'estricto') {
          await cliente.query('ROLLBACK');
          return { creadas: 0, colisiones };
        }

        await cliente.query(
          `INSERT INTO public.auditoria_seguridad
             (copropiedad_id_actor, copropiedad_id_objetivo, usuario_id, tipo,
              recurso, identificador_solicitado, resultado, creado_por)
           VALUES ($1, $1, $2, 'generacion_de_padron', $3, $4, 'permitido', $2)`,
          [
            copropiedadId,
            actorId,
            `copropiedades/${copropiedadId}/padron/viviendas/generacion`,
            generacion.resumenDelPlan.slice(0, 300),
          ],
        );

        await cliente.query('COMMIT');
        return { creadas: rows.length, colisiones, reactivadas };
      } catch (e) {
        await cliente.query('ROLLBACK');
        throw e;
      }
    } finally {
      cliente.release();
    }
  }

  // ═══════════════════════════ O3 · edición y borrado ═══════════════════════
  async editarVivienda(edicion: EdicionDeVivienda): Promise<ResultadoEdicionVivienda> {
    return this.conContexto(async (c) => {
      try {
        const { rowCount } = await c.query(
          `UPDATE public.viviendas
              SET identificador = COALESCE($3, identificador),
                  agrupacion = CASE WHEN $4::boolean THEN nullif($5, '') ELSE agrupacion END,
                  estado_administrativo = COALESCE($6::estado_administrativo, estado_administrativo),
                  actualizado_en = now(), actualizado_por = $7
            WHERE copropiedad_id = $1 AND id = $2`,
          [
            edicion.copropiedadId,
            edicion.viviendaId,
            edicion.identificador ?? null,
            edicion.agrupacion !== undefined,
            edicion.agrupacion ?? '',
            edicion.estadoAdministrativo ?? null,
            edicion.actorId,
          ],
        );
        return (rowCount ?? 0) > 0 ? { tipo: 'editada' } : { tipo: 'no_encontrada' };
      } catch (e) {
        if ((e as { code?: string }).code === VIOLACION_UNICA) {
          return { tipo: 'identificador_duplicado' };
        }
        throw e;
      }
    });
  }

  async editarVehiculo(edicion: EdicionDeVehiculo): Promise<ResultadoEdicionVehiculo> {
    return this.conContexto(async (c) => {
      try {
        const { rowCount } = await c.query(
          `UPDATE public.vehiculos
              SET placa = COALESCE($3, placa),
                  persona_id = CASE WHEN $4::boolean THEN $5::uuid ELSE persona_id END,
                  marca = CASE WHEN $6::boolean THEN $7 ELSE marca END,
                  modelo = CASE WHEN $8::boolean THEN $9 ELSE modelo END,
                  color = CASE WHEN $10::boolean THEN $11 ELSE color END,
                  tipo = COALESCE($12::tipo_vehiculo, tipo),
                  actualizado_en = now(), actualizado_por = $13
            WHERE copropiedad_id = $1 AND id = $2`,
          [
            edicion.copropiedadId,
            edicion.vehiculoId,
            edicion.placa?.valor ?? null,
            edicion.personaId !== undefined,
            edicion.personaId ?? null,
            edicion.marca !== undefined,
            edicion.marca ?? null,
            edicion.modelo !== undefined,
            edicion.modelo ?? null,
            edicion.color !== undefined,
            edicion.color ?? null,
            edicion.tipo ?? null,
            edicion.actorId,
          ],
        );
        return (rowCount ?? 0) > 0 ? { tipo: 'editado' } : { tipo: 'no_encontrado' };
      } catch (e) {
        if ((e as { code?: string }).code === VIOLACION_UNICA) {
          return { tipo: 'placa_activa_duplicada' };
        }
        throw e;
      }
    });
  }

  async historialDeVehiculo(
    copropiedadId: string,
    vehiculoId: string,
  ): Promise<HistorialDeVehiculo | null> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{ placa: string; eventos: string; autorizaciones: string }>(
        `SELECT ve.placa,
                (SELECT count(*) FROM public.eventos e
                  WHERE e.copropiedad_id = ve.copropiedad_id AND e.placa_detectada = ve.placa)::text AS eventos,
                (SELECT count(*) FROM public.autorizaciones a
                  WHERE a.copropiedad_id = ve.copropiedad_id AND a.placa = ve.placa)::text AS autorizaciones
           FROM public.vehiculos ve
          WHERE ve.copropiedad_id = $1 AND ve.id = $2`,
        [copropiedadId, vehiculoId],
      );
      const f = rows[0];
      if (f === undefined) return null;
      return {
        placa: f.placa,
        eventos: Number(f.eventos),
        autorizaciones: Number(f.autorizaciones),
      };
    });
  }

  async borrarVehiculoDefinitivamente(
    copropiedadId: string,
    vehiculoId: string,
    actorId: string,
  ): Promise<{ borrado: boolean; motivo?: string }> {
    return this.conContexto(async (c) => {
      try {
        await c.query('SELECT app.borrar_vehiculo_definitivamente($1, $2, $3)', [
          copropiedadId,
          vehiculoId,
          actorId,
        ]);
        return { borrado: true };
      } catch (e) {
        const codigo = (e as { code?: string }).code;
        if (codigo === '2BP01' || codigo === '23001' || codigo === 'P0002') {
          return { borrado: false, motivo: (e as Error).message };
        }
        throw e;
      }
    });
  }

  /**
   * El padrón, en las columnas del archivo del administrador. Una fila por
   * vínculo —vehículo o residente— y una fila suelta por vivienda vacía, para
   * que el archivo exportado describa el padrón entero y no solo su parte
   * poblada.
   */
  async exportarPadron(copropiedadId: string): Promise<readonly FilaExportada[]> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{
        identificador: string;
        agrupacion: string | null;
        documento: string | null;
        tipo_documento: string | null;
        nombre: string | null;
        placa: string | null;
        es_titular: boolean | null;
      }>(
        `WITH vinculos AS (
           SELECT v.identificador, v.agrupacion,
                  p.numero_documento AS documento, p.tipo_documento::text AS tipo_documento,
                  p.nombre_completo AS nombre, NULL::text AS placa, r.es_titular
             FROM public.viviendas v
             JOIN public.residentes r
               ON r.copropiedad_id = v.copropiedad_id AND r.vivienda_id = v.id
              AND r.estado = 'activo'
             JOIN public.personas p
               ON p.copropiedad_id = v.copropiedad_id AND p.id = r.persona_id
            WHERE v.copropiedad_id = $1 AND v.estado = 'activo'
           UNION ALL
           SELECT v.identificador, v.agrupacion,
                  p.numero_documento, p.tipo_documento::text,
                  p.nombre_completo, ve.placa, NULL::boolean
             FROM public.viviendas v
             JOIN public.vehiculos ve
               ON ve.copropiedad_id = v.copropiedad_id AND ve.vivienda_id = v.id
              AND ve.estado = 'activo'
             LEFT JOIN public.personas p
               ON p.copropiedad_id = v.copropiedad_id AND p.id = ve.persona_id
            WHERE v.copropiedad_id = $1 AND v.estado = 'activo'
           UNION ALL
           -- La vivienda sin residentes ni vehículos también sale: una fila con
           -- solo el identificador significa «esta casa existe y está vacía», y
           -- la carga la lee exactamente así.
           SELECT v.identificador, v.agrupacion, NULL, NULL, NULL, NULL, NULL
             FROM public.viviendas v
            WHERE v.copropiedad_id = $1 AND v.estado = 'activo'
              AND NOT EXISTS (SELECT 1 FROM public.residentes r
                               WHERE r.vivienda_id = v.id AND r.estado = 'activo')
              AND NOT EXISTS (SELECT 1 FROM public.vehiculos ve
                               WHERE ve.vivienda_id = v.id AND ve.estado = 'activo')
         )
         SELECT * FROM vinculos
          ORDER BY coalesce(agrupacion, '~~~'),
                   nullif(regexp_replace(identificador, '[^0-9]', '', 'g'), '')::bigint NULLS LAST,
                   identificador, documento NULLS FIRST, placa NULLS FIRST
          LIMIT 10000`,
        [copropiedadId],
      );
      return rows.map((f) => ({
        identificador: f.identificador,
        agrupacion: f.agrupacion,
        documento: f.documento,
        tipoDocumento: f.tipo_documento,
        nombre: f.nombre,
        placa: f.placa,
        esTitular: f.es_titular,
      }));
    });
  }

  async registrarResidente(alta: AltaResidente): Promise<{ id: string } | null> {
    return this.conContexto(async (c) => {
      try {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO public.residentes
             (copropiedad_id, vivienda_id, persona_id, es_titular, parentesco,
              creado_por, actualizado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$6)
           RETURNING id`,
          [
            alta.copropiedadId,
            alta.viviendaId,
            alta.personaId,
            alta.esTitular,
            alta.parentesco ?? null,
            alta.actorId,
          ],
        );
        return { id: rows[0]!.id };
      } catch (e) {
        if (
          typeof e === 'object' &&
          e !== null &&
          (e as { code?: string }).code === VIOLACION_UNICA
        ) {
          return null;
        }
        throw e;
      }
    });
  }

  async desactivarVivienda(
    copropiedadId: string,
    viviendaId: string,
    motivo: string,
    actorId: string,
  ): Promise<boolean> {
    return this.conContexto(async (c) => {
      const { rowCount } = await c.query(
        `UPDATE public.viviendas
            SET estado='inactivo', desactivado_en=now(), desactivado_por=$4,
                motivo_desactivacion=$3, actualizado_por=$4
          WHERE copropiedad_id=$1 AND id=$2 AND estado='activo'`,
        [copropiedadId, viviendaId, motivo, actorId],
      );
      return (rowCount ?? 0) > 0;
    });
  }

  async reactivarVivienda(
    copropiedadId: string,
    viviendaId: string,
    actorId: string,
  ): Promise<boolean> {
    return this.conContexto(async (c) => {
      const { rowCount } = await c.query(
        `UPDATE public.viviendas
            SET estado='activo', desactivado_en=NULL, desactivado_por=NULL,
                motivo_desactivacion=NULL, actualizado_por=$3
          WHERE copropiedad_id=$1 AND id=$2 AND estado='inactivo'`,
        [copropiedadId, viviendaId, actorId],
      );
      return (rowCount ?? 0) > 0;
    });
  }

  async historialDeVivienda(
    copropiedadId: string,
    viviendaId: string,
  ): Promise<HistorialDeVivienda | null> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{
        identificador: string;
        residentes: string;
        vehiculos: string;
        autorizaciones: string;
        eventos: string;
      }>(
        `SELECT v.identificador,
                (SELECT count(*) FROM public.residentes     r WHERE r.vivienda_id = v.id)::text AS residentes,
                (SELECT count(*) FROM public.vehiculos      x WHERE x.vivienda_id = v.id)::text AS vehiculos,
                (SELECT count(*) FROM public.autorizaciones a WHERE a.vivienda_id = v.id)::text AS autorizaciones,
                (SELECT count(*) FROM public.eventos        e WHERE e.vivienda_id = v.id)::text AS eventos
           FROM public.viviendas v
          WHERE v.copropiedad_id = $1 AND v.id = $2`,
        [copropiedadId, viviendaId],
      );
      const f = rows[0];
      if (f === undefined) return null;
      return {
        identificador: f.identificador,
        residentes: Number(f.residentes),
        vehiculos: Number(f.vehiculos),
        autorizaciones: Number(f.autorizaciones),
        eventos: Number(f.eventos),
      };
    });
  }

  /**
   * El borrado NO se hace con un `DELETE` desde aquí, y no es rodeo: ni
   * `authenticated` ni `service_role` tienen el privilegio (migración 0015,
   * D-20). Pasa por una función `SECURITY DEFINER` que vuelve a comprobar la
   * copropiedad, vuelve a comprobar el historial y escribe el rastro en la
   * MISMA transacción que el borrado. El disparador de `viviendas` sigue en
   * pie y alcanza también al dueño de la tabla: si esta función se equivocara,
   * la base seguiría negándose.
   */
  async borrarViviendaDefinitivamente(
    copropiedadId: string,
    viviendaId: string,
    actorId: string,
  ): Promise<{ borrada: boolean; motivo?: string }> {
    return this.conContexto(async (c) => {
      try {
        await c.query('SELECT app.borrar_vivienda_definitivamente($1, $2, $3)', [
          copropiedadId,
          viviendaId,
          actorId,
        ]);
        return { borrada: true };
      } catch (e) {
        const codigo = (e as { code?: string }).code;
        // `restrict_violation` es la negativa por historial; `no_data_found`,
        // la vivienda que no existe en esta copropiedad. Cualquier otra cosa
        // es un fallo de verdad y sube.
        if (codigo === '2BP01' || codigo === '23001' || codigo === 'P0002') {
          return { borrada: false, motivo: (e as Error).message };
        }
        throw e;
      }
    });
  }

  async contarVehiculosActivos(copropiedadId: string, placa: Placa): Promise<number> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM public.vehiculos
          WHERE copropiedad_id=$1 AND placa=$2 AND estado='activo'`,
        [copropiedadId, placa.valor],
      );
      return Number(rows[0]?.n ?? '0');
    });
  }

  /**
   * Carga transaccional: o entra el padrón entero o no entra nada. Una carga a
   * medias deja al administrador sin saber qué filas quedaron dentro, y
   * reintentar duplicaría las que sí pasaron.
   */
  async enTransaccion<T>(operacion: (repo: RepositorioPadron) => Promise<T>): Promise<T> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(this.claims),
      ]);
      await cliente.query('BEGIN');
      const resultado = await operacion(new RepositorioPadronPg(this.pool, this.claims, cliente));
      await cliente.query('COMMIT');
      return resultado;
    } catch (e) {
      await cliente.query('ROLLBACK');
      throw e;
    } finally {
      cliente.release();
    }
  }
}
