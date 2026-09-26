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

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ALTA DEL RESIDENTE CONTRA POSTGRESQL · ETAPA 15-I (3.2, D6)
 *
 * La lectura usa el servicio de la copropiedad con el propio residente como
 * actor; la vinculación, lo mismo dentro de una transacción con un BLOQUEO POR
 * VIVIENDA: dos personas que marcan «no lo tengo» a la vez para la misma casa
 * no pueden salir las dos como primer residente, y la plaza sólo la ocupa quien
 * la toma con `usuario_id IS NULL` (la base decide, ADR-04).
 *
 * La persona se busca por su documento. Si ya existe —estaba en el padrón— se
 * REUTILIZA sólo si está libre: sin otra cuenta vinculada y sin ser residente
 * de otra vivienda. Si no, `DOCUMENTO_EN_USO`: nadie se apropia de la ficha de
 * otro escribiendo su cédula.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const SQL_TIENE_OTRA_CUENTA = `
  EXISTS (SELECT 1 FROM public.residentes r
            JOIN public.usuarios u ON u.persona_id = r.persona_id AND u.estado = 'activo'
           WHERE r.vivienda_id = v.id AND r.estado = 'activo' AND u.id <> $2)`;

export class AltaDelResidentePg implements AltaDelResidente {
  constructor(private readonly pool: Pool) {}

