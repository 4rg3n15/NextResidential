#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * pnpm sitio:video · ETAPA 15-L (D1) · EL PUENTE DE VIDEO EN EL MAC
 *
 * Hasta la 15-L nadie arrancaba go2rtc: ni guion, ni configuración, ni versión
 * (Bloque 0.4). Esto lo deja en un comando:
 *
 *   1. Lee `apps/api/.env` (el MISMO que usa la API): `GO2RTC_URL` dice dónde
 *      escucha la API de go2rtc; `VIDEO_IP_ANUNCIADA` (opcional) qué dirección
 *      del Mac se anuncia al navegador para el medio.
 *   2. Genera `.sitio/go2rtc.yaml`, que NO se versiona: sin flujos y SIN
 *      CREDENCIALES. La API registra el flujo RTSP de cada equipo al pedirlo,
 *      con la credencial que guarda cifrada; el fichero no la ve nunca.
 *   3. Si go2rtc no está (ni en el PATH, ni en `.sitio/bin`, ni en
 *      `GO2RTC_BIN`), lo descarga para la arquitectura del Mac y dice su
 *      SHA-256. La versión se fija con `GO2RTC_VERSION` (p. ej. v1.9.9).
 *   4. Lo arranca en primer plano. Ctrl+C lo para.
 *
 *   pnpm sitio:video                          # genera y arranca
 *   pnpm sitio:video -- --solo-configuracion  # sólo escribe el fichero
 *   pnpm sitio:video -- --preparar            # fichero + binario, sin arrancar
 *                                             # (antes de salir, con Internet)
 *   opciones: --env <ruta> (apps/api/.env) · --dir <carpeta> (.sitio)
 *             --api-en-red  (deja la API de go2rtc fuera del bucle local)
 *
 * La API de go2rtc da de alta flujos y, con ellos, órdenes que ejecuta el Mac:
 * abierta a la red, cualquiera en el conjunto la usaría. Por eso, si
 * `GO2RTC_URL` no es del bucle local, NO arranca salvo con `--api-en-red`.
 *
 * Todo lo que varía en sitio sale del `.env`: nada obliga a tocar código.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ipDelMac } from './lib/red-del-mac.mjs';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const opcion = (nombre, porOmision) => {
  const i = args.indexOf(nombre);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : porOmision;
};
const soloConfiguracion = args.includes('--solo-configuracion');
const apiEnRed = args.includes('--api-en-red');
const preparar = args.includes('--preparar');
const rutaEnv = resolve(RAIZ, opcion('--env', 'apps/api/.env'));
const carpeta = resolve(RAIZ, opcion('--dir', '.sitio'));

const salir = (mensaje) => {
  console.error(`✗ ${mensaje}`);
  process.exit(1);
};

