import type { Pool, PoolClient } from 'pg';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import type {
  AltaDeMenor,
  DatosDelMenor,
  MenorDelHogar,
  MenorEscrito,
  MenoresDelHogar,
  PlazaParaTraspaso,
} from '../aplicacion/puertos-de-menores';
import { Deshacer, comoServicio, deshaciendo, violacion } from './con-identidad';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LOS MENORES DEL HOGAR CONTRA POSTGRESQL · RONDA 15-W (D-W2, D4)
 *
 * Como SERVICIO de la copropiedad con el adulto como actor: así lo reconoce
 * `tg_plazas_solo_superadministrador` (0056), que sólo deja ocupar una plaza
 * libre con una persona sin cuenta, menor y residente de ESA vivienda, a un
 * adulto con cuenta de ella. Bajo el bloqueo de la vivienda, como el alta.
 * ═════════════════════════════════════════════════════════════════════════════
 */
/** Residente ACTIVO de esa vivienda cuya persona no tiene cuenta: un menor del hogar. */
const SQL_SIN_CUENTA = `NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.persona_id = r.persona_id)`;

export class MenoresDelHogarPg implements MenoresDelHogar {
  constructor(private readonly pool: Pool) {}

  async listar(copropiedadId: string, viviendaId: string): Promise<readonly MenorDelHogar[]> {
    return comoServicio(this.pool, copropiedadId, ACTOR_INGESTA, async (c) => {
      const { rows } = await c.query<MenorDelHogar>(
        `SELECT r.id AS "residenteId", per.nombres, per.apellidos,
                per.nombre_completo AS "nombreCompleto",
                per.fecha_nacimiento::text AS "fechaNacimiento",
                per.tipo_documento::text AS "tipoDocumento",
                per.numero_documento AS "numeroDocumento", r.parentesco,
                p.id AS "plazaId", p.numero AS "plazaNumero",
                EXISTS (SELECT 1 FROM public.plantillas_biometricas pb
                         WHERE pb.persona_id = per.id AND pb.estado <> 'suprimida') AS "tieneRostro"
           FROM public.residentes r
           JOIN public.personas per ON per.id = r.persona_id
      LEFT JOIN public.plazas_de_ocupante p ON p.persona_id = per.id AND p.estado = 'activo'
          WHERE r.copropiedad_id = $1 AND r.vivienda_id = $2 AND r.estado = 'activo'
            AND ${SQL_SIN_CUENTA}
          ORDER BY per.fecha_nacimiento NULLS LAST, per.nombre_completo`,
        [copropiedadId, viviendaId],
      );
      return rows;
    });
  }

  async registrar(
    copropiedadId: string,
    viviendaId: string,
    actorId: string,
    alta: AltaDeMenor,
  ): Promise<MenorEscrito> {
    try {
      return await deshaciendo(() =>
        comoServicio(this.pool, copropiedadId, actorId, (c) =>
          this.registrarEn(c, copropiedadId, viviendaId, actorId, alta),
        ),
      );
    } catch (e) {
      const { codigo, restriccion } = violacion(e);
      if (codigo === '23505' && restriccion === 'personas_documento_uk') {
        return { ok: false, motivo: 'DOCUMENTO_EN_USO' };
      }
      if (codigo === '23505' && restriccion === 'plazas_persona_uk') {
        return { ok: false, motivo: 'PLAZA_OCUPADA' };
      }
      throw e;
    }
  }

