#!/usr/bin/env node
/**
 * Escaneo de secretos. Busca VALORES, no nombres: `SUPABASE_SECRET_KEY=` en un
 * `.env.example` es correcto; `SUPABASE_SECRET_KEY=sb_secret_abc` no lo es.
 *
 * ESTÁ EN NODE Y NO EN SHELL A PROPÓSITO (2026-09-07). La versión anterior
 * usaba `xargs -r`, que es una extensión de GNU: en macOS —el entorno de
 * desarrollo objetivo— BSD xargs no la reconoce y el guion fallaba. Como este
 * escaneo corre en el gancho de pre-commit, ese fallo habría bloqueado los
 * commits del usuario.
 *
 * El motivo de fondo va más allá de `-r`: las clases de carácter y los
 * cuantificadores de `grep -E` **no son idénticos** entre BSD y GNU, así que un
 * patrón podía coincidir en Linux y no en macOS —o al revés— sin que nadie lo
 * notara. La expresión regular de Node es la misma en las dos plataformas, y
 * eso es exactamente lo que un control de seguridad necesita.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * TRES MODOS, Y LA DIFERENCIA ENTRE ELLOS ES UN HALLAZGO DE LA ETAPA 13
 *
 *   (sin argumentos)  el ÁRBOL de trabajo. Lo de siempre.
 *   --indice          lo que se va a CONFIRMAR, leído de `git cat-file`.
 *   --historial       todos los blobs alcanzables desde todas las referencias.
 *
 * `--indice` existe por H-13-20: `git ls-files` da los NOMBRES del índice, pero
 * el contenido se leía del disco. Si lo preparado y lo que hay en el árbol
 * difieren, el gancho validaba el árbol y confirmaba el índice. Medido:
 *
 *   $ printf '…sb_secret_STAGEDONLY…' > f.ts && git add f.ts
 *   $ printf 'export const K = "inocuo";' > f.ts      # se revierte el ÁRBOL
 *   $ node escanear-secretos.mjs  ->  «limpio», EXIT=0
 *   $ git show :f.ts              ->  …sb_secret_STAGEDONLY…
 *
 * `git add .` seguido de seguir editando produce esa secuencia sin querer.
 *
 * `--historial` existe por H-13-17: el alcance de la ETAPA 13 pide «ninguno
 * está en el código NI EN EL HISTORIAL de Git», y la segunda mitad no tenía
 * control. Un secreto confirmado y retirado en el commit siguiente dejaba el
 * escáner en «limpio» mientras la llave seguía siendo recuperable con una
 * orden. Cuesta menos de un segundo sobre 2 129 blobs: no hay excusa de coste.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const PATRONES = [
  [/sb_secret_[A-Za-z0-9_-]{8,}/, 'llave secreta de Supabase'],
  [/sb_publishable_[A-Za-z0-9_-]{8,}/, 'llave publicable de Supabase'],
  [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, 'JSON Web Token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'clave privada'],
  [/(password|passwd|contrasena|contraseña)\s*[:=]\s*['"][^'"<\n]{6,}/i, 'contraseña literal'],
  [/postgres(ql)?:\/\/[^:\s]+:[^@\s<]{6,}@/, 'cadena de conexión con contraseña'],
  [/api_?key\s*[:=]\s*['"][A-Za-z0-9_-]{16,}/i, 'clave de API'],
  /**
   * H-13-19 · LOS SECRETOS PROPIOS DE ESTE PROYECTO no tenían patrón.
   *
   * Los siete de arriba cubren Supabase y formatos genéricos, y ninguno cubría
   * los tres que el esquema Zod declara como obligatorios. Medido: un fichero
   * con `INGESTA_FIRMA_SECRETO = '<44 caracteres>'` y `BIOMETRIA_LLAVE = '<48>'`
   * pasaba el escáner con «limpio» y EXIT=0.
   *
   * No es hipotético lo que abre: `INGESTA_FIRMA_SECRETO` es lo ÚNICO que
   * protege `/ingesta/eventos`, `/ingesta/reconciliacion` y `/ingesta/latidos`,
   * que son rutas `@Publico()`. Con esa llave se firman eventos contra una
   * tabla que RN-03 declara inalterable.
   *
   * La lista blanca del final evita que los valores de prueba —que se
   * autodescriben— griten en cada ejecución.
   */
  [
    /\b(?:INGESTA_FIRMA_SECRETO|EDGE_INGESTA_SECRETO|BIOMETRIA_LLAVE|SUPABASE_SECRET_KEY)\b\s*[:=]\s*['"`]([^'"`\n]{16,})/,
    'secreto propio del proyecto',
    (valor) => pareceMaterialDeLlave(valor),
  ],
  [/AKIA[0-9A-Z]{16}/, 'clave de acceso de AWS'],
  [/AIza[0-9A-Za-z_-]{35}/, 'clave de API de Google'],
  [/gh[pousr]_[A-Za-z0-9]{36,}/, 'token de GitHub'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'token de Slack'],
];

