#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-11 · EL Info.plist DE iOS, COMPROBADO YA PREPROCESADO
 *
 * Xcode preprocesa `ios/Runner/Info.plist` con el preprocesador de C
 * (`INFOPLIST_PREPROCESS`, A6) y sólo Debug define `NCR_DEPURACION`. Mirar el
 * fichero crudo no dice nada: las dos compilaciones salen de él y cada una ve
 * un plist distinto. Aquí se preprocesa COMO Xcode —C tradicional, sin
 * trigrafos, `-P`— en las dos variantes y se comprueba lo que cada una lleva:
 *
 *   Debug y Release · `NSLocalNetworkUsageDescription` con texto. Sin ella, en
 *                     un iPhone físico la app no llegaba a la API por la IP
 *                     privada y decía «No hay conexión con el servidor»
 *                     (H-SITIO-11). Safari sí: es de Apple.
 *   Debug           · `NSAppTransportSecurity › NSAllowsLocalNetworking = true`.
 *   Release         · SIN `NSAppTransportSecurity`: el binario distribuido sólo
 *                     habla HTTPS.
 *   Las dos         · jamás `NSAllowsArbitraryLoads`.
 *
 * Y que los `.xcconfig` activan el preprocesado y definen la marca sólo en
 * Debug: si no, lo comprobado aquí no es lo que Xcode construye.
 *
 * `dart:io` —el transporte de Dio en la app— abre sockets POSIX y NO pasa por
 * ATS; la privacidad de red local sí lo alcanza. Por eso la clave que faltaba
 * era ésta y no otra de ATS.
 *
 *   node scripts/lib/info-plist-ios.mjs [--plist <ruta>] [--xcconfig <dir>]
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const argumento = (nombre, porOmision) => {
  const i = process.argv.indexOf(nombre);
  return i === -1 ? porOmision : process.argv[i + 1];
};
const PLIST = argumento('--plist', 'apps/mobile/ios/Runner/Info.plist');
const XCCONFIG = argumento('--xcconfig', 'apps/mobile/ios/Flutter');

/** El preprocesador de C que haya: `clang`/`cc` en macOS, `cpp` en Linux. */
const preprocesar = (definiciones) => {
  const opciones = ['-E', '-P', '-x', 'c', '-traditional-cpp', '-Wno-trigraphs'];
  for (const binario of ['clang', 'cc', 'cpp']) {
    try {
      return execFileSync(binario, [...opciones, ...definiciones, PLIST], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      if (e.code === 'ENOENT') continue;
      throw new Error(`${binario} no pudo preprocesar ${PLIST}: ${String(e.stderr ?? e.message)}`);
    }
  }
  throw new Error('no hay preprocesador de C (clang, cc ni cpp): instale las herramientas de C');
};

/**
 * Un lector de plist XML del subconjunto que usa este fichero. Rechaza lo mal
 * formado: un plist que Xcode no pueda leer es un fallo, no un «no encontrado».
 */
const leerPlist = (xml) => {
  const limpio = xml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/g, '')
    .replace(/<\/?plist[^>]*>/g, '');
  const fichas = [...limpio.matchAll(/<(\/?)(\w+)(\s*\/)?>([^<]*)/g)].map((m) => ({
    cierre: m[1] === '/',
    etiqueta: m[2],
    vacia: m[3] !== undefined,
    texto: m[4],
  }));
  let i = 0;
  const valor = () => {
    const f = fichas[i++];
    if (f === undefined) throw new Error('el plist termina a medias');
    if (f.etiqueta === 'true' && f.vacia) return true;
    if (f.etiqueta === 'false' && f.vacia) return false;
    if (['string', 'integer', 'real', 'date', 'data'].includes(f.etiqueta)) {
      const c = fichas[i++];
      if (c?.cierre !== true || c.etiqueta !== f.etiqueta)
        throw new Error(`<${f.etiqueta}> sin cerrar`);
      return f.texto;
    }
    if (f.etiqueta === 'array' && !f.cierre) {
      const lista = [];
      while (!(fichas[i]?.cierre && fichas[i].etiqueta === 'array')) lista.push(valor());
      i += 1;
      return lista;
    }
    if (f.etiqueta === 'dict' && !f.cierre) {
      const dic = {};
      while (!(fichas[i]?.cierre && fichas[i].etiqueta === 'dict')) {
        const k = fichas[i++];
        if (k?.etiqueta !== 'key' || k.cierre)
          throw new Error('dentro de <dict> se esperaba <key>');
        const c = fichas[i++];
        if (c?.cierre !== true || c.etiqueta !== 'key') throw new Error('<key> sin cerrar');
        dic[k.texto] = valor();
      }
      i += 1;
      return dic;
    }
    throw new Error(`etiqueta inesperada <${f.cierre ? '/' : ''}${f.etiqueta}>`);
  };
  const raiz = valor();
  if (i !== fichas.length) throw new Error('hay contenido después del <dict> raíz');
  return raiz;
};

