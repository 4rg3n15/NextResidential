import { createHmac } from 'node:crypto';
import type { Pool } from 'pg';
import { edadEn, puedeTenerCuenta } from '@ncr/domain-core';
import type {
  DatosDelRegistro,
  EjecutorDelAlta,
  EscrituraDelVinculo,
  InvitacionesDeResidente,
} from '../../cuentas';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import { PROPOSITOS, derivarLlave } from '../../comun/cripto/sobre-aes-gcm';
import type { CodigosDeOcupante, PlazaDeOcupante } from '../aplicacion/puertos-hogar';
import { comoServicio } from './con-identidad';
import { SQL_CON_TITULAR } from './titularidad-pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LOS CÓDIGOS DE «CREAR CUENTA», CONTRA POSTGRESQL · RONDA 15-W (D2, §7)
 *
 * Lo que cuentas pregunta de un código, contestado por el módulo que sabe qué
 * es una plaza. Tres reglas que no se negocian:
 *
 *  · SÓLO plazas que ya existen, vivas, en una vivienda activa CON titular: la
 *    plaza libre (invitación) o la que ocupa una persona ya mayor de edad sin
 *    cuenta (traspaso, S-15W-05). Nunca nace un titular por aquí (D-W9).
 *  · En TIEMPO CONSTANTE: se calcula y compara el código de TODAS las plazas
 *    candidatas, sin salir antes, y sin conjunto se compara contra plazas
 *    ficticias. El tiempo no dice cuántas hay, cuál casi era ni qué conjuntos
 *    existen; el caso de uso iguala además el tiempo mínimo de todo fallo.
 *  · Cada fallo cuenta para la suspensión de SU copropiedad, con un HMAC de la
 *    IP —nunca la IP— bajo la llave de esa copropiedad y su propósito propio.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const FALLOS_PARA_SUSPENDER = 30;
const HORA = `interval '1 hour'`;
/** Plazas de la comparación ficticia: del orden de una copropiedad grande. */
const PLAZAS_FICTICIAS: readonly PlazaDeOcupante[] = Array.from({ length: 64 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  numero: i + 1,
  generacion: 1,
  usuarioId: null,
  ocupante: null,
}));
const COPROPIEDAD_FICTICIA = '00000000-0000-4000-8000-00000000c0de';

interface Candidata {
  id: string;
  numero: number;
  generacion: number;
  vivienda_id: string;
  persona_id: string | null;
  nacimiento: string | null;
}

const SQL_BLOQUEO = `SELECT pg_advisory_xact_lock(hashtextextended('ncr:vinculacion:' || $1, 0))`;

const SQL_RASTRO = `
  INSERT INTO public.bitacora_de_residentes
    (copropiedad_id, ocurrido_en, tipo, usuario_id, actor_id, vivienda_id, detalle, creado_por)
  VALUES ($1, now(), 'autorregistro', $2, $2, $3, $4, $2)`;

const escrituraDePlaza = (c: Candidata, cop: string, d: DatosDelRegistro): EscrituraDelVinculo => ({
  escribir: async (ejecutar: EjecutorDelAlta, usuarioId: string) => {
    await ejecutar(SQL_BLOQUEO, [c.vivienda_id]);
    const tomada = await ejecutar(
      `UPDATE public.plazas_de_ocupante SET usuario_id = $1, usada_en = now()
        WHERE id = $2 AND copropiedad_id = $3 AND estado = 'activo' AND generacion = $4
          AND usuario_id IS NULL AND persona_id IS NULL`,
      [usuarioId, c.id, cop, c.generacion],
    );
    if (tomada !== 1) return false;
    await ejecutar(SQL_RASTRO, [
      cop,
      usuarioId,
      c.vivienda_id,
      `plaza ${String(c.numero)} · política ${d.versionPolitica}`,
    ]);
    return true;
  },
});