/**
 * Un valor que se autodescribe como de prueba no es una fuga. Se comprueba
 * sobre la coincidencia, no sobre la línea entera, para que la excepción no se
 * extienda a lo que haya al lado.
 */
const ES_DE_PRUEBA =
  /prueba|ejemplo|example|no-aplica|solo-para|placeholder|lo-que-sea|recorrido|esto-no-puede-viajar|xxx|<|\.\.\./i;

/**
 * ¿El valor PARECE material de llave, o es una frase que alguien escribió?
 *
 * Distinguirlo importa más que ampliar la lista de palabras de «esto es de
 * prueba»: esa lista siempre va por detrás del siguiente marcador que se
 * invente, y cada palabra que se le añade —«secreto», «llave», «camino»— es
 * justo la que un valor real también podría llevar en su NOMBRE de variable.
 *
 * Lo que de verdad separa una llave de una frase es de dónde sale. Una llave la
 * genera `openssl rand`: mezcla mayúsculas con dígitos, o es hexadecimal largo.
 * Un marcador lo escribe una persona en minúsculas con guiones
 * —`un-secreto-de-al-menos-treinta-y-dos-caracteres`—, y eso no lo produce
 * ningún generador. También se descarta la interpolación (`${…}`), que no es un
 * valor sino una referencia a otro.
 */
const pareceMaterialDeLlave = (valor) => {
  if (valor.includes('${')) return false;
  if (/^[0-9a-f]{32,}$/.test(valor)) return true;
  return /[A-Z]/.test(valor) && /[0-9]/.test(valor);
};

/** El propio escáner contiene los patrones; excluirlo no es una excepción real. */
const EXCLUIDOS = new Set([
  'pnpm-lock.yaml',
  'scripts/lib/escanear-secretos.mjs',
  'scripts/escanear-secretos.sh',
]);

/**
 * LÍNEA BASE DEL HISTORIAL, con nombre y motivo. No es una absolución: es lo
 * que ya estaba cuando se montó el control, revisado uno a uno, para que
 * cualquier hallazgo futuro sea real y no ruido heredado.
 *
 * Los dos blobs son la misma línea de `e2e/doble-gotrue.mjs`: la contraseña de
 * un doble de GoTrue que se levanta DENTRO del proceso de prueba —«así el
 * camino es real de punta a punta sin tocar la red», dice el propio fichero—.
 * Nunca fue credencial de un servicio real. El commit `f06050e` ya la sustituyó
 * en el árbol por un valor sorteado por ejecución.
 *
 * NO se reescribe el historial por ella: invalidaría las referencias y los SHA
 * citados en los informes de etapa a cambio de nada, porque el valor es inerte.
 * Queda como riesgo aceptado y documentado en `docs/seguridad/AUDITORIA.md`.
 */
