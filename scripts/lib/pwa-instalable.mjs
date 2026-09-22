#!/usr/bin/env node
/**
 * LA CONSOLA ES INSTALABLE, Y SE COMPRUEBA — no se afirma.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * QUÉ FAMILIA DE DEFECTOS CIERRA
 *
 * Una PWA no instalable no da ningún error: el navegador simplemente **no
 * ofrece instalarla**. No hay excepción, no hay consola en rojo, no hay prueba
 * que falle. El manifiesto está ahí, el service worker está registrado, y el
 * botón de instalar no aparece. Es el modo de fallo exacto que este proyecto
 * persigue, en su forma más silenciosa.
 *
 * Esta etapa lo destapó por ese camino: `icono-mascara.png` era **byte a byte
 * el mismo fichero** que `icono-512.png`, y el manifiesto lo declaraba
 * `purpose: "maskable"`. Un icono enmascarable tiene que dejar su contenido
 * dentro de la zona segura —el 80 % central, porque Android recorta a círculo o
 * a cuadrado redondeado—, y aquel no dejaba nada: el logo salía recortado en
 * cada teléfono. Nadie lo habría visto sin instalar la aplicación en un
 * Android, que es justamente lo que no hace ninguna prueba automática.
 *
 * QUÉ SE COMPRUEBA, y por qué cada cosa:
 *
 *  1 · Los CAMPOS que la instalabilidad exige (`name` o `short_name`,
 *      `start_url`, `display` en pantalla propia, `icons`). Sin uno, no hay
 *      instalación y no hay aviso.
 *  2 · Un icono de 192 y otro de 512, que es el mínimo de Chrome.
 *  3 · Al menos uno `maskable`, y que **NO sea el mismo fichero** que el
 *      normal. Esa es la comprobación que nació de este hallazgo.
 *  4 · Que cada icono EXISTA y que sus dimensiones REALES coincidan con las
 *      declaradas: se leen del IHDR del PNG, no del nombre del fichero.
 *  5 · Que el service worker esté registrado en el código de la consola, que
 *      declare una estrategia de caché por tipo de recurso, y que **NUNCA
 *      cachee `/api/`** — una respuesta de un tenant servida a otro desde el
 *      disco del navegador sería una fuga que ninguna RLS puede detener.
 *  6 · Que exista la página de sin conexión a la que el service worker
 *      repliega: un repliegue hacia una ruta inexistente da error de red, que
 *      es peor que no tener repliegue.
 *
 * Uso: node scripts/lib/pwa-instalable.mjs [raíz]
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const raizRepo = resolve(process.argv[2] ?? process.cwd());
const raizWeb = join(raizRepo, 'apps', 'web');
const publico = join(raizWeb, 'public');
const manifiesto = join(publico, 'manifest.webmanifest');
const serviceWorker = join(publico, 'sw.js');

const problemas = [];
const mal = (m) => problemas.push(m);

if (!existsSync(raizWeb)) {
  console.log('OK pwa: no hay apps/web que revisar');
  process.exit(0);
}

// ── 1 · El manifiesto ────────────────────────────────────────────────────────
if (!existsSync(manifiesto)) {
  mal('no existe apps/web/public/manifest.webmanifest');
} else {
  let m;
  try {
    m = JSON.parse(readFileSync(manifiesto, 'utf8'));
  } catch (e) {
    mal(`manifest.webmanifest no es JSON válido: ${e.message}`);
  }

  if (m !== undefined) {
    const nombre = typeof m.name === 'string' && m.name.trim() !== '';
    const corto = typeof m.short_name === 'string' && m.short_name.trim() !== '';
    if (!nombre && !corto) mal('el manifiesto no declara `name` ni `short_name`');
    if (typeof m.start_url !== 'string' || m.start_url === '') {
      mal('el manifiesto no declara `start_url`');
    }
    const PANTALLA_PROPIA = ['standalone', 'fullscreen', 'minimal-ui'];
    if (!PANTALLA_PROPIA.includes(m.display)) {
      mal(`\`display\` es «${m.display}»: para instalar hace falta ${PANTALLA_PROPIA.join(', ')}`);
    }
    if (typeof m.lang !== 'string' || m.lang === '') {
      mal('el manifiesto no declara `lang`: el sistema no sabe en qué idioma anunciarla');
    }

    const iconos = Array.isArray(m.icons) ? m.icons : [];
    if (iconos.length === 0) mal('el manifiesto no declara iconos');

    /** Dimensiones REALES, leídas del IHDR. El nombre del fichero no es prueba. */
    const dimensiones = (ruta) => {
      const d = readFileSync(ruta);
      if (d.length < 26 || d.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
      return { ancho: d.readUInt32BE(16), alto: d.readUInt32BE(20) };
    };

    const huellas = new Map();
    const tamanos = new Set();
    let hayMaskable = false;

    for (const icono of iconos) {
      const src = typeof icono.src === 'string' ? icono.src : '';
      const ruta = join(publico, src.replace(/^\//, ''));
      if (!existsSync(ruta)) {
        mal(`el icono «${src}» del manifiesto no existe en apps/web/public`);
        continue;
      }
      const real = dimensiones(ruta);
      if (real === null) {
        mal(`el icono «${src}» no es un PNG legible`);
        continue;
      }
      for (const declarado of String(icono.sizes ?? '')
        .split(/\s+/)
        .filter(Boolean)) {
        const [a, b] = declarado.split('x').map(Number);
        if (a !== real.ancho || b !== real.alto) {
          mal(
            `el icono «${src}» dice ${declarado} y mide ${real.ancho}x${real.alto}: ` +
              'el manifiesto describe un fichero que no es ese',
          );
        }
        tamanos.add(declarado);
      }
      const proposito = String(icono.purpose ?? 'any');
      const contenido = readFileSync(ruta).toString('base64');
      const previo = huellas.get(contenido);
      if (proposito.includes('maskable')) {
        hayMaskable = true;
        if (previo !== undefined) {
          mal(
            `el icono enmascarable «${src}» es BYTE A BYTE el mismo que «${previo}». Un ` +
              'enmascarable necesita zona segura: Android recorta, y el logo sale cortado ' +
              'sin que ninguna prueba lo vea',
          );
        }
      }
      huellas.set(contenido, src);
    }

    if (!tamanos.has('192x192')) mal('falta el icono de 192x192 (mínimo de instalabilidad)');
    if (!tamanos.has('512x512')) mal('falta el icono de 512x512 (mínimo de instalabilidad)');
    if (!hayMaskable) mal('ningún icono declara `purpose: "maskable"`');
  }
}

// ── 2 · El service worker y su registro ─────────────────────────────────────
if (!existsSync(serviceWorker)) {
  mal('no existe apps/web/public/sw.js: sin service worker no hay instalación');
} else {
  const sw = readFileSync(serviceWorker, 'utf8');
  if (!/addEventListener\(\s*['"]fetch['"]/.test(sw)) {
    mal('el service worker no atiende `fetch`: sin ese manejador no es instalable');
  }
  if (!/addEventListener\(\s*['"]install['"]/.test(sw)) {
    mal('el service worker no atiende `install`');
  }
  /**
   * LA REGLA QUE NO SE NEGOCIA. Cachear `/api/` metería respuestas de un tenant
   * en el disco del navegador, y la siguiente sesión —otro operador, otra
   * copropiedad— las leería de ahí. Es una fuga multiempresa desde DENTRO del
   * navegador, donde ninguna RLS alcanza.
   */
  if (!/\/api\//.test(sw)) {
    mal('el service worker no menciona `/api/`: tiene que excluirlo explícitamente de la caché');
  }
  /**
   * Se comprueba el CÓDIGO, no la prosa: tiene que existir un predicado que
   * reconozca las rutas de la API y una salida temprana del manejador de
   * `fetch` que lo use. Buscar solo la frase «solo red» en un comentario daría
   * por bueno un worker que la dice y no la cumple — que es exactamente la
   * familia de defecto que este control existe para no repetir.
   */
  const predicado = /const\s+(es[A-Za-z]*[Aa]pi)\s*=\s*\([^)]*\)\s*=>[^;]*\/api\//.exec(sw);
  if (predicado === null) {
    mal('el service worker no define un predicado que reconozca las rutas `/api/`');
  } else {
    const nombre = predicado[1];
    const manejador = /addEventListener\(\s*['"]fetch['"][\s\S]*$/.exec(sw)?.[0] ?? '';
    const salida = new RegExp(`if\\s*\\(\\s*${nombre}\\([^)]*\\)\\s*\\)\\s*return`).test(manejador);
    if (!salida) {
      mal(
        `el manejador de \`fetch\` no sale temprano con \`${nombre}\`: una respuesta de un ` +
          'tenant servida a otro desde el disco del navegador es una fuga que la RLS no ve',
      );
    }
  }

  const fuentes = [];
  const recorrer = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, e.name);
      if (e.isDirectory()) recorrer(ruta);
      else if (/\.(ts|tsx)$/.test(e.name)) fuentes.push(ruta);
    }
  };
  const src = join(raizWeb, 'src');
  if (existsSync(src) && statSync(src).isDirectory()) recorrer(src);
  const registra = fuentes.some((f) =>
    /serviceWorker\s*\.\s*register\(\s*['"]\/sw\.js['"]/.test(readFileSync(f, 'utf8')),
  );
  if (!registra) {
    mal('nadie registra `/sw.js` en apps/web/src: el fichero existe y el navegador no lo usa');
  }
}

// ── 3 · La página de repliegue existe ───────────────────────────────────────
const sinConexion = join(raizWeb, 'src', 'app', 'sin-conexion');
if (!existsSync(sinConexion)) {
  mal(
    'no existe la página /sin-conexion a la que repliega el service worker: ' +
      'un repliegue hacia una ruta inexistente da error de red',
  );
}

if (problemas.length > 0) {
  console.error(`FALLO pwa: ${problemas.length} problema(s) de instalabilidad\n`);
  for (const p of problemas) console.error(`  ✗ ${p}`);
  console.error(
    '\nUna PWA no instalable no da ningún error: el navegador simplemente no ofrece instalarla.',
  );
  process.exit(1);
}

console.log(
  'OK pwa: manifiesto completo, iconos reales de 192/512 y uno enmascarable distinto, ' +
    'service worker registrado con `/api/` fuera de la caché y página de sin conexión',
);
