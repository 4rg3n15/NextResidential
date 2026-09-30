/**
 * ═════════════════════════════════════════════════════════════════════════════
 * V4 (15-N) · EL REGISTRO DE go2rtc NO PUEDE LLEVAR LA CLAVE DE LOS EQUIPOS
 *
 * Visto en sitio el 29/09 y medido con go2rtc v1.9.14 oficial: con el módulo
 * `api` en `trace`, go2rtc escribe cada petición con su consulta entera,
 *
 *   TRC [api] PATCH /api/streams?name=…&src=rtsp%3A%2F%2Fusuario%3Aclave%40…
 *
 * y la fuente RTSP lleva la credencial del equipo (URL-codificada, no oculta).
 * La clave quedó en el registro del Mac y hay que rotarla.
 *
 * ¿Se puede registrar la fuente sin que la clave viaje en la consulta? Medido:
 * go2rtc v1.9.14 SÓLO lee `name` y `src` de la consulta; un `PATCH` con los
 * mismos campos en el cuerpo (`application/x-www-form-urlencoded`) contesta 200
 * y NO registra nada. Y un alias en el YAML exigiría escribir la credencial en
 * el fichero, que es lo que la 15-M retiró (RN-21). No hay otra vía en esta
 * versión: es un RIESGO ACEPTADO, con estas mitigaciones:
 *
 *  · la API de go2rtc escucha sólo en el bucle local (`--api-en-red` aparte);
 *  · `pnpm sitio:video` NO arranca con `api` o `rtsp` en `trace`/`debug`
 *    —tampoco si heredan ese nivel del general— salvo con `--permitir-traza`,
 *    y entonces avisa de que la clave quedará en el registro;
 *  · ni la guía ni el ensayo sugieren subirlo.
 *
 * `VIDEO_REGISTRO` (opcional, en `apps/api/.env`): el nivel general y, si hace
 * falta, por módulo: `info` · `info,webrtc=debug`. Por omisión, `info`.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const NIVELES_DE_GO2RTC = ['trace', 'debug', 'info', 'warn', 'error'];

/** Los módulos de go2rtc que escriben la fuente RTSP —con la clave— a trace/debug. */
export const MODULOS_CON_LA_FUENTE = ['api', 'rtsp'];

const ruidoso = (nivel) => nivel === 'trace' || nivel === 'debug';

/**
 * Lee `VIDEO_REGISTRO`. Devuelve `{ nivel, modulos }` o `{ error }`, sin
 * aceptar nada que no sea un nivel conocido y un nombre de módulo simple:
 * lo que sale de aquí se escribe en el YAML.
 */
export const leerRegistro = (texto) => {
  const limpio = (texto ?? '').trim();
  if (limpio === '') return { nivel: 'info', modulos: {} };
  let nivel = 'info';
  const modulos = {};
  for (const [i, pieza] of limpio
    .split(',')
    .map((p) => p.trim())
    .entries()) {
    const par = /^([a-z0-9_]+)=([a-z]+)$/.exec(pieza);
    if (par !== null) {
      if (!NIVELES_DE_GO2RTC.includes(par[2])) return { error: `nivel desconocido «${par[2]}»` };
      modulos[par[1]] = par[2];
      continue;
    }
    if (i === 0 && NIVELES_DE_GO2RTC.includes(pieza)) {
      nivel = pieza;
      continue;
    }
    return { error: `«${pieza}» no es un nivel ni un módulo=nivel` };
  }
  return { nivel, modulos };
};

/** Qué módulos con la fuente quedan en trace/debug, contando la herencia del general. */
export const modulosQueExponenLaClave = ({ nivel, modulos }) =>
  MODULOS_CON_LA_FUENTE.filter((m) => ruidoso(modulos[m] ?? nivel)).map(
    (m) => `${m}=${modulos[m] ?? nivel}`,
  );

/**
 * El veredicto para `sitio:video`: las líneas `log:` del YAML y, si algún
 * módulo expondría la clave, un error (sin `--permitir-traza`) o un aviso.
 */
export const juzgarRegistro = (texto, permitirTraza) => {
  const registro = leerRegistro(texto);
  if ('error' in registro) {
    return { error: `VIDEO_REGISTRO no es válido: ${registro.error}`, aviso: null, lineas: [] };
  }
  const expuestos = modulosQueExponenLaClave(registro);
  const lineas = [
    'log:',
    `  level: ${registro.nivel}`,
    ...Object.entries(registro.modulos).map(([m, n]) => `  ${m}: ${n}`),
  ];
  if (expuestos.length === 0) return { error: null, aviso: null, lineas };
  const riesgo =
    `con ${expuestos.join(', ')} go2rtc escribe en su registro la URL RTSP de cada equipo ` +
    'CON SU CLAVE (visto en sitio el 29/09)';
  return permitirTraza
    ? {
        error: null,
        aviso: `${riesgo}. Arrancado por --permitir-traza: al terminar, borre el registro y ROTE la clave de los equipos.`,
        lineas,
      }
    : {
        error: `${riesgo}. Use VIDEO_REGISTRO=info (o suba sólo otros módulos, p. ej. info,webrtc=debug). Si de verdad necesita esa traza, repita con --permitir-traza y rote después la clave de los equipos.`,
        aviso: null,
        lineas,
      };
};
