import type { DiagnosticoDeEquipo } from '../diagnostico/diagnostico-de-equipo';
import type { FichaDelEquipo } from '../diagnostico/ficha';
import { juzgarZona } from './zona-del-equipo';
import { resultado } from './tipos';
import type { FamiliaDeEnsayo, ResultadoDePaso } from './tipos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * J1 · PASOS 1, 2, 3 Y 7 · LO QUE SE SABE LEYENDO, SIN MOVER NADA
 *
 * Salen del MISMO diagnóstico que usa «Probar conexión» en la consola: una sola
 * ronda de lecturas contra el equipo, y el ensayo no puede opinar distinto de
 * la ficha. Aquí sólo se traduce a causa y acción.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const PREFIJO: Readonly<Record<FamiliaDeEnsayo, string>> = {
  camara: 'BARRERA',
  terminal: 'TERMINAL',
  videoportero: 'VIDEOPORTERO',
};

export const pasoDeConexion = (
  d: DiagnosticoDeEquipo,
  familia: FamiliaDeEnsayo,
): ResultadoDePaso => {
  const p = PREFIJO[familia];
  if (d.contacto.clase === 'sin_equipo') {
    return resultado(
      'conexion',
      'fallo',
      'No contesta ningún equipo en esa dirección',
      `Compruebe ${p}_HOST y ${p}_PUERTO en apps/api/.env, que el equipo tenga corriente ` +
        'y que el Mac esté en la misma red (misma VLAN, sin datos móviles)',
    );
  }
  if (d.contacto.clase === 'credencial') {
    return resultado(
      'conexion',
      'fallo',
      'Hay un equipo en esa dirección y rechazó el usuario o la clave (Digest)',
      `NO repita el ensayo: corrija ${p}_USUARIO y ${p}_CLAVE. Tras varios intentos ` +
        'fallidos el equipo bloquea la IP del Mac unos 30 minutos',
    );
  }
  const identidad = [d.modelo, d.firmware].filter((x) => x !== null).join(' · ');
  return resultado(
    'conexion',
    'ok',
    `Digest aceptado${identidad === '' ? '' : ` · ${identidad}`}` +
      (d.contacto.latenciaMs === null ? '' : ` · ${String(Math.round(d.contacto.latenciaMs))} ms`),
  );
};

export const pasoDeHora = (
  d: DiagnosticoDeEquipo,
  documentoDeHora: string | null,
  zona: string,
  ahora: Date,
): ResultadoDePaso => {
  if (d.hora === null || documentoDeHora === null) {
    return resultado(
      'hora',
      'fallo',
      'El equipo no dijo su hora',
      'Mírela en el panel web del equipo (Configuración → Sistema → Hora) y anótela en la hoja',
    );
  }
  const juicio = juzgarZona(documentoDeHora, zona, ahora);
  const detalle = [`hora del equipo: ${d.hora.leida ?? '(ilegible)'}`, juicio.detalle];
  const accionDeReloj =
    'En el panel web del equipo: Configuración → Sistema → Hora. Zona «(GMT-05:00) Bogotá» ' +
    'y sincronización con NTP o con el Mac. Después, repita el ensayo';
  if (juicio.correcta === false) {
    return resultado(
      'hora',
      'fallo',
      `Zona horaria equivocada: ${juicio.detalle}`,
      accionDeReloj,
      detalle,
    );
  }
  if (d.hora.excesiva) return resultado('hora', 'fallo', d.hora.detalle, accionDeReloj, detalle);
  if (d.hora.desvioSegundos === null) {
    return resultado('hora', 'fallo', d.hora.detalle, accionDeReloj, detalle);
  }
  if (juicio.correcta === null) {
    return resultado(
      'hora',
      'fallo',
      `Hora bien (${String(d.hora.desvioSegundos)} s), pero ${juicio.detalle}`,
      'Compruebe la zona en el panel web del equipo: debe ser (GMT-05:00) Bogotá',
      detalle,
    );
  }
  return resultado(
    'hora',
    'ok',
    `Desvío ${String(d.hora.desvioSegundos)} s respecto del Mac · ${juicio.detalle}`,
    null,
    detalle,
  );
};