  private async registrarEn(
    c: PoolClient,
    copropiedadId: string,
    viviendaId: string,
    actorId: string,
    a: AltaDeMenor,
  ): Promise<MenorEscrito> {
    await c.query(`SELECT pg_advisory_xact_lock(hashtextextended('ncr:vinculacion:' || $1, 0))`, [
      viviendaId,
    ]);
    const { rows: plaza } = await c.query<{ numero: number; libre: boolean }>(
      `SELECT numero, usuario_id IS NULL AND persona_id IS NULL AS libre
         FROM public.plazas_de_ocupante
        WHERE id = $3 AND copropiedad_id = $1 AND vivienda_id = $2 AND estado = 'activo'`,
      [copropiedadId, viviendaId, a.plazaId],
    );
    if (plaza[0] === undefined)
      throw new Deshacer<MenorEscrito>({ ok: false, motivo: 'NO_ENCONTRADO' });
    if (!plaza[0].libre) throw new Deshacer<MenorEscrito>({ ok: false, motivo: 'PLAZA_OCUPADA' });

    // La persona del documento, si ya estaba en el padrón y está LIBRE; si no, una nueva.
    const { rows: existente } = await c.query<{ id: string; libre: boolean }>(
      `SELECT p.id,
              NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.persona_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM public.residentes r
                           WHERE r.persona_id = p.id AND r.estado = 'activo'
                             AND r.vivienda_id <> $4) AS libre
         FROM public.personas p
        WHERE p.copropiedad_id = $1 AND p.tipo_documento = $2::tipo_documento
          AND p.numero_documento = $3`,
      [copropiedadId, a.tipoDocumento, a.numeroDocumento, viviendaId],
    );
    if (existente[0] !== undefined && !existente[0].libre) {
      throw new Deshacer<MenorEscrito>({ ok: false, motivo: 'DOCUMENTO_EN_USO' });
    }
    const nombre = `${a.nombres} ${a.apellidos}`.slice(0, 200);
    const personaId =
      existente[0]?.id ??
      (
        await c.query<{ id: string }>(
          `INSERT INTO public.personas
             (copropiedad_id, tipo_documento, numero_documento, nombre_completo, nombres,
              apellidos, fecha_nacimiento, creado_por, actualizado_por)
           VALUES ($1, $2::tipo_documento, $3, $4, $5, $6, $7::date, $8, $8) RETURNING id`,
          [
            copropiedadId,
            a.tipoDocumento,
            a.numeroDocumento,
            nombre,
            a.nombres,
            a.apellidos,
            a.fechaNacimiento,
            actorId,
          ],
        )
      ).rows[0]?.id;
    if (personaId === undefined) throw new Error('el alta de la persona no devolvió identificador');
    if (existente[0] !== undefined) {
      await c.query(
        `UPDATE public.personas SET nombre_completo = $2, nombres = $3, apellidos = $4,
                fecha_nacimiento = $5::date WHERE id = $1`,
        [personaId, nombre, a.nombres, a.apellidos, a.fechaNacimiento],
      );
    }
    const { rows: residente } = await c.query<{ id: string }>(
      `INSERT INTO public.residentes
         (copropiedad_id, vivienda_id, persona_id, parentesco, es_titular, creado_por, actualizado_por)
       SELECT $1, $2, $3, $4, false, $5, $5
        WHERE NOT EXISTS (SELECT 1 FROM public.residentes r
                           WHERE r.persona_id = $3 AND r.vivienda_id = $2 AND r.estado = 'activo')
       RETURNING id`,
      [copropiedadId, viviendaId, personaId, a.parentesco, actorId],
    );
    const residenteId =
      residente[0]?.id ??
      (
        await c.query<{ id: string }>(
          `SELECT id FROM public.residentes WHERE persona_id = $1 AND vivienda_id = $2 AND estado = 'activo'`,
          [personaId, viviendaId],
        )
      ).rows[0]?.id;
    if (residenteId === undefined) throw new Error('el residente no quedó registrado');
    const ocupada = await c.query(
      `UPDATE public.plazas_de_ocupante SET persona_id = $4
        WHERE id = $3 AND copropiedad_id = $1 AND vivienda_id = $2 AND estado = 'activo'
          AND usuario_id IS NULL AND persona_id IS NULL`,
      [copropiedadId, viviendaId, a.plazaId, personaId],
    );
    if ((ocupada.rowCount ?? 0) !== 1) {
      throw new Deshacer<MenorEscrito>({ ok: false, motivo: 'PLAZA_OCUPADA' });
    }
    await this.rastro(
      c,
      copropiedadId,
      viviendaId,
      actorId,
      'menor_registrado',
      `plaza ${String(plaza[0].numero)}`,
    );
    return { ok: true, residenteId, personaId };
  }

