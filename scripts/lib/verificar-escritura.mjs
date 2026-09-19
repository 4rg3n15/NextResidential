#!/usr/bin/env node
/**
 * CONTROL · el árbol es ESCRIBIBLE por las herramientas que van a usarlo.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE — pedido por el usuario tras tres rondas perdidas en entorno
 *
 * El síntoma fue un `PathAccessException` al crear `.dart_tool`, cuatro pasos
 * después de donde estaba la causa. Un permiso denegado aparece siempre así:
 * lejos, disfrazado del error de la herramienta que tropezó con él, y mandando
 * a buscar el problema en el código. Aquí se comprueba **antes de compilar
 * nada**, y el mensaje dice la ruta, la operación y el dueño.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * SE COMPRUEBA POR EJERCICIO, NO POR DECLARACIÓN
 *
 * `fs.access(W_OK)` **miente** más de lo que parece: consulta los bits de
 * permiso, y no ve un sistema de ficheros montado de solo lectura, ni una ACL
 * de macOS, ni la protección de integridad del sistema, ni un volumen sin
 * espacio. Es la misma lección que el resto del verificador aprendió a base de
 * golpes: **un control que pregunta en vez de ejercer no demuestra nada.** Aquí
 * se crea un fichero de verdad, se escribe, se lee y se borra.
 *
 * Y se comprueba **dentro** de los directorios que ya existen, no solo su
 * padre: el caso real es un `.dart_tool` heredado de otra ejecución —o de un
 * `sudo` de hace meses— cuyo padre es perfectamente escribible.
 *
 *   node scripts/lib/verificar-escritura.mjs
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir, tmpdir, userInfo } from 'node:os';
import { join, dirname } from 'node:path';

const problemas = [];
const comprobados = [];

/** Dueño legible de una ruta, para que el mensaje diga a quién pedirle. */
const duenoDe = (ruta) => {
  try {
    const info = statSync(ruta);
    const permisos = (info.mode & 0o777).toString(8);
    return `uid ${info.uid}, permisos ${permisos}`;
  } catch {
    return 'ilegible';
  }
};

/**
 * Ejercita la escritura en un directorio. Si no existe, se intenta crear —que
 * es exactamente lo que hacen `.dart_tool`, `dist` y `build` la primera vez—.
 */
const ejercer = (ruta, para, { crearSiFalta = true } = {}) => {
  const existia = existsSync(ruta);
  if (!existia) {
    if (!crearSiFalta) return;
    try {
      mkdirSync(ruta, { recursive: true });
    } catch (e) {
      problemas.push(
        `no se puede CREAR ${ruta} (${para}): ${e.code ?? e.message}. ` +
          `El padre ${dirname(ruta)} es ${duenoDe(dirname(ruta))}`,
      );
      return;
    }
  }

  const sonda = join(ruta, `.ncr-sonda-escritura-${process.pid}`);
  try {
    writeFileSync(sonda, 'sonda\n');
    if (readFileSync(sonda, 'utf8') !== 'sonda\n') {
      problemas.push(`${ruta} acepta la escritura pero devuelve otra cosa al leer (${para})`);
    }
    rmSync(sonda, { force: true });
    comprobados.push(ruta);
  } catch (e) {
    problemas.push(
      `no se puede ESCRIBIR en ${ruta} (${para}): ${e.code ?? e.message}. ` +
        `El directorio es ${duenoDe(ruta)} y usted es uid ${userInfo().uid}`,
    );
    rmSync(sonda, { force: true });
  } finally {
    // Si lo creamos nosotros y está vacío, se retira: el verificador no deja
    // rastro en un árbol limpio.
    if (!existia) {
      try {
        rmSync(ruta, { recursive: false });
      } catch {
        /* tenía contenido o no se puede: se deja como estaba */
      }
    }
  }
};

// ─── 1 · Lo que escriben Node, pnpm y turbo ──────────────────────────────────
ejercer(process.cwd(), 'la raíz del repositorio', { crearSiFalta: false });
ejercer(join(process.cwd(), 'node_modules'), 'dependencias de pnpm');
ejercer(join(process.cwd(), '.turbo'), 'caché de turbo');
ejercer(tmpdir(), 'ficheros temporales del verificador (mktemp)', { crearSiFalta: false });

// ─── 2 · Lo que escribe la cadena de Dart ────────────────────────────────────
if (existsSync('apps/mobile/pubspec.yaml')) {
  for (const [directorio, para] of [
    ['apps/mobile/.dart_tool', 'resolución de paquetes de Dart'],
    ['apps/mobile/build', 'artefactos de compilación de Flutter'],
    ['apps/mobile/coverage', 'informe de cobertura de Dart'],
  ]) {
    ejercer(join(process.cwd(), directorio), para);
  }

  // La caché de pub. Si está en `$PUB_CACHE`, esa manda.
  const cache = process.env.PUB_CACHE ?? join(homedir(), '.pub-cache');
  ejercer(cache, 'caché de paquetes de pub (PUB_CACHE)');

  /**
   * Y el propio SDK de Flutter, que **escribe en su instalación**: `bin/cache`
   * guarda artefactos del motor y los descarga la primera vez. Un SDK
   * instalado con `sudo` —frecuente en macOS cuando se pone en `/opt` o
   * `/usr/local`— deja a Flutter sin poder escribir ahí, y el error que sale no
   * menciona permisos.
   */
  const flutterBin = process.env.NCR_FLUTTER ?? 'flutter';
  try {
    const ruta = execFileSync(
      process.platform === 'win32' ? 'where' : 'command',
      ['-v', flutterBin],
      {
        encoding: 'utf8',
        shell: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
      .trim()
      .split('\n')[0];
    if (ruta) {
      const cacheDelSdk = join(dirname(ruta), 'cache');
      if (existsSync(cacheDelSdk)) ejercer(cacheDelSdk, 'caché del SDK de Flutter');
    }
  } catch {
    // Sin Flutter en el PATH no hay nada que comprobar aquí: de eso se ocupa
    // `verificar-entorno.mjs`, que falla con su propio mensaje.
  }
}

// ─── Veredicto ───────────────────────────────────────────────────────────────
if (problemas.length > 0) {
  console.error(
    `FALLO ${problemas.length} ruta(s) que las herramientas necesitan y no pueden usar:`,
  );
  for (const p of problemas) console.error(`  · ${p}`);
  console.error(
    '\n  Un permiso denegado aparece siempre lejos de donde está: como un ' +
      'PathAccessException\n  al crear `.dart_tool`, o como un fallo de compilación sin causa. ' +
      'Corríjalo aquí.',
  );
  process.exit(1);
}

console.log(
  `escritura: ${comprobados.length} rutas ejercidas de verdad (crear, escribir, leer, borrar)`,
);
