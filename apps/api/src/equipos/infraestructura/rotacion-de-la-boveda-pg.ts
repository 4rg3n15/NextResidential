import { createHmac } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import {
  PROPOSITOS,
  aplanar,
  cifrar,
  derivarLlave,
  desaplanar,
  descifrar,
} from '../../comun/cripto/sobre-aes-gcm';
import type { Proposito, SobreCifrado } from '../../comun/cripto/sobre-aes-gcm';
import { conCliente } from '../../persistencia/con-cliente';
import { SAL_DE_LA_HUELLA } from './secretos-de-alarm-server-pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * F2 (15-R) · ROTAR LA LLAVE MAESTRA DE LA BÓVEDA DE EQUIPOS (`EQUIPOS_LLAVE`)
 *
 * Para que un respaldo tomado ANTES quede ilegible en cuanto se destruye la
 * anterior. Recifra con la nueva todo lo que la anterior protegía en la nube:
 *
 *  · `credenciales_de_equipo` — TODAS las filas con bytes, activas y del
 *    historial (RN-19): una inactiva bajo la llave vieja seguiría entregando
 *    una clave, quizá la misma que el equipo usa hoy;
 *  · `dispositivos.secreto_alarm_server_sobre` y su huella (HMAC con llave
 *    derivada de la maestra): sin recalcularla, la cámara no se acreditaría;
 *  · `dispositivos.huella_de_credencial` (credenciales que guarda el Edge): la
 *    clave no está en la nube y la huella no se puede recalcular, así que SE
 *    RETIRA. Nada la lee; la próxima entrega al Edge escribe otra.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LAS DOS LLAVES JUNTAS, SÓLO AQUÍ (C-56)
 *
 * H-15B-1 descartó recifrar porque exigía tener las dos llaves a la vez en el
 * proceso. Sigue siendo cierto para la API: ella sólo conoce UNA. Esto es una
 * herramienta de un solo uso que vive lo que dura la rotación y termina.
 *
 * Cada copropiedad va en SU transacción, con claims de servicio de ESA
 * copropiedad (§2.7.6), y antes de confirmar se comprueba que todo lo escrito
 * abre con la llave nueva: o queda rotada entera o no cambia nada. Volver a
 * correrla es seguro: lo que ya abre con la nueva se cuenta y no se toca. Un
 * sobre VIGENTE que no abre con ninguna de las dos detiene la rotación
 * nombrando la fila —nunca el valor—: dato roto o tercera llave, y adivinar no
 * es trabajo de una herramienta que maneja llaves. Uno del HISTORIAL se cuenta
 * y se deja: ninguna llave a mano lo abre, y la API nunca lo lee (§13.4).
 * ═════════════════════════════════════════════════════════════════════════════
 */

export interface LlavesDeLaRotacion {
  readonly anterior: string;
  readonly nueva: string;
  /** La `EQUIPOS_LLAVE_REF` de la nueva (p. ej. `vault:equipos-llave/v2`). Nunca la llave. */
  readonly referenciaNueva: string;
}

export interface InformeDeRotacion {
  readonly copropiedades: number;
  readonly credenciales: number;
  readonly secretosDeCamara: number;
  /** Ya abrían con la nueva: una ejecución anterior los rotó. */
  readonly yaRotados: number;
  readonly huellasDelEdgeRetiradas: number;
  /** Filas inactivas que no abre ninguna de las dos: se dejan como están (§13.4). */
  readonly historialIlegible: number;
}

export class RotacionImposible extends Error {}

const REFERENCIA = /^(env|vault):[A-Za-z0-9_./-]+$/;

/** Lo que se comprueba ANTES de tocar una fila. */
export const validarLlaves = (l: LlavesDeLaRotacion): void => {
  if (l.anterior.length < 32 || l.nueva.length < 32) {
    throw new RotacionImposible('las dos llaves deben tener al menos 32 caracteres');
  }
  if (l.anterior === l.nueva) throw new RotacionImposible('la llave nueva es igual a la anterior');
  if (!REFERENCIA.test(l.referenciaNueva)) {
    throw new RotacionImposible('la referencia nueva debe ser env:… o vault:…, no la llave');
  }
};

interface Abierto {
  readonly claro: Buffer;
  readonly yaRotado: boolean;
}

/** Con la primera maestra que sirva: [anterior, nueva] (la 2.ª = «ya rotado») o [nueva]. */
const abrir = (
  maestras: readonly string[],
  cop: string,
  proposito: Proposito,
  sobre: SobreCifrado,
  fila: string,
): Abierto => {
  for (const [i, maestra] of maestras.entries()) {
    try {
      const claro = descifrar(derivarLlave(maestra, cop, proposito), sobre);
      return { claro, yaRotado: i === maestras.length - 1 && maestras.length > 1 };
    } catch {
      // GCM: la etiqueta no cuadra con esta llave. Se prueba la siguiente.
    }
  }
  throw new RotacionImposible(`${fila} no abre con la llave esperada`);
};