const BLOBS_CONOCIDOS = new Map([
  [
    '459332bc45ef1c2e198c358e016e2d1731b51863',
    'e2e/doble-gotrue.mjs · contraseña del doble en proceso',
  ],
  [
    '7062bfa7a822201d7eba7763fb3ed62e16de2cfa',
    'e2e/doble-gotrue.mjs · contraseña del doble en proceso',
  ],
]);

/**
 * H-13-18 · UN SOLO BYTE NUL HACÍA INVISIBLE UN FICHERO ENTERO.
 *
 * La versión anterior descartaba el fichero al encontrar un `\0`, imitando a
 * `grep -I`. Y no era teórico: hay un `.ts` versionado con un NUL legítimo —un
 * fixture de saneamiento— que el escáner nunca leyó. Medido:
 *
 *   misma llave, mismo fichero, CON un `\0` dentro  -> «limpio», EXIT=0
 *   misma llave, mismo fichero, SIN el `\0`         -> detectada, EXIT=1
 *
 * Ahora el NUL se QUITA y el contenido se escanea igual. Sólo se omite lo que
 * es binario de verdad, decidido por proporción de bytes no imprimibles: un
 * PNG o un PDF no tienen líneas que reportar, un fuente con un byte de control
 * sí.
 */
const esBinarioDeVerdad = (datos) => {
  const muestra = datos.subarray(0, 8192);
  if (muestra.length === 0) return false;
  let raros = 0;
  for (const b of muestra) {
    if (b === 9 || b === 10 || b === 13) continue;
    if (b < 32 || b === 127) raros += 1;
  }
  return raros / muestra.length > 0.1;
};

const esFuga = (texto) => {
  for (const [patron, descripcion, valida] of PATRONES) {
    const m = texto.match(patron);
    if (m === null || ES_DE_PRUEBA.test(m[0])) continue;
    // Cuando el patrón captura el VALOR, se juzga el valor; si no, la
    // coincidencia entera, que es lo que hacían los siete originales.
    if (valida !== undefined && !valida(m[1] ?? m[0])) continue;
    return descripcion;
  }
  return null;
};

const hallazgos = [];
let revisados = 0;

const modo = process.argv.includes('--historial')
  ? 'historial'
  : process.argv.includes('--indice')
    ? 'indice'
    : 'arbol';

