/**
 * ═════════════════════════════════════════════════════════════════════════════
 * `pnpm sitio:ensayo` · DE DÓNDE SALEN LOS EQUIPOS QUE SE ENSAYAN · C6 (15-M)
 *
 *  1. Del REGISTRO de la consola (tabla `dispositivos`), con la credencial
 *     descifrada por la bóveda de EQUIPOS_LLAVE: N equipos por familia, con
 *     cualquier IP, sin tocar el .env (`equipos-del-registro.mjs`).
 *  2. Si la base no está al alcance o el registro no tiene equipos completos,
 *     del .env: UN equipo por familia (BARRERA_*, TERMINAL_*, VIDEOPORTERO_*),
 *     como RESPALDO, y se dice.
 *  3. En `--simulado`, los que monta el paquete (seis: dos por familia).
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { equiposDelRegistro } from './equipos-del-registro.mjs';

export const FAMILIAS = [
  { familia: 'camara', prefijo: 'BARRERA' },
  { familia: 'terminal', prefijo: 'TERMINAL' },
  { familia: 'videoportero', prefijo: 'VIDEOPORTERO' },
];

export const numero = (texto, porOmision) => {
  const n = Number(texto);
  return texto !== undefined && texto !== '' && Number.isInteger(n) && n > 0 ? n : porOmision;
};

/** Un equipo del .env, o `null` si no está declarado. `salir` si está a medias. */
export const desdeEntorno = ({ familia, prefijo }, entorno, salir) => {
  const e = (s) => (entorno[`${prefijo}_${s}`] ?? '').trim();
  if (e('HOST') === '' && e('USUARIO') === '' && e('CLAVE') === '') return null;
  const faltan = ['HOST', 'USUARIO', 'CLAVE'].filter((s) => e(s) === '');
  if (faltan.length > 0)
    salir(`faltan ${faltan.map((s) => `${prefijo}_${s}`).join(', ')} en el .env`);
  // V2 (15-N) · sin canal en el .env, el que el equipo declara (nunca 102 a ciegas).
  const video = e('CANAL_VIDEO') || null;
  if (video !== null && !/^[1-9][0-9]{2,3}$/.test(video)) {
    salir(`${prefijo}_CANAL_VIDEO no es un canal: «${video}»`);
  }
  return {
    familia,
    host: e('HOST'),
    puerto: numero(e('PUERTO'), 80),
    usuario: e('USUARIO'),
    clave: e('CLAVE'),
    puerta: numero(e('CANAL'), 1),
    canalDeVideo: video,
    puertoRtsp: numero(entorno.VIDEO_PUERTO_RTSP, 554),
    tiempoLimiteMs: numero(entorno.EQUIPOS_TIEMPO_LIMITE_MS, 5000),
  };
};

/** Los equipos a ensayar y de dónde salieron: registro, .env (respaldo) o simulado. */
export const elegirEquipos = async ({ sim, pool, entorno, decir, salir }) => {
  if (sim !== null) return { equipos: sim.equipos, origen: 'simulado' };
  const registro =
    pool !== null && (entorno.EQUIPOS_LLAVE ?? '') !== ''
      ? await equiposDelRegistro(pool, entorno.EQUIPOS_LLAVE, {
          puertoRtsp: numero(entorno.VIDEO_PUERTO_RTSP, 554),
          tiempoLimiteMs: numero(entorno.EQUIPOS_TIEMPO_LIMITE_MS, 5000),
        }).catch((error) => {
          decir(`⚠ no se pudo leer el registro de equipos: ${error.message}`);
          return { equipos: [], incompletos: [] };
        })
      : { equipos: [], incompletos: [] };
  for (const i of registro.incompletos) decir(`⚠ ${i.nombre}: no se ensaya, ${i.motivo}`);
  if (registro.equipos.length > 0) {
    return { equipos: registro.equipos, origen: 'registro de la consola' };
  }
  return {
    equipos: FAMILIAS.map((f) => desdeEntorno(f, entorno, salir)).filter((e) => e !== null),
    origen: '.env (respaldo: el registro no tiene equipos)',
  };
};
