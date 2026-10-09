import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * E2/C1 · EL PUENTE DE VIDEO REAL, ARRANCADO PARA UNA PRUEBA
 *
 * go2rtc no se versiona ni se descarga aquí: la prueba lo toma de `GO2RTC_BIN`
 * y, si no está, se OMITE con nombre («OMITIDA: sin GO2RTC_BIN»). Con él, se
 * arranca con un fichero de configuración temporal —la API en un puerto libre
 * del bucle local, sin RTSP ni WebRTC a la escucha— y se espera a que haya
 * registrado los esquemas de fuente que se usan (`ESQUEMAS_QUE_SE_ESPERAN`).
 * Es lo que permitió reproducir en el escritorio, sin equipo, el `HTTP 500 ·
 * EOF` visto en sitio el 28/09.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface Go2rtcDePruebas {
  /** `http://127.0.0.1:<puerto>`, sin barra final. */
  readonly url: string;
  /** A3 (15-S2) · el puerto del RTSP interno en 127.0.0.1, o `null` si está apagado. */
  readonly puertoRtsp: number | null;
  readonly rutaYaml: string;
  /** Lo que hay en el fichero de configuración ahora mismo. */
  readonly yaml: () => string;
  cerrar(): Promise<void>;
}

export const binarioGo2rtc = (): string | null => {
  const ruta = process.env['GO2RTC_BIN'];
  return ruta === undefined || ruta.trim() === '' ? null : ruta;
};

/** El rótulo con el que se omite una prueba cuando no hay binario. */
export const OMITIDA_SIN_BINARIO = 'OMITIDA: sin GO2RTC_BIN';

/**
 * A6 (15-S2) · ffmpeg en el PATH, que go2rtc usa para transcodificar. No se
 * descarga: sin él, la prueba se omite con nombre (`OMITIDA_SIN_FFMPEG`).
 */
export const binarioFfmpeg = (): string | null => {
  for (const d of (process.env['PATH'] ?? '').split(delimiter)) {
    if (d === '') continue;
    const ruta = join(d, 'ffmpeg');
    if (existsSync(ruta)) return ruta;
  }
  return null;
};

export const OMITIDA_SIN_FFMPEG = 'OMITIDA: sin ffmpeg en el PATH';

const puertoLibre = async (): Promise<number> => {
  const servidor = createServer();
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  const { port } = servidor.address() as AddressInfo;
  await new Promise<void>((listo) => servidor.close(() => listo()));
  return port;
};

/**
 * 15-S1 · LISTO NO ES «LA API CONTESTA». go2rtc v1.9.14 abre su API antes de
 * registrar los esquemas de fuente: `main.go` inicia los módulos en orden
 * (`api.Init` → `streams.Init` → … → `rtsp.Init` → `webrtc.Init` → … →
 * `isapi.Init`), y `rtsp` entra en `internal/rtsp/rtsp.go:39`. Entre medias,
 * `GET /api` ya da 200 y un `PATCH /api/streams` con una fuente `rtsp://`
 * recibe 400 «streams: source not supported» (`internal/streams/streams.go:98`).
 * Bajo carga ese hueco se ensancha: fue el 400 de la tercera corrida del
 * verificador de la 15-S1. Se espera a que `GET /api/schemes` liste los
 * esquemas que usan las pruebas; `isapi` es el último módulo que se inicia de
 * los tres, y `webrtc` registra `/api/webrtc` antes que su esquema.
 */
export const ESQUEMAS_QUE_SE_ESPERAN = ['rtsp', 'webrtc', 'isapi'] as const;

const esquemasRegistrados = async (url: string): Promise<readonly string[]> => {
  try {
    const r = await fetch(`${url}/api/schemes`, { signal: AbortSignal.timeout(500) });
    if (!r.ok) return [];
    const cuerpo: unknown = await r.json();
    return Array.isArray(cuerpo) ? cuerpo.filter((e): e is string => typeof e === 'string') : [];
  } catch {
    return []; // aún no escucha
  }
};