const cerrar = (maestra: string, cop: string, proposito: Proposito, claro: Buffer) =>
  cifrar(derivarLlave(maestra, cop, proposito), claro);

/** La misma huella que `SecretosDeAlarmServerPg`: sal fija, propósito propio. */
const huellaDeCamara = (maestra: string, claro: Buffer): Buffer =>
  createHmac('sha256', derivarLlave(maestra, SAL_DE_LA_HUELLA, PROPOSITOS.huellaDeAlarmServer))
    .update(claro)
    .digest();

interface FilaDeCredencial extends SobreCifrado {
  readonly id: string;
  readonly estado: string;
}
interface FilaDeCamara {
  readonly id: string;
  readonly secreto_alarm_server_sobre: Buffer;
}
interface Parcial {
  hechos: number;
  yaRotados: number;
  readonly ilegibles: string[];
}

const CREDENCIALES = `SELECT id, iv, cuerpo, etiqueta, estado FROM public.credenciales_de_equipo
  WHERE copropiedad_id = $1 AND iv IS NOT NULL ORDER BY id`;
const CAMARAS = `SELECT id, secreto_alarm_server_sobre FROM public.dispositivos
  WHERE copropiedad_id = $1 AND secreto_alarm_server_sobre IS NOT NULL ORDER BY id`;

const rotarCredenciales = async (c: PoolClient, l: LlavesDeLaRotacion, cop: string) => {
  const { rows } = await c.query<FilaDeCredencial>(`${CREDENCIALES} FOR UPDATE`, [cop]);
  const parcial: Parcial = { hechos: 0, yaRotados: 0, ilegibles: [] };
  const p = PROPOSITOS.credencialesDeEquipo;
  const lote = {
    id: [] as string[],
    iv: [] as Buffer[],
    cuerpo: [] as Buffer[],
    et: [] as Buffer[],
  };
  for (const f of rows) {
    let a: Abierto;
    try {
      a = abrir([l.anterior, l.nueva], cop, p, f, `credenciales_de_equipo ${f.id}`);
    } catch (error) {
      if (f.estado === 'activo') throw error;
      parcial.ilegibles.push(f.id);
      continue;
    }
    if (a.yaRotado) {
      parcial.yaRotados += 1;
      continue;
    }
    const s = cerrar(l.nueva, cop, p, a.claro);
    lote.id.push(f.id);
    lote.iv.push(s.iv);
    lote.cuerpo.push(s.cuerpo);
    lote.et.push(s.etiqueta);
  }
  if (lote.id.length > 0) {
    // Un solo UPDATE por copropiedad (§2.4: sin N+1). En su sitio y no «desactivar
    // y escribir otra»: una fila nueva dejaría la vieja, con la llave vieja, debajo.
    const r = await c.query(
      `UPDATE public.credenciales_de_equipo AS c
          SET iv = n.iv, cuerpo = n.cuerpo, etiqueta = n.etiqueta, llave_ref = $6,
              actualizado_por = $7
         FROM unnest($1::uuid[], $2::bytea[], $3::bytea[], $4::bytea[])
              AS n(id, iv, cuerpo, etiqueta)
        WHERE c.id = n.id AND c.copropiedad_id = $5`,
      [lote.id, lote.iv, lote.cuerpo, lote.et, cop, l.referenciaNueva, ACTOR_INGESTA],
    );
    parcial.hechos = r.rowCount ?? 0;
  }
  return parcial;
};

const rotarCamaras = async (c: PoolClient, l: LlavesDeLaRotacion, cop: string) => {
  const { rows } = await c.query<FilaDeCamara>(`${CAMARAS} FOR UPDATE`, [cop]);
  const parcial: Parcial = { hechos: 0, yaRotados: 0, ilegibles: [] };
  const p = PROPOSITOS.secretoDeAlarmServer;
  const lote = { id: [] as string[], sobre: [] as Buffer[], huella: [] as Buffer[] };
  for (const f of rows) {
    const plano = desaplanar(f.secreto_alarm_server_sobre);
    const a = abrir([l.anterior, l.nueva], cop, p, plano, `dispositivos ${f.id} (Alarm Server)`);
    if (a.yaRotado) {
      parcial.yaRotados += 1;
      continue;
    }
    lote.id.push(f.id);
    lote.sobre.push(aplanar(cerrar(l.nueva, cop, p, a.claro)));
    lote.huella.push(huellaDeCamara(l.nueva, a.claro));
  }
  if (lote.id.length > 0) {
    const r = await c.query(
      `UPDATE public.dispositivos AS d
          SET secreto_alarm_server_sobre = n.sobre, secreto_alarm_server_huella = n.huella,
              actualizado_por = $5
         FROM unnest($1::uuid[], $2::bytea[], $3::bytea[]) AS n(id, sobre, huella)
        WHERE d.id = n.id AND d.copropiedad_id = $4`,
      [lote.id, lote.sobre, lote.huella, cop, ACTOR_INGESTA],
    );
    parcial.hechos = r.rowCount ?? 0;
  }
  return parcial;
};

