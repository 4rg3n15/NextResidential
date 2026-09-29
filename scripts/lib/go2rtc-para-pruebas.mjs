#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * go2rtc REAL PARA LAS PRUEBAS DEL PUENTE DE VIDEO · ETAPA 15-M
 *
 * Las pruebas de E2/C1 que arrancan go2rtc de verdad
 * (`puente-go2rtc.real.test.ts`, `servidor-rtsp.go2rtc.test.ts`) se OMITEN con
 * su nombre si no hay `GO2RTC_BIN`. Con `--con-base`, el paso 5 trata toda
 * omisión no declarada como FALLO (D-112): una prueba que no se ejecuta no
 * suma al verde. Así que el verificador pone el binario en vez de declarar la
 * omisión, que no tendría ningún otro paso que la ejerciera.
 *
 * Qué binario, en este orden:
 *  1. `GO2RTC_BIN`, si ya viene definida y es ejecutable;
 *  2. el de una corrida anterior, en `.sitio/bin/pruebas-<versión>/` (no se
 *     versiona: `.sitio/` está en `.gitignore`);
 *  3. la versión OFICIAL fijada abajo, descargada de las publicaciones de
 *     go2rtc y comprobada por SHA-256 ANTES de escribirla en disco. Una huella
 *     distinta no se ejecuta.
 *
 * La última línea de la salida es la ruta del ejecutable; un fallo dice por
 * qué y sale con 1.
 *
 *   node scripts/lib/go2rtc-para-pruebas.mjs [raíz]
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, chmodSync, constants, mkdirSync, writeFileSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { join } from 'node:path';

export const VERSION = 'v1.9.14';

/** SHA-256 de cada publicación de la versión fijada, medidas el 2026-09-29. */
const HUELLAS = {
  go2rtc_linux_amd64: '32d616af226bd731678ffde328b94cfb94e30339bfefc469cfb76323144615a6',
  go2rtc_linux_arm64: '359fabade8a7a51e81a55fe6df6b0ef81764a5e1d63179577534eaaa71904b50',
  'go2rtc_mac_amd64.zip': '9b0b9a27a4dc3a5b8b93376e7e8fc2787c6af624a512842622be84aec0171c7a',
  'go2rtc_mac_arm64.zip': '919b78adc759d6b3883d1e1b2ac915ac0985bb903ff1897b4d228527bd64690c',
};

const salir = (motivo) => {
  console.error(`FALLO go2rtc-para-pruebas: ${motivo}`);
  process.exit(1);
};

const ejecutable = (ruta) => {
  try {
    accessSync(ruta, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const raiz = process.argv[2] ?? process.cwd();

const propio = process.env.GO2RTC_BIN ?? '';
if (propio !== '') {
  if (!ejecutable(propio)) salir(`GO2RTC_BIN=${propio} no es un ejecutable`);
  console.log(propio);
  process.exit(0);
}

const cpu = arch() === 'arm64' ? 'arm64' : 'amd64';
const nombre =
  platform() === 'darwin'
    ? `go2rtc_mac_${cpu}.zip`
    : platform() === 'linux'
      ? `go2rtc_linux_${cpu}`
      : null;
if (nombre === null) salir(`go2rtc ${VERSION} no se publica para ${platform()}`);

const carpeta = join(raiz, '.sitio', 'bin', `pruebas-${VERSION}`);
const binario = join(carpeta, 'go2rtc');
if (ejecutable(binario)) {
  console.log(binario);
  process.exit(0);
}

const url = `https://github.com/AlexxIT/go2rtc/releases/download/${VERSION}/${nombre}`;
let bytes;
try {
  const respuesta = await fetch(url);
  if (!respuesta.ok) salir(`la descarga de ${url} contestó HTTP ${respuesta.status}`);
  bytes = Buffer.from(await respuesta.arrayBuffer());
} catch (error) {
  salir(`no se pudo descargar ${url}: ${error.cause?.code ?? error.message}`);
}
const huella = createHash('sha256').update(bytes).digest('hex');
if (huella !== HUELLAS[nombre]) {
  salir(`la huella de ${nombre} no es la fijada (${huella}): no se escribe ni se ejecuta`);
}
mkdirSync(carpeta, { recursive: true });
if (nombre.endsWith('.zip')) {
  const zip = join(carpeta, nombre);
  writeFileSync(zip, bytes);
  execFileSync('unzip', ['-o', zip, 'go2rtc', '-d', carpeta], { stdio: 'ignore' });
} else {
  writeFileSync(binario, bytes);
}
chmodSync(binario, 0o755);
if (!ejecutable(binario)) salir(`${binario} no quedó ejecutable`);
console.log(binario);
