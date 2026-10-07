import type { Pool, PoolClient } from 'pg';
import type {
  AltaDelResidente,
  EstadoDeAltaGuardado,
  PlazaDeOcupante,
  VinculoEscrito,
  VinculoPedido,
  ViviendaEncontrada,
  VocabularioDeAlta,
} from '../aplicacion/puertos-hogar';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import { Deshacer, comoServicio, deshaciendo, violacion } from './con-identidad';
import { personaDeLaCuenta, residenteEnLaVivienda } from './persona-del-residente-pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ALTA DEL RESIDENTE CONTRA POSTGRESQL · ETAPA 15-I (3.2, D6) · RONDA 15-W
 *
 * Lecturas del alta (vocabulario, estado, búsqueda de vivienda, intentos) y el
 * CAMBIO DE VIVIENDA con código (3.5). Desde la 15-W ya no hay «primer
 * residente»: la cuenta del titular la crea la administración con su vivienda
 * (D1) y las demás nacen atadas a su plaza (D2); el primer ingreso las vincula
 * en `primer-ingreso-pg.ts`.
 *
 * La vinculación va dentro de una transacción con un BLOQUEO POR VIVIENDA, y la
 * plaza sólo la ocupa quien la toma LIBRE —sin cuenta y sin persona— y en su
 * generación: la base decide (ADR-04). La persona y el residente se resuelven
 * en `persona-del-residente-pg.ts`, compartido con el primer ingreso.
 * ═════════════════════════════════════════════════════════════════════════════
 */
// La vivienda «tiene cuenta» —y por tanto titular— si alguien con cuenta activa
// vive en ella, o si la administración ya le asignó su titular (15-W, D1) y
// éste aún no hizo su primer ingreso.
const SQL_TIENE_OTRA_CUENTA = `
  (EXISTS (SELECT 1 FROM public.residentes r
             JOIN public.usuarios u ON u.persona_id = r.persona_id AND u.estado = 'activo'
            WHERE r.vivienda_id = v.id AND r.estado = 'activo' AND u.id <> $2)
   OR EXISTS (SELECT 1 FROM public.ocupacion_de_viviendas o
                JOIN public.usuarios u ON u.id = o.primer_residente_id AND u.estado = 'activo'
               WHERE o.vivienda_id = v.id AND u.id <> $2))`;

/** D-W10 · el tope vigente de la vivienda: el suyo, o el de su copropiedad. */
export const topeDe = async (c: PoolClient, viviendaId: string): Promise<number | null> => {
  const { rows } = await c.query<{ tope: number }>(
    `SELECT coalesce(v.tope_de_plazas, c.tope_de_plazas_por_vivienda)::int AS tope
       FROM public.viviendas v JOIN public.copropiedades c ON c.id = v.copropiedad_id
      WHERE v.id = $1`,
    [viviendaId],
  );
  return rows[0]?.tope ?? null;
};

export class AltaDelResidentePg implements AltaDelResidente {
  constructor(private readonly pool: Pool) {}

  async vocabulario(copropiedadId: string): Promise<VocabularioDeAlta | null> {
    return comoServicio(this.pool, copropiedadId, ACTOR_INGESTA, async (c) => {
      const { rows } = await c.query<{
        nombre: string;
        tipo: string | null;
        etiqueta_vivienda: string;
        etiqueta_agrupacion: string;
        codigo_corto: string | null;
      }>(
        `SELECT nombre, tipo::text AS tipo, etiqueta_vivienda, etiqueta_agrupacion,
                codigo_corto::text AS codigo_corto
           FROM public.copropiedades WHERE id = $1`,
        [copropiedadId],
      );
      const f = rows[0];
      return f === undefined
        ? null
        : {
            copropiedadNombre: f.nombre,
            tipo: f.tipo,
            etiquetaVivienda: f.etiqueta_vivienda,
            etiquetaAgrupacion: f.etiqueta_agrupacion,
            codigoCorto: f.codigo_corto,
          };
    });
  }