  async vocabulario(copropiedadId: string): Promise<VocabularioDeAlta | null> {
    return comoServicio(this.pool, copropiedadId, ACTOR_INGESTA, async (c) => {
      const { rows } = await c.query<{
        nombre: string;
        tipo: string | null;
        etiqueta_vivienda: string;
        etiqueta_agrupacion: string;
      }>(
        `SELECT nombre, tipo::text AS tipo, etiqueta_vivienda, etiqueta_agrupacion
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
      return f === undefined
        ? { viviendaId: null, debeDeclararOcupantes: false }
        : { viviendaId: f.vivienda_id, debeDeclararOcupantes: f.debe_declarar };
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
            AND usuario_id IS NULL
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

    // 1 · la plaza, o la condición de primer residente, bajo el bloqueo.
    if (p.modo.tipo === 'primer_residente') {
      const { rows } = await c.query<{ tiene: boolean }>(
        `SELECT ${SQL_TIENE_OTRA_CUENTA} AS tiene FROM public.viviendas v WHERE v.id = $3 AND v.copropiedad_id = $1`,
        v,
      );
      if (rows[0]?.tiene !== false)
        throw new Deshacer<VinculoEscrito>({ ok: false, motivo: 'CODIGO_REQUERIDO' });
    } else {
      const r = await c.query(
        `UPDATE public.plazas_de_ocupante SET usuario_id = $2, usada_en = $6
          WHERE id = $4 AND copropiedad_id = $1 AND vivienda_id = $3 AND estado = 'activo'
            AND usuario_id IS NULL AND generacion = $5`,
        [...v, p.modo.plazaId, p.modo.generacion, p.ahora],
      );
      if ((r.rowCount ?? 0) === 0)
        throw new Deshacer<VinculoEscrito>({ ok: false, motivo: 'CODIGO_INCORRECTO' });
    }

    // 2 · la persona: la del documento si está libre, la suya, o una nueva.
    const personaId = await this.persona(c, p);
    if (personaId === null)
      throw new Deshacer<VinculoEscrito>({ ok: false, motivo: 'DOCUMENTO_EN_USO' });

    // 3 · cambio de vivienda: baja del vínculo anterior y su plaza, que se regenera.
    const baja = await c.query(
      `UPDATE public.residentes
          SET estado = 'inactivo', desactivado_en = $4, desactivado_por = $2,
              motivo_desactivacion = 'cambio de vivienda desde la app (15-I)'
        WHERE copropiedad_id = $1 AND persona_id = $5 AND estado = 'activo' AND vivienda_id <> $3`,
      [...v, p.ahora, personaId],
    );
    await c.query(
      `UPDATE public.plazas_de_ocupante
          SET usuario_id = NULL, usada_en = NULL, generacion = generacion + 1
        WHERE usuario_id = $2 AND estado = 'activo' AND vivienda_id <> $3 AND copropiedad_id = $1`,
      v,
    );

    // 4 · el residente en ESA vivienda (D5 b: el ocupante autoriza terceros, S-54).
    const residenteId = await this.residente(c, p, personaId);

    // 5 · la cuenta queda atada a la persona; 6 · la marca de primer residente.
    await c.query('UPDATE public.usuarios SET persona_id = $2 WHERE id = $1', [
      p.usuarioId,
      personaId,
    ]);
    if (p.modo.tipo === 'primer_residente') {
      await c.query(
        `INSERT INTO public.ocupacion_de_viviendas
           (vivienda_id, copropiedad_id, primer_residente_id, creado_por, actualizado_por)
         VALUES ($3, $1, $2, $2, $2)
         ON CONFLICT (vivienda_id) DO UPDATE SET primer_residente_id = EXCLUDED.primer_residente_id
          WHERE public.ocupacion_de_viviendas.declarada_en IS NULL`,
        v,
      );
    }

    // 7 · el rastro, en la misma transacción. Sin documento ni código.
    await c.query(
      `INSERT INTO public.bitacora_de_residentes
         (copropiedad_id, ocurrido_en, tipo, usuario_id, actor_id, vivienda_id, detalle, creado_por)
       VALUES ($1, $4, $5, $2, $2, $3, $6, $2)`,
      [
        ...v,
        p.ahora,
        (baja.rowCount ?? 0) > 0 ? 'cambio_de_vivienda' : 'vinculacion',
        p.modo.tipo === 'primer_residente' ? 'primer residente' : 'con código de ocupante',
      ],
    );
    return { ok: true, residenteId };
  }

  /** `null` = el documento es de otra persona que no está libre. */
  private async persona(c: PoolClient, p: VinculoPedido): Promise<string | null> {
    const d = p.perfil;
    const { rows: mia } = await c.query<{ persona_id: string | null }>(
      'SELECT persona_id FROM public.usuarios WHERE id = $1',
      [p.usuarioId],
    );
    const propia = mia[0]?.persona_id ?? null;
    const { rows: delDocumento } = await c.query<{ id: string; libre: boolean }>(
      `SELECT p.id,
              NOT EXISTS (SELECT 1 FROM public.usuarios u
                           WHERE u.persona_id = p.id AND u.id <> $4 AND u.estado = 'activo')
          AND NOT EXISTS (SELECT 1 FROM public.residentes r
                           WHERE r.persona_id = p.id AND r.estado = 'activo' AND r.vivienda_id <> $5
                             AND p.id IS DISTINCT FROM $6::uuid) AS libre
         FROM public.personas p
        WHERE p.copropiedad_id = $1 AND p.tipo_documento = $2::tipo_documento
          AND p.numero_documento = $3 AND p.estado = 'activo'`,
      [p.copropiedadId, d.tipoDocumento, d.numeroDocumento, p.usuarioId, p.viviendaId, propia],
    );
    const existente = delDocumento[0];
    if (existente !== undefined && existente.id !== propia && !existente.libre) return null;
    const personaId = existente?.id ?? propia;
    const valores = [
      d.tipoDocumento,
      d.numeroDocumento,
      `${d.nombres} ${d.apellidos}`.slice(0, 200),
      d.nombres,
      d.apellidos,
      d.fechaNacimiento,
      d.telefono,
      d.correo,
    ];
    if (personaId === null) {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO public.personas
           (copropiedad_id, tipo_documento, numero_documento, nombre_completo, nombres, apellidos,
            fecha_nacimiento, telefono, correo, creado_por, actualizado_por)
         VALUES ($1, $2::tipo_documento, $3, $4, $5, $6, $7::date, $8, $9, $10, $10)
         RETURNING id`,
        [p.copropiedadId, ...valores, p.usuarioId],
      );
      return rows[0]?.id ?? null;
    }
    await c.query(
      `UPDATE public.personas
          SET tipo_documento = $2::tipo_documento, numero_documento = $3, nombre_completo = $4,
              nombres = $5, apellidos = $6, fecha_nacimiento = $7::date, telefono = $8, correo = $9
        WHERE id = $1`,
      [personaId, ...valores],
    );
    return personaId;
  }

  private async residente(c: PoolClient, p: VinculoPedido, personaId: string): Promise<string> {
    const { rows: ya } = await c.query<{ id: string }>(
      `SELECT id FROM public.residentes
        WHERE persona_id = $1 AND vivienda_id = $2 AND estado = 'activo'`,
      [personaId, p.viviendaId],
    );
    if (ya[0] !== undefined) return ya[0].id;
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO public.residentes
         (copropiedad_id, vivienda_id, persona_id, es_titular, nivel_acceso_id, creado_por, actualizado_por)
       VALUES ($1, $2, $3, $4,
               (SELECT n.id FROM public.niveles_acceso n
                 WHERE n.copropiedad_id = $1 AND n.estado = 'activo' AND n.permite_autorizar
                 ORDER BY n.orden LIMIT 1),
               $5, $5)
       RETURNING id`,
      [p.copropiedadId, p.viviendaId, personaId, p.modo.tipo === 'primer_residente', p.usuarioId],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new Error('el alta de residente no devolvió identificador');
    return id;
  }
}
