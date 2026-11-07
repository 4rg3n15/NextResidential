#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA CONSOLA EN NETLIFY, COMPROBADA SIN VER UN SOLO VALOR · D-160 (ADR-041)
 *
 *   netlify env:list --json … | node scripts/lib/variables-de-netlify.mjs comprobar [<origen.txt>]
 *   node scripts/lib/variables-de-netlify.mjs salud <cuerpo.json> <código>
 *   node scripts/lib/variables-de-netlify.mjs cabeceras <cabeceras.txt> <origen-de-la-api>
 *   node scripts/lib/variables-de-netlify.mjs empaquetado apps/web/.netlify
 *
 * `comprobar` lee de la entrada estándar el JSON de `env:list` —que trae
 * VALORES— y dice sólo NOMBRES:
 *
 *   · faltan las que la consola en Netlify necesita;
 *   · la cabecera de la IP es la de Netlify y no otra;
 *   · ninguna variable del sitio es la llave SECRETA de Supabase ni lleva el
 *     prefijo NEXT_PUBLIC_ (todo eso llegaría al navegador o a sus funciones);
 *   · `API_ORIGEN_PUBLICO` es un origen https sin ruta.
 * Con un fichero, escribe en él ese origen —el único valor que sale, y no es
 * secreto: está en la CSP de cada respuesta de la consola—.
 *
 * `salud` juzga el `/health` de ESE origen antes de publicar: que el origen
 * configurado sea de verdad nuestra API, y no un host https cualquiera. Así un
 * origen equivocado no gasta los 15 créditos de un despliegue.
 *
 * `cabeceras` lee las de una respuesta de la consola publicada (`curl -D`) y
 * comprueba la CSP que exige §2.7.7 y la que hace posible el flujo directo
 * (15-R): nonce, sin `unsafe-inline` ni `unsafe-eval`, y EXACTAMENTE el origen
 * configurado de la API en `connect-src`, por https y por wss.
 *
 * `empaquetado` lee lo que deja `netlify build`: la función que sirve Next,
 * con el Node de la MISMA versión mayor que `.nvmrc`, y el middleware como
 * función de borde, con el emparejador de la consola (los estáticos fuera).
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Las que la consola en Netlify no puede no tener (CONSOLA_EN_RED_Y_DESPLIEGUE.md §7.3). */
export const OBLIGATORIAS = [
  'API_URL',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'API_ORIGEN_PUBLICO',
  'CONSOLA_CABECERA_IP_DE_CONFIANZA',
  'CONSOLA_IP_FIRMA_SECRETO',
];

/** La única cabecera de IP que escribe Netlify y el navegador no fija (15-R, D4). */
export const CABECERA_DE_NETLIFY = 'x-nf-client-connection-ip';

/** Juicio puro sobre el mapa nombre → valor. Devuelve motivos que sólo llevan NOMBRES. */
export const juzgarVariables = (variables) => {
  const motivos = [];
  for (const nombre of OBLIGATORIAS) {
    const v = variables[nombre];
    if (typeof v !== 'string' || v.trim() === '') motivos.push(`falta ${nombre}`);
  }
  const cabecera = variables.CONSOLA_CABECERA_IP_DE_CONFIANZA;
  if (
    typeof cabecera === 'string' &&
    cabecera.trim() !== '' &&
    cabecera.trim().toLowerCase() !== CABECERA_DE_NETLIFY
  )
    motivos.push(`CONSOLA_CABECERA_IP_DE_CONFIANZA no es ${CABECERA_DE_NETLIFY}`);
  // De CONSOLA_IP_FIRMA_SECRETO sólo se mira que exista: si está marcada como
  // secreta, fuera de Netlify llega ENMASCARADA (documentación de Netlify,
  // «Secrets Controller») y su longitud no dice nada. La comprueba la propia
  // consola al arrancar, y la consola que no arranca no pasa la prueba final.
  for (const nombre of Object.keys(variables)) {
    if (nombre.startsWith('NEXT_PUBLIC_'))
      motivos.push(`${nombre}: NEXT_PUBLIC_ es público por definición`);
    if (nombre === 'SUPABASE_SECRET_KEY')
      motivos.push('SUPABASE_SECRET_KEY nunca va en la consola');
  }
  for (const [nombre, valor] of Object.entries(variables)) {
    if (typeof valor === 'string' && valor.startsWith('sb_secret_'))
      motivos.push(`${nombre} contiene una llave SECRETA de Supabase`);
  }
  const publico = variables.API_ORIGEN_PUBLICO;
  if (typeof publico === 'string' && publico.trim() !== '' && origenHttps(publico) === undefined)
    motivos.push('API_ORIGEN_PUBLICO no es un origen https sin ruta (https://host)');
  return motivos;
};

