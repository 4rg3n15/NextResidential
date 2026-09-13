import type { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { Injectable } from '@nestjs/common';
import type {
  AltaPersona,
  AltaResidente,
  AltaVehiculo,
  AltaVivienda,
  FiltroDeViviendas,
  PersonaEnLista,
  RepositorioPadron,
  ResultadoAltaPersona,
  ResultadoAltaVivienda,
  ResultadoRegistroVehiculo,
  TipoDeVehiculo,
  TotalesDePadron,
  VehiculoEnLista,
  ViviendaEnLista,
} from '../aplicacion/puertos';
import type { Placa, TipoDeDocumento } from '@ncr/domain-core';

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
             (copropiedad_id, identificador, manzana, direccion, creado_por, actualizado_por)
           VALUES ($1,$2,$3,$4,$5,$5)
           RETURNING id`,
          [
            alta.copropiedadId,
            alta.identificador,
            alta.manzana ?? null,
            alta.direccion ?? null,
            alta.actorId,
          ],
        );
        return { tipo: 'registrada', id: rows[0]!.id };
      } catch (e) {
        if (
          typeof e === 'object' &&
          e !== null &&
          (e as { code?: string }).code === VIOLACION_UNICA
        ) {
          // `viviendas_identificador_uk` es parcial sobre `estado='activo'`: un
          // identificador reutilizado tras una baja NO choca, y eso es
          // deliberado (RN-19). Aquí solo llega el choque con una vivienda viva.
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
        manzana: string | null;
        direccion: string | null;
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
        `SELECT v.id, v.identificador, v.manzana, v.direccion, v.estado,
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
                              OR coalesce(v.manzana, '') ILIKE '%' || $3 || '%'
                              OR coalesce(v.direccion, '') ILIKE '%' || $3 || '%')
          ORDER BY v.identificador
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
          manzana: f.manzana,
          direccion: f.direccion,
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
    identificador: string,
  ): Promise<{ readonly id: string } | null> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `SELECT id FROM public.viviendas
          WHERE copropiedad_id = $1 AND identificador = $2 AND estado = 'activo'
          LIMIT 1`,
        [copropiedadId, identificador],
      );
      const fila = rows[0];
      return fila === undefined ? null : { id: fila.id };
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
