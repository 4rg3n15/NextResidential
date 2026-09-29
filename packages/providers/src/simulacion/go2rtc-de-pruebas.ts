import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * E2/C1 · EL PUENTE DE VIDEO REAL, ARRANCADO PARA UNA PRUEBA
 *
 * go2rtc no se versiona ni se descarga aquí: la prueba lo toma de `GO2RTC_BIN`
 * y, si no está, se OMITE con nombre («OMITIDA: sin GO2RTC_BIN»). Con él, se
 * arranca con un fichero de configuración temporal —la API en un puerto libre
 * del bucle local, sin RTSP ni WebRTC a la escucha— y se espera a que `GET
 * /api` conteste. Es lo que permitió reproducir en el escritorio, sin equipo,
 * el `HTTP 500 · EOF` visto en sitio el 28/09.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface Go2rtcDePruebas {
  /** `http://127.0.0.1:<puerto>`, sin barra final. */
  readonly url: string;
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

const puertoLibre = async (): Promise<number> => {
  const servidor = createServer();
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  const { port } = servidor.address() as AddressInfo;
  await new Promise<void>((listo) => servidor.close(() => listo()));
  return port;
};

const esperarApi = async (url: string, proceso: ChildProcess, plazoMs: number): Promise<void> => {
  const limite = Date.now() + plazoMs;
  while (Date.now() < limite) {
    if (proceso.exitCode !== null) {
      throw new Error(`go2rtc terminó con código ${String(proceso.exitCode)} antes de escuchar`);
    }
    try {
      const r = await fetch(`${url}/api`, { signal: AbortSignal.timeout(500) });
      if (r.ok) return;
    } catch {
      // aún no escucha
    }
    await new Promise((listo) => setTimeout(listo, 100));
  }
  throw new Error(`go2rtc no contestó en ${url}/api en ${String(plazoMs)} ms`);
};

/**
 * `lineasExtra` van al YAML tal cual: es como una prueba reproduce el
 * `streams: {}` que escribía la versión anterior de `pnpm sitio:video`.
 */
export const arrancarGo2rtc = async (
  binario: string,
  lineasExtra: readonly string[] = [],
): Promise<Go2rtcDePruebas> => {
  const carpeta = mkdtempSync(join(tmpdir(), 'go2rtc-prueba-'));
  const rutaYaml = join(carpeta, 'go2rtc.yaml');
  const puerto = await puertoLibre();
  writeFileSync(
    rutaYaml,
    [
      'api:',
      `  listen: "127.0.0.1:${String(puerto)}"`,
      'rtsp:',
      '  listen: ""',
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
    await esperarApi(url, proceso, 10_000);
  } catch (error) {
    await cerrar();
    throw error;
  }
  return { url, rutaYaml, yaml: () => readFileSync(rutaYaml, 'utf8'), cerrar };
};

/** La misma oferta con la que el ensayo en sitio negocia contra el puente real. */
export { OFERTA_SDP_DE_SONDA as OFERTA_SDP_DE_PRUEBA } from '../ensayo/oferta-sdp-de-sonda';