  async estado(copropiedadId: string, usuarioId: string): Promise<EstadoDeAltaGuardado> {
    return comoServicio(this.pool, copropiedadId, usuarioId, async (c) => {
      const { rows } = await c.query<{ vivienda_id: string; debe_declarar: boolean }>(
        `SELECT r.vivienda_id,
                EXISTS (SELECT 1 FROM public.ocupacion_de_viviendas o
                         WHERE o.vivienda_id = r.vivienda_id AND o.primer_residente_id = u.id
                           AND o.declarada_en IS NULL) AS debe_declarar
           FROM public.usuarios u
           JOIN public.residentes r ON r.persona_id = u.persona_id AND r.estado = 'activo'
                                   AND r.copropiedad_id = $1
          WHERE u.id = $2 AND u.estado = 'activo'
          ORDER BY r.es_titular DESC, r.creado_en ASC
          LIMIT 1`,
        [copropiedadId, usuarioId],
      );
      const f = rows[0];
      if (f !== undefined) {
        return {
          viviendaId: f.vivienda_id,
          debeDeclararOcupantes: f.debe_declarar,
          viviendaAsignada: null,
          topeDePlazas: await topeDe(c, f.vivienda_id),
        };
      }
      // 15-W (D3) · sin vínculo todavía: la vivienda que la cuenta YA trae.
      const { rows: asignada } = await c.query<{ vivienda_id: string; titular: boolean }>(
        `SELECT o.vivienda_id, true AS titular FROM public.ocupacion_de_viviendas o
           JOIN public.viviendas v ON v.id = o.vivienda_id AND v.estado = 'activo'
          WHERE o.copropiedad_id = $1 AND o.primer_residente_id = $2
         UNION ALL
         SELECT p.vivienda_id, false FROM public.plazas_de_ocupante p
           JOIN public.viviendas v ON v.id = p.vivienda_id AND v.estado = 'activo'
          WHERE p.copropiedad_id = $1 AND p.usuario_id = $2 AND p.estado = 'activo'
          ORDER BY titular DESC LIMIT 1`,
        [copropiedadId, usuarioId],
      );
      const a = asignada[0];
      return {
        viviendaId: null,
        debeDeclararOcupantes: false,
        viviendaAsignada:
          a === undefined ? null : { viviendaId: a.vivienda_id, comoTitular: a.titular },
        topeDePlazas: a === undefined ? null : await topeDe(c, a.vivienda_id),
      };
    });
  }

  async buscarVivienda(
    copropiedadId: string,
    usuarioId: string,
    identificador: string,
    agrupacion: string | null,
  ): Promise<readonly ViviendaEncontrada[]> {
    return comoServicio(this.pool, copropiedadId, usuarioId, async (c) => {
      const { rows } = await c.query<{ id: string; activa: boolean; tiene_cuenta: boolean }>(
        `SELECT v.id, v.estado = 'activo' AS activa, ${SQL_TIENE_OTRA_CUENTA} AS tiene_cuenta
           FROM public.viviendas v
          WHERE v.copropiedad_id = $1
            AND lower(btrim(v.identificador)) = lower(btrim($3))
            AND ($4::text IS NULL OR btrim($4) = ''
                 OR lower(btrim(coalesce(v.agrupacion, ''))) = lower(btrim($4)))
          ORDER BY v.estado = 'activo' DESC, v.creado_en DESC`,
        [copropiedadId, usuarioId, identificador, agrupacion],
      );
      const activas = rows.filter((f) => f.activa);
      const elegidas = activas.length > 0 ? activas : rows.slice(0, 1);
      return elegidas.map((f) => ({ id: f.id, activa: f.activa, tieneCuenta: f.tiene_cuenta }));
    });
  }

  async codigosIncorrectosDesde(
    copropiedadId: string,
    usuarioId: string,
    desde: Date,
  ): Promise<number> {
    return comoServicio(this.pool, copropiedadId, usuarioId, async (c) => {
      const { rows } = await c.query<{ n: string }>(
        `SELECT count(*) AS n FROM public.bitacora_de_residentes
          WHERE copropiedad_id = $1 AND usuario_id = $2 AND tipo = 'codigo_incorrecto'
            AND ocurrido_en >= $3`,
        [copropiedadId, usuarioId, desde],
      );
      return Number(rows[0]?.n ?? 0);
    });
  }

  async plazasLibres(
    copropiedadId: string,
    viviendaId: string,
  ): Promise<readonly PlazaDeOcupante[]> {
    return comoServicio(this.pool, copropiedadId, ACTOR_INGESTA, async (c) => {
      const { rows } = await c.query<{ id: string; numero: number; generacion: number }>(
        `SELECT id, numero, generacion FROM public.plazas_de_ocupante
          WHERE copropiedad_id = $1 AND vivienda_id = $2 AND estado = 'activo'
            AND usuario_id IS NULL AND persona_id IS NULL
          ORDER BY numero`,
        [copropiedadId, viviendaId],
      );
      return rows.map((f) => ({ ...f, usuarioId: null, ocupante: null }));
    });
  }