/** S-15W-05 · la persona reclama SU plaza con su cuenta y la cuenta queda atada a ELLA. */
const escrituraDeTraspaso = (
  c: Candidata,
  cop: string,
  d: DatosDelRegistro,
): EscrituraDelVinculo => ({
  escribir: async (ejecutar: EjecutorDelAlta, usuarioId: string) => {
    await ejecutar(SQL_BLOQUEO, [c.vivienda_id]);
    const atada = await ejecutar(
      `UPDATE public.usuarios
          SET persona_id = $2,
              nombre = (SELECT left(p.nombre_completo, 200) FROM public.personas p WHERE p.id = $2)
        WHERE id = $1 AND persona_id IS NULL`,
      [usuarioId, c.persona_id],
    );
    const tomada = await ejecutar(
      `UPDATE public.plazas_de_ocupante SET persona_id = NULL, usuario_id = $1, usada_en = now()
        WHERE id = $2 AND copropiedad_id = $3 AND estado = 'activo' AND generacion = $4
          AND usuario_id IS NULL AND persona_id = $5`,
      [usuarioId, c.id, cop, c.generacion, c.persona_id],
    );
    if (atada !== 1 || tomada !== 1) return false;
    await ejecutar('UPDATE public.personas SET correo = $2 WHERE id = $1', [
      c.persona_id,
      d.correo,
    ]);
    await ejecutar(SQL_RASTRO, [
      cop,
      usuarioId,
      c.vivienda_id,
      `traspaso de la plaza ${String(c.numero)} · política ${d.versionPolitica}`,
    ]);
    return true;
  },
});

export class InvitacionesDeResidentePg implements InvitacionesDeResidente {
  constructor(
    private readonly pool: Pool,
    private readonly invitaciones: CodigosDeOcupante,
    private readonly traspasos: CodigosDeOcupante,
    private readonly llaveMaestra: string,
    private readonly reloj: () => Date,
  ) {}

