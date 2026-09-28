import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D1 (ETAPA 15-L) · `pnpm sitio:video` GENERA LA CONFIGURACIÓN DESDE EL `.env`
 *
 * Se ejecuta el guion de verdad, con `--solo-configuracion` (sin descargar ni
 * arrancar go2rtc), contra un `.env` de prueba en una carpeta temporal. Lo que
 * se exige es lo que promete la guía: la API de go2rtc en el bucle local, el
 * medio anunciado en la IP y el puerto del `.env`, ningún flujo y NINGUNA
 * credencial en el fichero, aunque el `.env` las tenga.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const GUION = resolve(__dirname, '../../../scripts/sitio-video.mjs');
const carpeta = mkdtempSync(join(tmpdir(), 'sitio-video-'));
afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

let corrida = 0;
const correr = (env: string, ...extra: string[]) => {
  corrida += 1;
  const ruta = join(carpeta, `api-${String(corrida)}.env`);
  const destino = join(carpeta, `sitio-${String(corrida)}`);
  writeFileSync(ruta, env);
  const r = spawnSync(
    process.execPath,
    [GUION, '--solo-configuracion', '--env', ruta, '--dir', destino, ...extra],
    { encoding: 'utf8', timeout: 20_000 },
  );
  const yaml = (): string => readFileSync(join(destino, 'go2rtc.yaml'), 'utf8');
  return { codigo: r.status, salida: `${r.stdout}${r.stderr}`, yaml };
};

const CLAVE = 'clave-de-sonda-que-no-debe-salir';

describe('pnpm sitio:video · configuración de go2rtc (D1)', () => {
  it('bucle local, medio anunciado, sin flujos y sin credenciales', () => {
    const r = correr(
      [
        '# comentario',
        'GO2RTC_URL=http://127.0.0.1:1984',
        'VIDEO_IP_ANUNCIADA=192.0.2.10',
        'VIDEO_PUERTO_WEBRTC="8600"',
        `TERMINAL_CLAVE=${CLAVE}`,
        `EQUIPOS_LLAVE_DE_CIFRADO=${CLAVE}`,
        '',
      ].join('\n'),
    );
    expect(r.codigo, r.salida).toBe(0);
    const yaml = r.yaml();
    expect(yaml).toContain('listen: "127.0.0.1:1984"');
    expect(yaml).toContain('listen: ":8600"');
    expect(yaml).toContain('- "192.0.2.10:8600"');
    expect(yaml).toContain('streams: {}');
    expect(yaml).toMatch(/rtsp:\n {2}listen: ""/);
    expect(yaml).not.toContain(CLAVE);
    expect(yaml).not.toMatch(/rtsp:\/\//);
    expect(r.salida).not.toContain(CLAVE);
  });

  it('sin puerto en la URL, el de go2rtc; sin puerto WebRTC, el 8555', () => {
    const r = correr('GO2RTC_URL=http://localhost\nVIDEO_IP_ANUNCIADA=192.0.2.11\n');
    expect(r.codigo, r.salida).toBe(0);
    expect(r.yaml()).toContain('listen: "localhost:1984"');
    expect(r.yaml()).toContain('- "192.0.2.11:8555"');
  });

  it('sin GO2RTC_URL no escribe nada y dice qué poner', () => {
    const r = correr('VIDEO_IP_ANUNCIADA=192.0.2.12\n');
    expect(r.codigo).toBe(1);
    expect(r.salida).toMatch(/GO2RTC_URL está vacía.*http:\/\/127\.0\.0\.1:1984/s);
    expect(() => r.yaml()).toThrow();
  });

  it('la API de go2rtc abierta a la red se niega, salvo --api-en-red', () => {
    const env = 'GO2RTC_URL=http://192.0.2.20:1984\nVIDEO_IP_ANUNCIADA=192.0.2.12\n';
    const negada = correr(env);
    expect(negada.codigo).toBe(1);
    expect(negada.salida).toMatch(/quedaría abierta en la red.*--api-en-red/s);
    const permitida = correr(env, '--api-en-red');
    expect(permitida.codigo, permitida.salida).toBe(0);
    expect(permitida.yaml()).toContain('listen: "192.0.2.20:1984"');
  });

  it('valores que romperían el YAML se rechazan en vez de escribirse', () => {
    const ip = correr('GO2RTC_URL=http://127.0.0.1:1984\nVIDEO_IP_ANUNCIADA=192.0.2.14" x\n');
    expect(ip.codigo).toBe(1);
    expect(ip.salida).toMatch(/VIDEO_IP_ANUNCIADA no es una dirección/);
    const puerto = correr(
      'GO2RTC_URL=http://127.0.0.1:1984\nVIDEO_IP_ANUNCIADA=192.0.2.13\nVIDEO_PUERTO_WEBRTC=99999\n',
    );
    expect(puerto.codigo).toBe(1);
    expect(puerto.salida).toMatch(/VIDEO_PUERTO_WEBRTC no es un puerto/);
    const url = correr('GO2RTC_URL=rtsp://127.0.0.1:1984\nVIDEO_IP_ANUNCIADA=192.0.2.13\n');
    expect(url.codigo).toBe(1);
    expect(url.salida).toMatch(/no es una URL http/);
  });

  it('--preparar deja fichero y binario listos, sin arrancar nada', () => {
    const ruta = join(carpeta, 'preparar.env');
    writeFileSync(ruta, 'GO2RTC_URL=http://127.0.0.1:1984\nVIDEO_IP_ANUNCIADA=192.0.2.15\n');
    // Un binario ya presente (GO2RTC_BIN): no descarga, y con --preparar no lo lanza.
    const r = spawnSync(
      process.execPath,
      [GUION, '--preparar', '--env', ruta, '--dir', join(carpeta, 'preparado')],
      { encoding: 'utf8', timeout: 20_000, env: { ...process.env, GO2RTC_BIN: process.execPath } },
    );
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('go2rtc listo');
    expect(r.stdout).not.toMatch(/descargando|▶/);
    expect(readFileSync(join(carpeta, 'preparado', 'go2rtc.yaml'), 'utf8')).toContain(
      '192.0.2.15:8555',
    );
  });

  it('sin el .env no inventa nada', () => {
    const r = spawnSync(
      process.execPath,
      [GUION, '--solo-configuracion', '--env', join(carpeta, 'no-existe.env')],
      {
        encoding: 'utf8',
        timeout: 20_000,
      },
    );
    expect(r.status).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toMatch(/no existe .*copie apps\/api\/\.env\.example/);
  });
});