/** `https://host[:puerto]` tal cual, o `undefined` si trae otro esquema, ruta o consulta. */
export const origenHttps = (texto) => {
  let url;
  try {
    url = new URL(texto.trim());
  } catch {
    return undefined;
  }
  const limpio = url.pathname === '/' && url.search === '' && url.hash === '';
  return url.protocol === 'https:' && limpio && url.username === '' ? url.origin : undefined;
};

/** Juicio puro sobre el `/health` de la API pública: el de NUESTRA API, no un 200 cualquiera. */
export const juzgarSalud = ({ codigo, cuerpo }) => {
  if (codigo !== 200) return [`la API pública respondió ${String(codigo)} en /health, no 200`];
  let datos;
  try {
    datos = JSON.parse(cuerpo);
  } catch {
    return ['/health de la API pública no es JSON: API_ORIGEN_PUBLICO apunta a otro servicio'];
  }
  return datos?.estado === 'vivo'
    ? []
    : ['/health no es el de la API de Next Control: API_ORIGEN_PUBLICO apunta a otro servicio'];
};

/** `curl -D` → mapa de cabeceras en minúscula, de la ÚLTIMA respuesta (tras redirecciones). */
export const leerCabeceras = (texto) => {
  const bloques = texto.split(/\r?\n\r?\n/).filter((b) => /^HTTP\//.test(b.trim()));
  const ultimo = bloques.at(-1) ?? '';
  const [estado = '', ...lineas] = ultimo.trim().split(/\r?\n/);
  const cabeceras = {};
  for (const l of lineas) {
    const i = l.indexOf(':');
    if (i > 0) cabeceras[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
  }
  return { codigo: Number(estado.split(' ')[1]), cabeceras };
};

const directiva = (csp, nombre) =>
  csp
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .find((partes) => partes[0] === nombre)
    ?.slice(1) ?? [];

/** Juicio puro sobre la respuesta de la consola publicada, con el origen configurado de la API. */
export const juzgarCabeceras = ({ codigo, cabeceras }, origenApi) => {
  const motivos = [];
  if (codigo !== 200) motivos.push(`la consola respondió ${String(codigo)}, no 200`);
  const csp = cabeceras['content-security-policy'] ?? '';
  if (csp === '') return [...motivos, 'sin Content-Security-Policy'];
  const script = directiva(csp, 'script-src');
  if (!script.some((s) => /^'nonce-[A-Za-z0-9+/=_-]{16,}'$/.test(s)))
    motivos.push('script-src sin nonce');
  for (const prohibido of ["'unsafe-inline'", "'unsafe-eval'"]) {
    if (script.includes(prohibido)) motivos.push(`script-src con ${prohibido}`);
  }
  // El origen EXACTO, no un https cualquiera: Supabase también está en
  // connect-src, y una API equivocada pero https pasaría por buena.
  const origen = origenHttps(origenApi ?? '');
  const conectar = directiva(csp, 'connect-src').map((s) => s.replace(/\/$/, ''));
  if (origen === undefined) motivos.push('sin el origen configurado de la API con que comparar');
  else {
    if (!conectar.includes(origen))
      motivos.push('connect-src no tiene la API configurada (API_ORIGEN_PUBLICO) por https');
    if (!conectar.includes(origen.replace(/^https/, 'wss')))
      motivos.push('connect-src no tiene la API configurada por wss: el audio no abriría');
  }
  if (!directiva(csp, 'frame-ancestors').includes("'none'"))
    motivos.push("frame-ancestors no es 'none'");
  if (!(cabeceras['strict-transport-security'] ?? '').includes('max-age='))
    motivos.push('sin HSTS');
  return motivos;
};

/** Juicio puro sobre los manifiestos que deja `netlify build`. */
export const juzgarEmpaquetado = ({ funciones, rutasDeBorde, nodeMayor }) => {
  const motivos = [];
  const servidor = funciones.find((f) => f.name === '___netlify-server-handler');
  if (servidor === undefined)
    motivos.push('no hay función que sirva Next (___netlify-server-handler)');
  else if (servidor.runtimeVersion !== `nodejs${nodeMayor}.x`)
    motivos.push(
      `la función corre en ${String(servidor.runtimeVersion)}, y .nvmrc es Node ${nodeMayor}`,
    );
  const middleware = rutasDeBorde.find((r) => /middleware/.test(r.function));
  if (middleware === undefined)
    motivos.push('el middleware (CSP con nonce) no está como función de borde');
  else if (!middleware.pattern.includes('_next/static'))
    motivos.push('el middleware perdió su emparejador: correría también sobre los estáticos');
  return motivos;
};

const esPrincipal =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const [orden, fichero, extra] = process.argv.slice(2);
  let motivos;
  if (orden === 'comprobar') {
    let variables;
    try {
      variables = JSON.parse(readFileSync(0, 'utf8'));
    } catch {
      console.error(
        'FALLO variables-de-netlify: la entrada no es el JSON de `netlify env:list --json`',
      );
      process.exit(1);
    }
    motivos = juzgarVariables(variables);
    if (motivos.length === 0) {
      if (fichero !== undefined) writeFileSync(fichero, origenHttps(variables.API_ORIGEN_PUBLICO));
      console.log(
        `variables del sitio: las ${String(OBLIGATORIAS.length)} declaradas, y ninguna prohibida`,
      );
    }
  } else if (orden === 'salud' && fichero !== undefined && extra !== undefined) {
    // Sin conexión, curl no crea el fichero: el código (000) ya lo dice todo.
    const cuerpo = existsSync(fichero) ? readFileSync(fichero, 'utf8') : '';
    motivos = juzgarSalud({ codigo: Number(extra), cuerpo });
    if (motivos.length === 0)
      console.log('la API pública configurada responde /health: es la nuestra');
  } else if (orden === 'cabeceras' && fichero !== undefined && extra !== undefined) {
    motivos = juzgarCabeceras(leerCabeceras(readFileSync(fichero, 'utf8')), extra);
    if (motivos.length === 0)
      console.log(
        'la consola responde 200, con su CSP de nonce y la API configurada en connect-src',
      );
  } else if (orden === 'empaquetado' && fichero !== undefined) {
    const leer = (r) => JSON.parse(readFileSync(join(fichero, r), 'utf8'));
    const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
    motivos = juzgarEmpaquetado({
      funciones: leer('functions/manifest.json').functions ?? [],
      rutasDeBorde: leer('edge-functions-dist/manifest.json').routes ?? [],
      nodeMayor: readFileSync(join(raiz, '.nvmrc'), 'utf8').trim().split('.')[0] ?? '',
    });
    if (motivos.length === 0)
      console.log(
        'empaquetado para Netlify: la función de Next y el middleware de borde, con su emparejador',
      );
  } else {
    console.error(
      'uso: variables-de-netlify.mjs comprobar [<origen.txt>] < env.json | salud <cuerpo> <código> | cabeceras <fichero> <origen> | empaquetado <dir>',
    );
    process.exit(2);
  }
  for (const m of motivos) console.error(`FALLO variables-de-netlify: ${m}`);
  if (motivos.length > 0) process.exit(1);
}