  async suspendido(copropiedadId: string, ahora: Date): Promise<boolean> {
    return comoServicio(this.pool, copropiedadId, ACTOR_INGESTA, async (c) => {
      const { rows } = await c.query<{ s: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM public.bitacora_de_residentes b
            WHERE b.copropiedad_id = $1 AND b.tipo = 'registro_suspendido_por_intentos'
              AND b.ocurrido_en > $2::timestamptz - ${HORA}
              AND NOT EXISTS (SELECT 1 FROM public.bitacora_de_residentes r
                               WHERE r.copropiedad_id = $1 AND r.tipo = 'registro_reanudado'
                                 AND r.ocurrido_en > b.ocurrido_en)) AS s`,
        [copropiedadId, ahora],
      );
      return rows[0]?.s === true;
    });
  }

  async resolver(
    copropiedadId: string | null,
    codigo: string,
    datos: DatosDelRegistro,
  ): Promise<EscrituraDelVinculo | null> {
    if (copropiedadId === null) {
      this.invitaciones.plazaDelCodigo(COPROPIEDAD_FICTICIA, PLAZAS_FICTICIAS, codigo);
      return null;
    }
    const candidatas = await comoServicio(this.pool, copropiedadId, ACTOR_INGESTA, async (c) => {
      const { rows } = await c.query<Candidata>(
        `SELECT p.id, p.numero, p.generacion, p.vivienda_id, p.persona_id,
                per.fecha_nacimiento::text AS nacimiento
           FROM public.plazas_de_ocupante p
           JOIN public.viviendas v ON v.id = p.vivienda_id AND v.estado = 'activo'
      LEFT JOIN public.personas per ON per.id = p.persona_id
          WHERE p.copropiedad_id = $1 AND p.estado = 'activo' AND p.usuario_id IS NULL
            AND ${SQL_CON_TITULAR}
            AND (p.persona_id IS NULL
                 OR NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.persona_id = p.persona_id))`,
        [copropiedadId],
      );
      return rows;
    });
    const ahora = this.reloj();
    const comoPlaza = (f: Candidata): PlazaDeOcupante => ({
      ...f,
      usuarioId: null,
      ocupante: null,
    });
    const libres = candidatas.filter((f) => f.persona_id === null);
    const mayores = candidatas.filter((f) => {
      const edad = f.nacimiento === null ? null : edadEn(f.nacimiento, ahora);
      return f.persona_id !== null && edad !== null && puedeTenerCuenta(edad);
    });
    // Las dos comparaciones SIEMPRE, sin salir antes: el tiempo no dice de cuál fue.
    const libre = this.invitaciones.plazaDelCodigo(copropiedadId, libres.map(comoPlaza), codigo);
    const deTraspaso = this.traspasos.plazaDelCodigo(copropiedadId, mayores.map(comoPlaza), codigo);
    const plaza = libres.find((f) => f.id === libre?.id);
    if (plaza !== undefined) return escrituraDePlaza(plaza, copropiedadId, datos);
    const persona = mayores.find((f) => f.id === deTraspaso?.id);
    // El traspaso exige además la fecha que el hogar registró: el código solo no basta.
    if (persona !== undefined && persona.nacimiento === datos.fechaNacimiento) {
      return escrituraDeTraspaso(persona, copropiedadId, datos);
    }
    return null;
  }

  async anotarFallo(copropiedadId: string, ip: string | null, ahora: Date): Promise<void> {
    const llave = derivarLlave(this.llaveMaestra, copropiedadId, PROPOSITOS.ipDeRegistro);
    const huella =
      ip === null
        ? 'ip:desconocida'
        : `ip:${createHmac('sha256', llave).update(ip).digest('hex').slice(0, 16)}`;
    await comoServicio(this.pool, copropiedadId, ACTOR_INGESTA, async (c) => {
      await c.query(`SELECT pg_advisory_xact_lock(hashtextextended('ncr:registro:' || $1, 0))`, [
        copropiedadId,
      ]);
      await c.query(
        `INSERT INTO public.bitacora_de_residentes
           (copropiedad_id, ocurrido_en, tipo, detalle, creado_por)
         VALUES ($1, $2, 'registro_codigo_incorrecto', $3, $4)`,
        [copropiedadId, ahora, huella, ACTOR_INGESTA],
      );
      // La ventana empieza en lo más reciente de: hace una hora, la última
      // reanudación o la última suspensión (tras ella, la cuenta vuelve a cero).
      const { rows } = await c.query<{ n: number }>(
        `WITH desde AS (
           SELECT greatest($2::timestamptz - ${HORA},
                           coalesce(max(ocurrido_en) FILTER (WHERE tipo IN ('registro_reanudado',
                                                    'registro_suspendido_por_intentos')),
                                    '-infinity')) AS t
             FROM public.bitacora_de_residentes
            WHERE copropiedad_id = $1
              AND tipo IN ('registro_reanudado', 'registro_suspendido_por_intentos'))
         SELECT count(*)::int AS n
           FROM public.bitacora_de_residentes b, desde
          WHERE b.copropiedad_id = $1 AND b.tipo = 'registro_codigo_incorrecto'
            AND b.ocurrido_en > desde.t`,
        [copropiedadId, ahora],
      );
      if ((rows[0]?.n ?? 0) < FALLOS_PARA_SUSPENDER) return;
      await c.query(
        `INSERT INTO public.bitacora_de_residentes
           (copropiedad_id, ocurrido_en, tipo, detalle, creado_por)
         VALUES ($1, $2, 'registro_suspendido_por_intentos', $3, $4)`,
        [
          copropiedadId,
          ahora,
          `${String(FALLOS_PARA_SUSPENDER)} códigos fallidos en una hora`,
          ACTOR_INGESTA,
        ],
      );
      // S-15W-09 · la alerta al superadministrador: la auditoría de seguridad
      // (`rate_limit`) y el aviso de Configuración. Sin IP: nunca en claro.
      await c.query(
        `INSERT INTO public.auditoria_seguridad
           (copropiedad_id_actor, copropiedad_id_objetivo, tipo, recurso, identificador_solicitado,
            resultado, creado_por)
         VALUES ($1, $1, 'rate_limit', 'auth/registro', 'registro suspendido por intentos',
                 '429', $2)`,
        [copropiedadId, ACTOR_INGESTA],
      );
    });
  }
}