/** KEY=VALOR, sin comentarios ni comillas. No interpreta nada más. */
const leerEnv = (ruta) => {
  if (!existsSync(ruta)) salir(`no existe ${ruta}: copie apps/api/.env.example y rellénelo`);
  const valores = new Map();
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linea);
    if (m === null) continue;
    valores.set(m[1], m[2].replace(/^(['"])(.*)\1$/, '$2'));
  }
  return valores;
};

const env = leerEnv(rutaEnv);
const urlDelPuente = env.get('GO2RTC_URL') ?? '';
if (urlDelPuente === '') {
  salir(
    `GO2RTC_URL está vacía en ${rutaEnv}. Escriba GO2RTC_URL=http://127.0.0.1:1984 ` +
      '(la API y go2rtc en el mismo Mac) y repita.',
  );
}
const u = URL.canParse(urlDelPuente) ? new URL(urlDelPuente) : null;
if (u === null || u.protocol !== 'http:') salir(`GO2RTC_URL no es una URL http: «${urlDelPuente}»`);
const escucha = `${u.hostname}:${u.port === '' ? '1984' : u.port}`;
if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost' && !apiEnRed) {
  salir(
    `GO2RTC_URL apunta a ${u.hostname}: la API de go2rtc quedaría abierta en la red. ` +
      'Con la API en el mismo Mac, use http://127.0.0.1:1984; si de verdad está en ' +
      'otra máquina, repita con --api-en-red.',
  );
}

const ip = env.get('VIDEO_IP_ANUNCIADA') || ipDelMac();
if (ip === null) {
  salir('no se encontró la IP del Mac en la red local: escriba VIDEO_IP_ANUNCIADA en el .env');
}
if (!/^[A-Za-z0-9.:-]+$/.test(ip)) salir(`VIDEO_IP_ANUNCIADA no es una dirección: «${ip}»`);
const puertoWebrtc = env.get('VIDEO_PUERTO_WEBRTC') || '8555';
if (!/^\d{1,5}$/.test(puertoWebrtc) || Number(puertoWebrtc) > 65535) {
  salir(`VIDEO_PUERTO_WEBRTC no es un puerto: «${puertoWebrtc}»`);
}

const yaml = [
  '# Generado por `pnpm sitio:video` desde apps/api/.env. NO se versiona.',
  '# Sin flujos ni credenciales: la API registra cada flujo RTSP al pedirlo.',
  'api:',
  `  listen: "${escucha}"`,
  'rtsp:',
  '  listen: ""',
  'webrtc:',
  `  listen: ":${puertoWebrtc}"`,
  '  candidates:',
  `    - "${ip}:${puertoWebrtc}"`,
  'streams: {}',
  'log:',
  '  level: info',
  '',
].join('\n');

mkdirSync(carpeta, { recursive: true });
const rutaYaml = join(carpeta, 'go2rtc.yaml');
writeFileSync(rutaYaml, yaml);
console.log(`✓ configuración: ${rutaYaml}`);
console.log(`  API de go2rtc en ${escucha} · medio WebRTC anunciado en ${ip}:${puertoWebrtc}`);
if (soloConfiguracion) process.exit(0);

/** El binario: GO2RTC_BIN, el PATH, o `.sitio/bin/go2rtc`. */
const enElPath = () => {
  for (const d of (process.env.PATH ?? '').split(delimiter)) {
    const ruta = join(d, 'go2rtc');
    if (d !== '' && existsSync(ruta)) return ruta;
  }
  return null;
};
const propio = join(carpeta, 'bin', 'go2rtc');
let binario = process.env.GO2RTC_BIN || enElPath() || (existsSync(propio) ? propio : null);

if (binario === null) {
  const nombre =
    platform() === 'darwin'
      ? `go2rtc_mac_${arch() === 'arm64' ? 'arm64' : 'amd64'}.zip`
      : platform() === 'linux'
        ? `go2rtc_linux_${arch() === 'arm64' ? 'arm64' : 'amd64'}`
        : null;
  if (nombre === null) salir(`no hay go2rtc para ${platform()}: descárguelo a mano a ${propio}`);
  const version = env.get('GO2RTC_VERSION') || process.env.GO2RTC_VERSION || 'latest';
  const url =
    version === 'latest'
      ? `https://github.com/AlexxIT/go2rtc/releases/latest/download/${nombre}`
      : `https://github.com/AlexxIT/go2rtc/releases/download/${version}/${nombre}`;
  console.log(`↓ go2rtc no está instalado: descargando ${url}`);
  const respuesta = await fetch(url);
  if (!respuesta.ok) salir(`la descarga contestó HTTP ${respuesta.status}: revise GO2RTC_VERSION`);
  const bytes = Buffer.from(await respuesta.arrayBuffer());
  console.log(`  SHA-256 ${createHash('sha256').update(bytes).digest('hex')}`);
  console.log('  Compárelo con el de la página de la versión antes de la entrega.');
  mkdirSync(join(carpeta, 'bin'), { recursive: true });
  if (nombre.endsWith('.zip')) {
    const zip = join(carpeta, 'bin', nombre);
    writeFileSync(zip, bytes);
    execFileSync('unzip', ['-o', zip, '-d', join(carpeta, 'bin')], { stdio: 'ignore' });
  } else {
    writeFileSync(propio, bytes);
  }
  chmodSync(propio, 0o755);
  binario = propio;
}

if (preparar) {
  console.log(`✓ go2rtc listo en ${binario}. En sitio: pnpm sitio:video`);
  process.exit(0);
}

console.log(`▶ ${binario} -config ${rutaYaml}   (Ctrl+C para parar)`);
console.log(`  Compruebe desde la API: curl http://${escucha}/api`);
const proceso = spawn(binario, ['-config', rutaYaml], { stdio: 'inherit' });
for (const senal of ['SIGINT', 'SIGTERM']) process.on(senal, () => proceso.kill(senal));
proceso.on('exit', (codigo) => process.exit(codigo ?? 0));
