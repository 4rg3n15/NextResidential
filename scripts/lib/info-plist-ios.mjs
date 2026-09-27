#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-11 · EL Info.plist DE iOS, TAL COMO LO CONSTRUYE CADA CONFIGURACIÓN
 *
 * Corrección de la 15-L · la app se usa en sitio compilada en RELEASE y
 * abierta desde el ícono, sin el Mac conectado. Lo que la app necesita para la
 * red local tiene que ir en las TRES configuraciones del target Runner —Debug,
 * Release y Profile—, no sólo en depuración:
 *
 *   · `NSLocalNetworkUsageDescription` con texto. Sin ella, en un iPhone físico
 *     la app no llegaba a la API por la IP privada y decía «No hay conexión con
 *     el servidor» (H-SITIO-11). Safari sí: es de Apple. `dart:io` —el
 *     transporte de Dio— abre sockets POSIX y NO pasa por ATS; la privacidad de
 *     red local sí lo alcanza.
 *   · `NSAppTransportSecurity › NSAllowsLocalNetworking = true`, para lo que sí
 *     use el sistema de URL de Apple (un WebView, un plugin nativo).
 *   · jamás `NSAllowsArbitraryLoads`, en ninguna.
 *
 * Qué construye cada configuración se lee del proyecto de Xcode —el
 * `baseConfigurationReference` de cada configuración del target cuyo
 * `INFOPLIST_FILE` es `Runner/Info.plist`— y, si ese `.xcconfig` activa
 * `INFOPLIST_PREPROCESS`, el plist se preprocesa COMO Xcode (C tradicional,
 * `-P`) con sus definiciones. Así un `#if` que vuelva a dejar la excepción
 * sólo en depuración se ve en Release y Profile, que es donde rompería.
 *
 *   node scripts/lib/info-plist-ios.mjs [--plist <ruta>] [--xcconfig <dir>] [--pbxproj <ruta>]
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
const PBXPROJ = argumento('--pbxproj', 'apps/mobile/ios/Runner.xcodeproj/project.pbxproj');

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

/**
 * Las configuraciones del target Runner y el `.xcconfig` de cada una, leídas
 * del proyecto. Un bloque de configuración con `INFOPLIST_FILE =
 * Runner/Info.plist` es del target de la app (el de pruebas no lo lleva).
 */
const configuraciones = () => {
  let proyecto;
  try {
    proyecto = readFileSync(PBXPROJ, 'utf8');
  } catch {
    fallos.push(`no se pudo leer ${PBXPROJ}`);
    return [];
  }
  // El nombre de la configuración es el de `name = …;` dentro del bloque, no
  // el comentario que Xcode pone delante: el comentario no se lee al construir.
  const bloques = [...proyecto.matchAll(/isa = XCBuildConfiguration;([\s\S]*?)\n\t\t\};/g)].map(
    ([, cuerpo]) => cuerpo,
  );
  // Un bloque sin `name = …;` no es una configuración que Xcode construya: se
  // queda fuera, y la que falte la señala la comprobación de las tres.
  return bloques
    .filter((cuerpo) => /INFOPLIST_FILE = Runner\/Info\.plist;/.test(cuerpo))
    .flatMap((cuerpo) => {
      const nombre = /\n\t\t\tname = (\w+);/.exec(cuerpo);
      const base = /baseConfigurationReference = \w+ \/\* ([\w.]+\.xcconfig) \*\//.exec(cuerpo);
      return nombre === null ? [] : [{ nombre: nombre[1], xcconfig: base?.[1] }];
    });
};

const definicionesDe = (xcconfig) => {
  const activa = /^\s*INFOPLIST_PREPROCESS\s*=\s*YES\s*$/m.test(xcconfig);
  const lista = /^\s*INFOPLIST_PREPROCESSOR_DEFINITIONS\s*=(.*)$/m.exec(xcconfig)?.[1] ?? '';
  return {
    activa,
    definiciones: lista
      .trim()
      .split(/\s+/)
      .filter((d) => d !== '' && d !== '$(inherited)')
      .map((d) => `-D${d}`),
  };
};

const leerXcconfig = (nombre) => {
  try {
    return readFileSync(join(XCCONFIG, nombre), 'utf8').replace(/\/\/.*$/gm, '');
  } catch {
    fallos.push(`no se pudo leer ${join(XCCONFIG, nombre)}`);
    return null;
  }
};

const comprobar = ({ nombre, xcconfig }) => {
  if (xcconfig === undefined) {
    fallos.push(`${nombre}: la configuración no declara su .xcconfig`);
    return;
  }
  const texto = leerXcconfig(xcconfig);
  if (texto === null) return;
  const { activa, definiciones } = definicionesDe(texto);
  let plist;
  try {
    plist = leerPlist(activa ? preprocesar(definiciones) : readFileSync(PLIST, 'utf8'));
  } catch (e) {
    // Todo lo que se lanza aquí es un Error: el lector y el preprocesador.
    fallos.push(`${nombre}: ${e.message}`);
    return;
  }
  const red = plist.NSLocalNetworkUsageDescription;
  if (typeof red !== 'string' || red.trim() === '') {
    fallos.push(
      `${nombre}: falta NSLocalNetworkUsageDescription — en un iPhone físico la app no alcanza ` +
        'la API por la IP privada (H-SITIO-11)',
    );
  }
  if (plist.NSAppTransportSecurity?.NSAllowsLocalNetworking !== true) {
    fallos.push(
      `${nombre}: falta NSAppTransportSecurity › NSAllowsLocalNetworking = true — la app ` +
        'instalada en Release no llevaría la excepción de red local',
    );
  }
  if (contieneClave(plist, 'NSAllowsArbitraryLoads')) {
    fallos.push(`${nombre}: lleva NSAllowsArbitraryLoads — nunca, en ninguna configuración`);
  }
};

const encontradas = configuraciones();
for (const esperada of ['Debug', 'Release', 'Profile']) {
  if (!encontradas.some((c) => c.nombre === esperada)) {
    fallos.push(`el target Runner no tiene la configuración ${esperada}`);
  }
}
for (const c of encontradas) comprobar(c);

if (fallos.length > 0) {
  console.error(
    'FALLO el Info.plist de iOS, como lo construye cada configuración, no es el esperado:',
  );
  for (const f of fallos) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `OK Info.plist en ${encontradas.map((c) => c.nombre).join(', ')}: red local pedida y ` +
    'ATS relajado sólo para lo local en todas; nunca NSAllowsArbitraryLoads',
);