  async vincular(p: VinculoPedido): Promise<VinculoEscrito> {
    try {
      return await deshaciendo(() =>
        comoServicio(this.pool, p.copropiedadId, p.usuarioId, (c) => this.enTransaccion(c, p)),
      );
    } catch (e) {
      const { codigo, restriccion } = violacion(e);
      if (
        codigo === '23505' &&
        (restriccion === 'personas_documento_uk' || restriccion === 'residentes_persona_uk')
      ) {
        return { ok: false, motivo: 'DOCUMENTO_EN_USO' };
      }
      if (codigo === '23505' && restriccion === 'plazas_usuario_uk') {
        return { ok: false, motivo: 'CODIGO_INCORRECTO' };
      }
      throw e;
    }
  }

  private async enTransaccion(c: PoolClient, p: VinculoPedido): Promise<VinculoEscrito> {
    const v: string[] = [p.copropiedadId, p.usuarioId, p.viviendaId];
    await c.query(`SELECT pg_advisory_xact_lock(hashtextextended('ncr:vinculacion:' || $1, 0))`, [
      p.viviendaId,
    ]);

    // 0 · cambio de vivienda: la plaza que deja se suelta ANTES de tomar la
    // nueva —una cuenta ocupa una sola plaza viva (`plazas_usuario_uk`)— y se
    // regenera: su código anterior ya no sirve. Si lo demás falla, se deshace.
    await c.query(
      `UPDATE public.plazas_de_ocupante
          SET usuario_id = NULL, usada_en = NULL, generacion = generacion + 1
        WHERE usuario_id = $2 AND estado = 'activo' AND vivienda_id <> $3 AND copropiedad_id = $1`,
      v,
    );

    // 1 · la plaza, LIBRE y en su generación, bajo el bloqueo.
    const r = await c.query(
      `UPDATE public.plazas_de_ocupante SET usuario_id = $2, usada_en = $6
        WHERE id = $4 AND copropiedad_id = $1 AND vivienda_id = $3 AND estado = 'activo'
          AND usuario_id IS NULL AND persona_id IS NULL AND generacion = $5`,
      [...v, p.modo.plazaId, p.modo.generacion, p.ahora],
    );
    if ((r.rowCount ?? 0) === 0)
      throw new Deshacer<VinculoEscrito>({ ok: false, motivo: 'CODIGO_INCORRECTO' });

    // 2 · la persona: la del documento si está libre, la suya, o una nueva.
    const personaId = await personaDeLaCuenta(c, p);
    if (personaId === null)
      throw new Deshacer<VinculoEscrito>({ ok: false, motivo: 'DOCUMENTO_EN_USO' });

    // 3 · cambio de vivienda: baja del vínculo anterior (su plaza ya se soltó en 0).
    const baja = await c.query(
      `UPDATE public.residentes
          SET estado = 'inactivo', desactivado_en = $4, desactivado_por = $2,
              motivo_desactivacion = 'cambio de vivienda desde la app (15-I)'
        WHERE copropiedad_id = $1 AND persona_id = $5 AND estado = 'activo' AND vivienda_id <> $3`,
      [...v, p.ahora, personaId],
    );

    // 4 · el residente en ESA vivienda (D5 b: el ocupante autoriza terceros, S-54).
    const residenteId = await residenteEnLaVivienda(c, p, personaId, false);

    // 5 · la cuenta queda atada a la persona.
    await c.query('UPDATE public.usuarios SET persona_id = $2 WHERE id = $1', [
      p.usuarioId,
      personaId,
    ]);

    // 6 · el rastro, en la misma transacción. Sin documento ni código.
    await c.query(
      `INSERT INTO public.bitacora_de_residentes
         (copropiedad_id, ocurrido_en, tipo, usuario_id, actor_id, vivienda_id, detalle, creado_por)
       VALUES ($1, $4, $5, $2, $2, $3, $6, $2)`,
      [
        ...v,
        p.ahora,
        (baja.rowCount ?? 0) > 0 ? 'cambio_de_vivienda' : 'vinculacion',
        'con código de ocupante',
      ],
    );
    return { ok: true, residenteId };
  }
}