const contieneClave = (nodo, clave) =>
  nodo !== null &&
  typeof nodo === 'object' &&
  Object.entries(nodo).some(([k, v]) => k === clave || contieneClave(v, clave));

const fallos = [];
const comprobar = (nombre, definiciones, exigirAts) => {
  let plist;
  try {
    plist = leerPlist(preprocesar(definiciones));
  } catch (e) {
    fallos.push(`${nombre}: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  const red = plist.NSLocalNetworkUsageDescription;
  if (typeof red !== 'string' || red.trim() === '') {
    fallos.push(
      `${nombre}: falta NSLocalNetworkUsageDescription — en un iPhone físico la app no alcanza ` +
        'la API por la IP privada (H-SITIO-11)',
    );
  }
  const ats = plist.NSAppTransportSecurity;
  if (exigirAts && ats?.NSAllowsLocalNetworking !== true) {
    fallos.push(`${nombre}: falta NSAppTransportSecurity › NSAllowsLocalNetworking = true (A6)`);
  }
  if (!exigirAts && ats !== undefined) {
    fallos.push(
      `${nombre}: lleva NSAppTransportSecurity — la excepción de ATS viajaría en el binario`,
    );
  }
  if (contieneClave(plist, 'NSAllowsArbitraryLoads')) {
    fallos.push(`${nombre}: lleva NSAllowsArbitraryLoads — nunca, ni en depuración`);
  }
};

const leerXcconfig = (nombre) => {
  try {
    return readFileSync(join(XCCONFIG, nombre), 'utf8');
  } catch {
    fallos.push(`no se pudo leer ${join(XCCONFIG, nombre)}`);
    return '';
  }
};
const debug = leerXcconfig('Debug.xcconfig');
const release = leerXcconfig('Release.xcconfig');
const activa = /^\s*INFOPLIST_PREPROCESS\s*=\s*YES\s*$/m;
const marca = /^\s*INFOPLIST_PREPROCESSOR_DEFINITIONS\s*=.*\bNCR_DEPURACION=1\b/m;
if (!activa.test(debug)) fallos.push('Debug.xcconfig no activa INFOPLIST_PREPROCESS');
if (!marca.test(debug)) fallos.push('Debug.xcconfig no define NCR_DEPURACION=1');
if (!activa.test(release)) fallos.push('Release.xcconfig no activa INFOPLIST_PREPROCESS');
if (/NCR_DEPURACION/.test(release.replace(/\/\/.*$/gm, ''))) {
  fallos.push('Release.xcconfig define NCR_DEPURACION: la excepción de ATS llegaría a Release');
}

comprobar('Debug', ['-DNCR_DEPURACION=1'], true);
comprobar('Release', [], false);

if (fallos.length > 0) {
  console.error('FALLO el Info.plist de iOS, preprocesado como en Xcode, no es el esperado:');
  for (const f of fallos) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  'OK Info.plist preprocesado: Debug y Release piden red local; ATS local sólo en Debug; ' +
    'nunca NSAllowsArbitraryLoads',
);