const esperarEsquemas = async (
  url: string,
  proceso: ChildProcess,
  plazoMs: number,
): Promise<void> => {
  const limite = Date.now() + plazoMs;
  let faltan: readonly string[] = ESQUEMAS_QUE_SE_ESPERAN;
  while (Date.now() < limite) {
    if (proceso.exitCode !== null) {
      throw new Error(`go2rtc terminó con código ${String(proceso.exitCode)} antes de escuchar`);
    }
    const registrados = await esquemasRegistrados(url);
    faltan = ESQUEMAS_QUE_SE_ESPERAN.filter((e) => !registrados.includes(e));
    if (faltan.length === 0) return;
    await new Promise((listo) => setTimeout(listo, 50));
  }
  throw new Error(
    `go2rtc no registró ${faltan.join(', ')} en ${url}/api/schemes en ${String(plazoMs)} ms`,
  );
};

/**
 * `lineasExtra` van al YAML tal cual: es como una prueba reproduce el
 * `streams: {}` que escribía la versión anterior de `pnpm sitio:video`.
 */
export const arrancarGo2rtc = async (
  binario: string,
  lineasExtra: readonly string[] = [],
  opciones: { readonly rtspInterno?: boolean } = {},
): Promise<Go2rtcDePruebas> => {
  const carpeta = mkdtempSync(join(tmpdir(), 'go2rtc-prueba-'));
  const rutaYaml = join(carpeta, 'go2rtc.yaml');
  const puerto = await puertoLibre();
  // A3 (15-S2) · la transcodificación lee de aquí; como en sitio, sólo 127.0.0.1.
  const puertoRtsp = opciones.rtspInterno === true ? await puertoLibre() : null;
  writeFileSync(
    rutaYaml,
    [
      'api:',
      `  listen: "127.0.0.1:${String(puerto)}"`,
      'rtsp:',
      `  listen: "${puertoRtsp === null ? '' : `127.0.0.1:${String(puertoRtsp)}`}"`,
      'webrtc:',
      '  listen: ""',
      // Sin STUN: con el de Google por omisión y sin Internet, la respuesta
      // tarda 5 s exactos (lo que expira la recogida ICE). Igual que en sitio.
      '  ice_servers: []',
      'log:',
      '  level: error',
      ...lineasExtra,
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  const proceso = spawn(binario, ['-config', rutaYaml], { stdio: 'ignore' });
  const url = `http://127.0.0.1:${String(puerto)}`;
  const cerrar = async (): Promise<void> => {
    if (proceso.exitCode === null) {
      const salida = new Promise<void>((listo) => proceso.once('exit', () => listo()));
      proceso.kill('SIGTERM');
      await Promise.race([salida, new Promise((listo) => setTimeout(listo, 3000))]);
      if (proceso.exitCode === null) proceso.kill('SIGKILL');
    }
    rmSync(carpeta, { recursive: true, force: true });
  };
  try {
    await esperarEsquemas(url, proceso, 10_000);
  } catch (error) {
    await cerrar();
    throw error;
  }
  return { url, puertoRtsp, rutaYaml, yaml: () => readFileSync(rutaYaml, 'utf8'), cerrar };
};

/**
 * 15-P · P1 · las DOS fuentes del flujo cuando el puente lleva también el audio
 * (opción A del ADR-01 enmendado, contingencia): el RTSP del equipo sin el canal
 * de retorno ONVIF —el fallo del 28/09— y el canal de retorno del fabricante.
 * Sólo para el banco de medida y el procedimiento de sitio: el producto no lo usa.
 */
export const fuentesDeAudioParaGo2rtc = (equipo: {
  readonly host: string;
  readonly puertoHttp: number;
  readonly puertoRtsp: number;
  readonly usuario: string;
  readonly clave: string;
}): readonly [string, string] => {
  const credencial = `${encodeURIComponent(equipo.usuario)}:${encodeURIComponent(equipo.clave)}`;
  return [
    `rtsp://${credencial}@${equipo.host}:${String(equipo.puertoRtsp)}/Streaming/Channels/101#backchannel=0`,
    `isapi://${credencial}@${equipo.host}:${String(equipo.puertoHttp)}/`,
  ];
};

/** La misma oferta con la que el ensayo en sitio negocia contra el puente real. */
export { OFERTA_SDP_DE_SONDA as OFERTA_SDP_DE_PRUEBA } from '../ensayo/oferta-sdp-de-sonda';