/**
 * Paso 3: la ficha del equipo. Un BLOQUEO es un fallo; un aviso se enseña
 * pero no suspende; lo que no se pudo leer se dice. `extras` son los hallazgos
 * que sólo lee el ensayo (capacidades de personas y de la biblioteca).
 */
export const pasoDeConfiguracion = (
  ficha: FichaDelEquipo,
  extras: { readonly fallos: readonly string[]; readonly notas: readonly string[] },
): ResultadoDePaso => {
  const bloqueos = ficha.hallazgos.filter((h) => h.estado === 'bloqueo');
  const avisos = ficha.hallazgos.filter((h) => h.estado === 'aviso');
  const detalle = [
    ...ficha.hallazgos.map(
      (h) =>
        `${h.estado === 'conforme' ? '✓' : h.estado === 'bloqueo' ? '✗' : h.estado === 'aviso' ? '⚠' : '·'} ` +
        `${h.campo}: ${h.valorLeido ?? 'sin leer'}` +
        (h.estado === 'conforme' ? '' : ` — ${h.detalle}`),
    ),
    ...extras.notas,
    ...ficha.sinComprobar.map((s) => `· sin respuesta: ${s}`),
  ];
  const fallos = [...bloqueos.map((b) => `${b.campo}: ${b.detalle}`), ...extras.fallos];
  if (fallos.length > 0) {
    return resultado(
      'configuracion',
      'fallo',
      fallos.join(' · '),
      'Corrija desde la ficha del equipo en la consola (Dispositivos → Probar conexión → ' +
        'Corregir) o en su panel web; después repita el ensayo',
      detalle,
    );
  }
  return resultado(
    'configuracion',
    'ok',
    avisos.length === 0
      ? 'La configuración leída es la que la plataforma necesita'
      : `Sin bloqueos; ${String(avisos.length)} aviso(s) para anotar en la hoja`,
    null,
    detalle,
  );
};

export const pasoDeVideo = (d: DiagnosticoDeEquipo, familia: FamiliaDeEnsayo): ResultadoDePaso => {
  const v = d.video;
  const p = PREFIJO[familia];
  if (v === undefined) return resultado('video', 'no_aplica', 'Este equipo no entrega video');
  // V2 (15-N) · de dónde salió el canal, si no fue de la ficha.
  const donde =
    `canal ${v.canal}, puerto RTSP ${String(v.puerto)}` +
    (v.origenDelCanal === 'propuesto'
      ? v.sustituido === null || v.sustituido === undefined
        ? ', declarado por el equipo'
        : `, declarado por el equipo en lugar del ${v.sustituido}`
      : '');
  if (v.clase === 'credencial') {
    return resultado(
      'video',
      'fallo',
      `El equipo rechazó la credencial por RTSP (${donde})`,
      'El usuario de servicio necesita permiso de vista en vivo: actívelo en el panel web ' +
        '(Usuarios → permisos → Vista en directo)',
    );
  }
  if (v.clase === 'inalcanzable') {
    return resultado(
      'video',
      'fallo',
      `No contesta por RTSP (${donde}): ${v.detalle}`,
      'Compruebe VIDEO_PUERTO_RTSP en apps/api/.env y que RTSP esté activo en el equipo ' +
        '(Red → Avanzado → Puertos)',
    );
  }
  if (v.clase === 'rechazo') {
    // V3 (15-N) · 403, 404/412 y 454 en palabras (la sonda ya lo dice).
    return resultado(
      'video',
      'fallo',
      `${v.detalle.charAt(0).toUpperCase()}${v.detalle.slice(1)} (${donde})`,
      `Pruebe otro canal en ${p}_CANAL_VIDEO (101 es el principal) y, si funciona, póngalo ` +
        'también en la ficha del equipo en la consola',
    );
  }
  if (v.codec !== 'H.264') {
    return resultado(
      'video',
      'fallo',
      `El equipo entrega ${v.codec ?? 'un códec que no se pudo leer'} (${donde}); el navegador ` +
        'sólo reproduce H.264',
      'En el panel web: Configuración → Video/Audio → subflujo → codificación H.264',
    );
  }
  return resultado('video', 'ok', `H.264 por RTSP (${donde})`);
};
