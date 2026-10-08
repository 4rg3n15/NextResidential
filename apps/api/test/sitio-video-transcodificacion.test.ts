import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  RTSP_INTERNO,
  buscarFfmpeg,
  escuchaRtspInterna,
  juzgarFfmpeg,
  politicaDeTranscodificacion,
  puenteDelEnsayo,
} from '../../../scripts/lib/transcodificacion-del-puente.mjs';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * A3 (15-S2) · `pnpm sitio:video` Y LA TRANSCODIFICACIÓN
 *
 * Con VIDEO_TRANSCODIFICAR=auto (por omisión) el puente necesita su RTSP
 * interno —sólo en 127.0.0.1: go2rtc deja entrar sin credencial desde el
 * propio Mac— y ffmpeg. `--preparar` falla si falta ffmpeg y dice
 * `brew install ffmpeg`; no lo descarga. Con `nunca`, todo como en la 15-S1.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const GUION = resolve(__dirname, '../../../scripts/sitio-video.mjs');
const carpeta = mkdtempSync(join(tmpdir(), 'sitio-video-a3-'));
afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

const sinFfmpeg = join(carpeta, 'sin-ffmpeg');
mkdirSync(sinFfmpeg, { recursive: true });
let corrida = 0;

const correr = (env: string, ...extra: string[]) => {
  corrida += 1;
  const ruta = join(carpeta, `api-${String(corrida)}.env`);
  const destino = join(carpeta, `sitio-${String(corrida)}`);
  writeFileSync(ruta, `GO2RTC_URL=http://127.0.0.1:1984\nVIDEO_IP_ANUNCIADA=192.0.2.16\n${env}`);
  const r = spawnSync(process.execPath, [GUION, '--env', ruta, '--dir', destino, ...extra], {
    encoding: 'utf8',
    timeout: 20_000,
    // GO2RTC_BIN presente: nunca descarga ni arranca nada de verdad aquí.
    env: { ...process.env, GO2RTC_BIN: process.execPath, PATH: sinFfmpeg },
  });
  const yaml = (): string => readFileSync(join(destino, 'go2rtc.yaml'), 'utf8');
  return { codigo: r.status, salida: `${r.stdout}${r.stderr}`, yaml };
};

describe('A3 · el RTSP interno de go2rtc', () => {
  it('auto (por omisión): escucha en 127.0.0.1 y nunca en la red', () => {
    const r = correr('', '--solo-configuracion');
    expect(r.codigo, r.salida).toBe(0);
    expect(r.yaml()).toMatch(/rtsp:\n {2}listen: "127\.0\.0\.1:8554"/);
    expect(r.yaml()).not.toMatch(/listen: "(?:0\.0\.0\.0)?:8554"/);
  });

  it('nunca: apagado, como en la 15-S1', () => {
    const r = correr('VIDEO_TRANSCODIFICAR=nunca\n', '--solo-configuracion');
    expect(r.codigo, r.salida).toBe(0);
    expect(r.yaml()).toMatch(/rtsp:\n {2}listen: ""/);
  });

  it('un valor que no es auto ni nunca no llega al YAML', () => {
    const r = correr('VIDEO_TRANSCODIFICAR=siempre\n', '--solo-configuracion');
    expect(r.codigo).toBe(1);
    expect(r.salida).toMatch(/VIDEO_TRANSCODIFICAR debe ser «auto» o «nunca», no «siempre»/);
  });
});

describe('A3 · ffmpeg', () => {
  it('--preparar sin ffmpeg y con auto: falla, dice brew install ffmpeg y no descarga nada', () => {
    const r = correr('', '--preparar');
    expect(r.codigo).toBe(1);
    expect(r.salida).toContain('`brew install ffmpeg`');
    expect(r.salida).not.toMatch(/descargando/);
  });

  it('--preparar sin ffmpeg y con nunca: listo, y dice que sólo Safari verá H.265', () => {
    const r = correr('VIDEO_TRANSCODIFICAR=nunca\n', '--preparar');
    expect(r.codigo, r.salida).toBe(0);
    expect(r.salida).toMatch(/sólo se ve en Safari/);
  });

  it('las funciones puras: buscar en el PATH, juzgar, política y escucha', () => {
    const existe = (ruta: string) => ruta === join('/opt/b', 'ffmpeg');
    expect(buscarFfmpeg(['/opt/a', '', '/opt/b'].join(':'), existe)).toBe('/opt/b/ffmpeg');
    expect(buscarFfmpeg(undefined, existe)).toBeNull();
    expect(juzgarFfmpeg('auto', '/opt/b/ffmpeg')).toEqual({
      falta: false,
      frase: 'ffmpeg en /opt/b/ffmpeg: el puente transcodifica H.265 a H.264',
    });
    expect(juzgarFfmpeg('auto', null).falta).toBe(true);
    expect(juzgarFfmpeg('nunca', null).falta).toBe(false);
    expect(politicaDeTranscodificacion(undefined)).toEqual({ politica: 'auto', error: null });
    expect(politicaDeTranscodificacion(' nunca ')).toEqual({ politica: 'nunca', error: null });
    expect(escuchaRtspInterna('auto')).toBe(RTSP_INTERNO);
    expect(RTSP_INTERNO.startsWith('127.0.0.1:')).toBe(true);
    expect(escuchaRtspInterna('nunca')).toBe('');
  });

  it('el paso 7 del ensayo recibe la MISMA política que la API', () => {
    expect(puenteDelEnsayo({})).toEqual({});
    expect(puenteDelEnsayo({ GO2RTC_URL: 'http://127.0.0.1:1984' })).toEqual({
      puente: { url: 'http://127.0.0.1:1984', transcodificar: 'auto' },
    });
    expect(
      puenteDelEnsayo({ GO2RTC_URL: 'http://127.0.0.1:1984', VIDEO_TRANSCODIFICAR: 'nunca' }),
    ).toMatchObject({ puente: { transcodificar: 'nunca' } });
  });
});