  async editar(
    copropiedadId: string,
    viviendaId: string,
    residenteId: string,
    actorId: string,
    d: DatosDelMenor,
  ): Promise<MenorEscrito> {
    return comoServicio(this.pool, copropiedadId, actorId, async (c) => {
      const { rows } = await c.query<{ persona_id: string }>(
        `UPDATE public.residentes r SET parentesco = $4
          WHERE r.id = $3 AND r.copropiedad_id = $1 AND r.vivienda_id = $2 AND r.estado = 'activo'
            AND ${SQL_SIN_CUENTA}
          RETURNING r.persona_id`,
        [copropiedadId, viviendaId, residenteId, d.parentesco],
      );
      const personaId = rows[0]?.persona_id;
      if (personaId === undefined) return { ok: false, motivo: 'NO_ENCONTRADO' };
      await c.query(
        `UPDATE public.personas SET nombres = $2, apellidos = $3, nombre_completo = $4,
                fecha_nacimiento = $5::date WHERE id = $1`,
        [
          personaId,
          d.nombres,
          d.apellidos,
          `${d.nombres} ${d.apellidos}`.slice(0, 200),
          d.fechaNacimiento,
        ],
      );
      await this.rastro(c, copropiedadId, viviendaId, actorId, 'menor_editado', null);
      return { ok: true, residenteId, personaId };
    });
  }

  async darDeBaja(
    copropiedadId: string,
    viviendaId: string,
    residenteId: string,
    actorId: string,
    motivo: string,
  ): Promise<MenorEscrito> {
    return comoServicio(this.pool, copropiedadId, actorId, async (c) => {
      const { rows } = await c.query<{ persona_id: string }>(
        `UPDATE public.residentes r
            SET estado = 'inactivo', desactivado_en = now(), desactivado_por = $4,
                motivo_desactivacion = left($5, 300)
          WHERE r.id = $3 AND r.copropiedad_id = $1 AND r.vivienda_id = $2 AND r.estado = 'activo'
            AND ${SQL_SIN_CUENTA}
          RETURNING r.persona_id`,
        [copropiedadId, viviendaId, residenteId, actorId, motivo],
      );
      const personaId = rows[0]?.persona_id;
      if (personaId === undefined) return { ok: false, motivo: 'NO_ENCONTRADO' };
      await c.query(
        `UPDATE public.plazas_de_ocupante SET persona_id = NULL, generacion = generacion + 1
          WHERE persona_id = $3 AND copropiedad_id = $1 AND vivienda_id = $2 AND estado = 'activo'`,
        [copropiedadId, viviendaId, personaId],
      );
      await this.rastro(c, copropiedadId, viviendaId, actorId, 'menor_dado_de_baja', motivo);
      return { ok: true, residenteId, personaId };
    });
  }

  async plazaParaTraspaso(
    copropiedadId: string,
    viviendaId: string,
    residenteId: string,
  ): Promise<PlazaParaTraspaso | null> {
    return comoServicio(this.pool, copropiedadId, ACTOR_INGESTA, async (c) => {
      const { rows } = await c.query<PlazaParaTraspaso>(
        `SELECT p.id AS "plazaId", p.generacion, per.fecha_nacimiento::text AS "fechaNacimiento"
           FROM public.residentes r
           JOIN public.personas per ON per.id = r.persona_id
           JOIN public.plazas_de_ocupante p ON p.persona_id = r.persona_id
                                            AND p.vivienda_id = r.vivienda_id AND p.estado = 'activo'
          WHERE r.id = $3 AND r.copropiedad_id = $1 AND r.vivienda_id = $2 AND r.estado = 'activo'
            AND ${SQL_SIN_CUENTA}`,
        [copropiedadId, viviendaId, residenteId],
      );
      return rows[0] ?? null;
    });
  }

  private async rastro(
    c: PoolClient,
    copropiedadId: string,
    viviendaId: string,
    actorId: string,
    tipo: 'menor_registrado' | 'menor_editado' | 'menor_dado_de_baja',
    detalle: string | null,
  ): Promise<void> {
    await c.query(
      `INSERT INTO public.bitacora_de_residentes
         (copropiedad_id, ocurrido_en, tipo, usuario_id, actor_id, vivienda_id, detalle, creado_por)
       VALUES ($1, now(), $3, $4, $4, $2, $5, $4)`,
      [copropiedadId, viviendaId, tipo, actorId, detalle === null ? null : detalle.slice(0, 500)],
    );
  }
}