/** Antes del COMMIT: todo lo que queda (salvo el historial ilegible) abre con la NUEVA. */
const comprobar = async (c: PoolClient, l: LlavesDeLaRotacion, cop: string, salvo: Parcial) => {
  const soloNueva = [l.nueva];
  const creds = await c.query<FilaDeCredencial>(CREDENCIALES, [cop]);
  for (const f of creds.rows.filter((r) => !salvo.ilegibles.includes(r.id))) {
    abrir(soloNueva, cop, PROPOSITOS.credencialesDeEquipo, f, `credenciales_de_equipo ${f.id}`);
  }
  const camaras = await c.query<FilaDeCamara>(CAMARAS, [cop]);
  for (const f of camaras.rows) {
    const s = desaplanar(f.secreto_alarm_server_sobre);
    abrir(soloNueva, cop, PROPOSITOS.secretoDeAlarmServer, s, `dispositivos ${f.id}`);
  }
};

const rotarCopropiedad = (pool: Pool, l: LlavesDeLaRotacion, cop: string) =>
  conCliente(pool, async (c) => {
    await c.query('BEGIN');
    try {
      await c.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(claimsDeServicio(cop)),
      ]);
      const credenciales = await rotarCredenciales(c, l, cop);
      const camaras = await rotarCamaras(c, l, cop);
      const edge = await c.query(
        `UPDATE public.dispositivos SET huella_de_credencial = NULL, actualizado_por = $2
          WHERE copropiedad_id = $1 AND huella_de_credencial IS NOT NULL`,
        [cop, ACTOR_INGESTA],
      );
      await comprobar(c, l, cop, credenciales);
      // Constancia de QUE se rotó y con qué REFERENCIA; las llaves, nunca (§2.7.8).
      await c.query(
        `INSERT INTO public.auditoria_seguridad
           (copropiedad_id_actor, copropiedad_id_objetivo, usuario_id, tipo, recurso,
            identificador_solicitado, resultado, creado_por)
         VALUES ($1, $1, $2, 'cambio_configuracion', 'equipos/llave-maestra', $3, 'permitido', $2)`,
        [cop, ACTOR_INGESTA, l.referenciaNueva],
      );
      await c.query('COMMIT');
      return { credenciales, camaras, huellas: edge.rowCount ?? 0 };
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    }
  });

const CLAIMS_DE_INVENTARIO = JSON.stringify({
  rol: 'superadministrador',
  usuario_id: ACTOR_INGESTA,
  copropiedad_id: null,
  copropiedades: [],
});

/** Las copropiedades con algo que rotar. Todo sobre cuelga de un dispositivo (FK). */
const inventario = (pool: Pool): Promise<readonly string[]> =>
  conCliente(pool, async (c) => {
    await c.query("SELECT set_config('request.jwt.claims', $1, false)", [CLAIMS_DE_INVENTARIO]);
    const { rows } = await c.query<{ copropiedad_id: string }>(
      'SELECT DISTINCT copropiedad_id FROM public.dispositivos ORDER BY copropiedad_id',
    );
    return rows.map((r) => r.copropiedad_id);
  });

/**
 * La rotación entera. `soloEstas` acota a esas copropiedades (pruebas sobre una
 * base compartida); la herramienta de operador NO lo expone: una rotación a
 * medias dejaría a la API, que sólo conoce la nueva, sin poder abrir el resto.
 */
export const rotarLlaveDeEquipos = async (
  pool: Pool,
  llaves: LlavesDeLaRotacion,
  soloEstas?: readonly string[],
): Promise<InformeDeRotacion> => {
  validarLlaves(llaves);
  const copropiedades = soloEstas ?? (await inventario(pool));
  const total = { credenciales: 0, secretosDeCamara: 0, yaRotados: 0, huellasDelEdgeRetiradas: 0 };
  let historialIlegible = 0;
  for (const cop of copropiedades) {
    const r = await rotarCopropiedad(pool, llaves, cop);
    total.credenciales += r.credenciales.hechos;
    total.secretosDeCamara += r.camaras.hechos;
    total.yaRotados += r.credenciales.yaRotados + r.camaras.yaRotados;
    total.huellasDelEdgeRetiradas += r.huellas;
    historialIlegible += r.credenciales.ilegibles.length;
  }
  return { copropiedades: copropiedades.length, ...total, historialIlegible };
};