if (modo === 'historial') {
  const objetos = execFileSync('git', ['rev-list', '--objects', '--all'], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  })
    .split('\n')
    .filter((l) => l.length > 0);

  const nombres = new Map();
  for (const linea of objetos) {
    const [sha, ...resto] = linea.split(' ');
    if (resto.length > 0) nombres.set(sha, resto.join(' '));
  }

  const tipos = spawnSync(
    'git',
    ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
    {
      input: objetos.map((l) => l.split(' ')[0]).join('\n'),
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    },
  );
  const blobs = tipos.stdout
    .split('\n')
    .filter((l) => l.includes(' blob '))
    .map((l) => l.split(' '))
    .filter(([, , tam]) => Number(tam) > 0 && Number(tam) < 5_000_000)
    .map(([sha]) => sha);

  const lote = spawnSync('git', ['cat-file', '--batch'], {
    input: blobs.join('\n'),
    maxBuffer: 1 << 30,
  });
  const buf = lote.stdout;
  let pos = 0;
  while (pos < buf.length) {
    const nl = buf.indexOf(0x0a, pos);
    if (nl < 0) break;
    const cabecera = buf.subarray(pos, nl).toString('utf8').split(' ');
    const sha = cabecera[0];
    const tam = Number(cabecera[2]);
    if (!Number.isFinite(tam)) break;
    const cuerpo = buf.subarray(nl + 1, nl + 1 + tam);
    pos = nl + 1 + tam + 1;
    revisados += 1;
    if (BLOBS_CONOCIDOS.has(sha) || esBinarioDeVerdad(cuerpo)) continue;
    const descripcion = esFuga(cuerpo.toString('utf8').replace(/\0/g, ''));
    if (descripcion !== null) {
      hallazgos.push(`${sha}  ${descripcion}  (${nombres.get(sha) ?? 'sin nombre'})`);
    }
  }
} else {
  const versionados = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter((f) => f.length > 0 && !EXCLUIDOS.has(f));

  /**
   * En modo índice se lee `git show :ruta`, que es EXACTAMENTE lo que se va a
   * confirmar. En modo árbol, el disco. En CI los dos coinciden; en el gancho
   * de pre-commit, no necesariamente — y ahí está el hallazgo.
   */
  const leer = (archivo) =>
    modo === 'indice'
      ? execFileSync('git', ['show', `:${archivo}`], { maxBuffer: 1 << 28 })
      : readFileSync(archivo);

  for (const archivo of versionados) {
    let datos;
    try {
      if (modo === 'arbol' && statSync(archivo).size > 5_000_000) continue;
      datos = leer(archivo);
    } catch {
      continue; // enlace roto, archivo eliminado del árbol o ruta sin índice
    }
    revisados += 1;
    if (esBinarioDeVerdad(datos)) continue;

    const lineas = datos.toString('utf8').replace(/\0/g, '').split('\n');
    lineas.forEach((linea, i) => {
      const descripcion = esFuga(linea);
      if (descripcion !== null) hallazgos.push(`${archivo}:${i + 1}  ${descripcion}`);
    });
  }
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE `.gitignore` PROHÍBE Y SIN EMBARGO ESTÁ VERSIONADO · H-13-23
 *
 * `.gitignore` no desversiona nada: una vez que un fichero está en el índice,
 * la regla deja de aplicarle. Así entró `docs/.DS_Store`, con `.DS_Store`
 * declarado en la línea 3 desde el primer commit.
 *
 * El `.DS_Store` sólo filtra nombres de ficheros y disposición de carpetas de
 * la máquina del desarrollador, y es higiene. Pero la MISMA grieta alcanza a
 * `.env`, `*.pem`, `*.key` y `service-account*.json`, que están en esa lista
 * precisamente porque §2.5 los prohíbe, y ahí ya no es higiene. Un `git add -f`
 * o un fichero que entró antes de la regla no lo veía nadie.
 *
 * `git ls-files -i -c --exclude-standard` da exactamente esa intersección.
 * ═════════════════════════════════════════════════════════════════════════════
 */
if (modo !== 'historial') {
  const prohibidos = execFileSync('git', ['ls-files', '-i', '-c', '--exclude-standard', '-z'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter((f) => f.length > 0);
  for (const f of prohibidos) {
    hallazgos.push(`${f}  versionado pese a estar en .gitignore (git rm --cached)`);
  }
}

if (hallazgos.length > 0) {
  console.error('POSIBLES SECRETOS EN EL REPOSITORIO:');
  for (const h of hallazgos.slice(0, 20)) console.error(`  ${h}`);
  if (hallazgos.length > 20) console.error(`  … y ${hallazgos.length - 20} más`);
  console.error('\nDetenido: §2.5 prohíbe cualquier secreto en el repositorio.');
  if (modo === 'historial') {
    console.error(
      '  En el HISTORIAL no basta con borrarlo en el commit siguiente: la llave\n' +
        '  sigue siendo recuperable. Rote la credencial ANTES de decidir si\n' +
        '  reescribe la historia.',
    );
  }
  process.exit(1);
}

const sufijo =
  modo === 'historial'
    ? `${revisados} blobs del historial alcanzable · ${BLOBS_CONOCIDOS.size} de línea base declarados`
    : `${revisados} archivos${modo === 'indice' ? ' del índice' : ''}`;
console.log(`escaneo de secretos: limpio (${sufijo})`);
