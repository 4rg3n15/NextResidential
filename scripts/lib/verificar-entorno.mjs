#!/usr/bin/env node
/**
 * Comprueba que Node y pnpm locales caen dentro del rango declarado en
 * `engines`, y que coinciden con `.nvmrc` y con la versión que usa el CI.
 *
 * POR QUÉ. Al mover la verificación de shell a Node se cerró una clase de
 * divergencia (BSD contra GNU) y se abrió otra: ahora el resultado depende de
 * la versión de Node. No es lo mismo —el runtime está declarado y es
 * reproducible, mientras que el `xargs` del sistema no— pero solo si alguien lo
 * comprueba. Esto lo comprueba.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AMPLIADO EN LA ETAPA 11-A · FLUTTER Y DART, por un motivo concreto
 *
 * El usuario perdió tres rondas en errores de entorno. La peor: su Dart era
 * **3.11.5** y `apps/mobile/pubspec.yaml` exige **^3.13.3**. Eso no reventó
 * aquí, en el paso 1, donde se habría leído «su Dart es viejo»: reventó cuatro
 * pasos más abajo con un error de resolución de dependencias y un
 * `PathAccessException` sobre `.dart_tool`, que no nombra la causa y manda a
 * buscar el problema en los permisos.
 *
 * Node tenía `.nvmrc` desde la ETAPA 02 y Flutter no tenía nada. Ahora sí:
 *
 *   · `.flutter-version` en la raíz — la versión MÍNIMA del framework, como
 *     `.nvmrc` para Node.
 *   · `apps/mobile/pubspec.yaml` → `environment.sdk` — el mínimo de Dart. Es la
 *     fuente de verdad que ya existía; aquí se lee, no se duplica.
 *
 * Y se comprueba **el `dart` que se va a usar**, que es el del SDK de Flutter y
 * no necesariamente el del PATH: tener los dos, de versiones distintas, es
 * justo la configuración que produce «`flutter pub get` funciona pero
 * `dart run` falla».
 */
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';

const paquete = JSON.parse(readFileSync('package.json', 'utf8'));
const nvmrc = readFileSync('.nvmrc', 'utf8').trim();

const partes = (v) => v.replace(/^v/, '').split('.').map(Number);
const compara = (a, b) => {
  const [x, y] = [partes(a), partes(b)];
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
};

/**
 * Admite `>=A <B` —lo que usa `engines`— y `^A` —lo que usa `pubspec.yaml`—.
 *
 * **El caret estaba aceptado en la expresión regular y NO interpretado**: caía
 * al `default` y la función devolvía `true` para cualquier versión. Se detectó
 * al escribir la comprobación de Flutter, probándola con un mínimo imposible
 * (`^3.99.0`): pasó en verde con Dart 3.13.3. Es la familia de siempre —el
 * control existe y no comprueba lo que uno cree—, y aquí habría dejado pasar
 * exactamente el desajuste que este control existe para nombrar.
 *
 * `^A.B.C` en pub significa `>=A.B.C <(A+1).0.0`, y para `0.x` significa
 * `>=0.B.C <0.(B+1).0`.
 */
const cumple = (version, rango) => {
  for (const termino of rango.trim().split(/\s+/)) {
    const m = termino.match(/^(>=|<=|<|>|\^|~)?(.+)$/);
    if (!m) continue;
    const [, op = '>=', ref] = m;

    if (op === '^' || op === '~') {
      if (compara(version, ref) < 0) return false;
      const [mayor, menor] = partes(ref);
      const techo =
        op === '~' || mayor === 0 ? `${mayor}.${(menor ?? 0) + 1}.0` : `${mayor + 1}.0.0`;
      if (compara(version, techo) >= 0) return false;
      continue;
    }

    const c = compara(version, ref);
    if (op === '>=' && c < 0) return false;
    if (op === '>' && c <= 0) return false;
    if (op === '<' && c >= 0) return false;
    if (op === '<=' && c > 0) return false;
  }
  return true;
};

const problemas = [];
const nodeLocal = process.versions.node;

if (!cumple(nodeLocal, paquete.engines.node)) {
  problemas.push(`Node ${nodeLocal} queda fuera de engines.node "${paquete.engines.node}"`);
}
if (compara(nodeLocal, nvmrc) !== 0) {
  // Aviso, no error: `.nvmrc` fija la versión exacta del equipo y del CI, pero
  // un parche distinto dentro del rango no invalida una verificación.
  console.warn(
    `  aviso: Node local ${nodeLocal} ≠ .nvmrc ${nvmrc} (dentro del rango; el CI usa .nvmrc)`,
  );
}
if (!cumple(nvmrc, paquete.engines.node)) {
  problemas.push(`.nvmrc ${nvmrc} contradice engines.node "${paquete.engines.node}"`);
}

try {
  const pnpmLocal = execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim();
  if (paquete.engines.pnpm && !cumple(pnpmLocal, paquete.engines.pnpm)) {
    problemas.push(`pnpm ${pnpmLocal} queda fuera de engines.pnpm "${paquete.engines.pnpm}"`);
  }
  const declarado = (paquete.packageManager ?? '').split('@')[1];
  if (declarado && compara(pnpmLocal, declarado) !== 0) {
    problemas.push(`pnpm ${pnpmLocal} ≠ packageManager ${declarado}`);
  }
} catch {
  problemas.push('pnpm no está disponible en el PATH');
}

// ─────────────────────────────────────────────────────────────────────────────
// Flutter y Dart · solo si el repositorio tiene app móvil
// ─────────────────────────────────────────────────────────────────────────────
let resumenMovil = '';
if (existsSync('apps/mobile/pubspec.yaml')) {
  const flutterBin = process.env.NCR_FLUTTER ?? 'flutter';
  const minimoFlutter = existsSync('.flutter-version')
    ? readFileSync('.flutter-version', 'utf8').trim()
    : null;

  // El mínimo de Dart sale del pubspec, que es donde ya vive. Duplicarlo en un
  // fichero propio garantizaría que un día digan cosas distintas.
  const pubspec = readFileSync('apps/mobile/pubspec.yaml', 'utf8');
  const restriccionDart = /^\s*sdk:\s*['"]?([^'"\n]+)['"]?/m.exec(pubspec)?.[1]?.trim() ?? null;

  if (minimoFlutter === null) {
    problemas.push('falta `.flutter-version` en la raíz: la versión de Flutter no está declarada');
  }

  let maquina = null;
  try {
    maquina = JSON.parse(
      execFileSync(flutterBin, ['--version', '--machine'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    );
  } catch (e) {
    problemas.push(
      `no se pudo ejecutar \`${flutterBin} --version\`: ${String(e.message).split('\n')[0]}. ` +
        'Instale el SDK o exporte NCR_FLUTTER con la ruta a su binario',
    );
  }

  if (maquina !== null) {
    const framework = String(maquina.frameworkVersion ?? '');
    const dartDeFlutter = String(maquina.dartSdkVersion ?? '').split(' ')[0];

    if (minimoFlutter !== null && compara(framework, minimoFlutter) < 0) {
      problemas.push(
        `Flutter ${framework} es anterior al mínimo declarado en .flutter-version ` +
          `(${minimoFlutter}). Actualice con \`flutter upgrade\``,
      );
    }
    if (restriccionDart !== null && !cumple(dartDeFlutter, restriccionDart)) {
      problemas.push(
        `el Dart de su Flutter es ${dartDeFlutter} y apps/mobile/pubspec.yaml exige ` +
          `"${restriccionDart}". Es ESTE desajuste el que luego aparece como un error de ` +
          'resolución de dependencias o un PathAccessException sobre .dart_tool, que no ' +
          'nombran la causa. Actualice Flutter',
      );
    }

    // El `dart` del PATH, si es OTRO. No es un fallo por sí mismo —lo que el
    // verificador usa es el del SDK— pero es la configuración que produce
    // «`flutter pub get` funciona y `dart run` falla», así que se avisa.
    try {
      const dartSuelto = execFileSync('dart', ['--version'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const versionSuelta = /Dart SDK version: (\S+)/.exec(dartSuelto)?.[1];
      if (versionSuelta !== undefined && compara(versionSuelta, dartDeFlutter) !== 0) {
        console.log(
          `   aviso: el \`dart\` del PATH es ${versionSuelta} y el de su Flutter es ` +
            `${dartDeFlutter}. El verificador usa siempre el del SDK de Flutter`,
        );
      }
    } catch {
      // No tener `dart` suelto es lo normal y no es un problema.
    }

    resumenMovil = ` · Flutter ${framework} (Dart ${dartDeFlutter}) dentro de lo declarado`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// macOS · LA CADENA DE HERRAMIENTAS DE APPLE
//
// PEDIDO POR EL USUARIO, y con razón: «el paso 1 debe comprobar en macOS que
// `xcrun --sdk macosx --show-sdk-path` devuelve algo, no solo que Xcode está
// seleccionado. Es el prerrequisito real.»
//
// Lo es literalmente. `xcode-select -p` solo dice a qué directorio apunta un
// enlace; puede apuntar a un Xcode.app cuyo primer arranque nunca se completó,
// o cuya licencia no se aceptó, y entonces NO HAY SDK. Los paquetes con
// `hook/build.dart` —los «native assets» de Dart— compilan código nativo
// llamando a `clang` con `-isysroot <esa ruta>`, así que sin ella el fallo sale
// mucho más abajo, dentro de `flutter test`, hablando de un paquete de pub.
//
// Esta comprobación no pregunta: **ejecuta el mismo comando que ejecutará la
// cadena de compilación**, y exige que la ruta que devuelva exista de verdad.
// Es la misma regla que `verificar-escritura.mjs`: un control que pregunta en
// vez de ejercer no demuestra nada.
// ─────────────────────────────────────────────────────────────────────────────
if (process.platform === 'darwin' && existsSync('apps/mobile/pubspec.yaml')) {
  let sdk = null;
  let motivo = '';
  try {
    sdk = execFileSync('xcrun', ['--sdk', 'macosx', '--show-sdk-path'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (e) {
    motivo =
      String(e.stderr ?? e.message)
        .split('\n')
        .filter((l) => l.trim() !== '')
        .slice(-1)[0] ?? String(e.message);
  }

  if (sdk === null || sdk === '') {
    problemas.push(
      '`xcrun --sdk macosx --show-sdk-path` no devuelve nada' +
        (motivo === '' ? '' : ` (${motivo})`) +
        '.\n      Sin SDK de macOS no compila NINGÚN paquete con `hook/build.dart`, y el ' +
        'fallo\n      sale luego dentro de `flutter test` hablando de un paquete de pub. ' +
        'Pruebe:\n' +
        '        sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer\n' +
        '        sudo xcodebuild -runFirstLaunch && sudo xcodebuild -license accept',
    );
  } else if (!existsSync(sdk)) {
    problemas.push(
      `\`xcrun\` devuelve ${sdk} y esa ruta NO EXISTE. Es un Xcode a medio instalar ` +
        'o movido;\n      reinstálelo o ejecute `sudo xcodebuild -runFirstLaunch`',
    );
  } else {
    resumenMovil += ` · SDK de macOS en ${sdk.replace(/^.*\//, '')}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EL RECORRIDO DEL PASO 5e · sus DOS prerrequisitos, nombrados aquí
//
// PEDIDO POR EL USUARIO: «El 5e sigue sin diagnosticar. ¿Necesita la API
// levantada? Si es así, que el paso lo compruebe y lo nombre.»
//
// **No la necesita.** `apps/mobile/e2e/recorrido-web.mjs` levanta él mismo un
// servidor de guardarropa en 127.0.0.1:4599 que contesta las cinco rutas del
// residente y el `token`. Si el 5e fallara por la API caída sería un defecto
// del recorrido, no del entorno.
//
// Lo que sí necesita son dos cosas que hasta ahora no se comprobaban en ningún
// sitio, y que en macOS faltan con toda normalidad:
//
//   1 · un **Chromium** que Playwright pueda lanzar. En este contenedor viene
//       preinstalado en `/opt/pw-browsers`; en un portátil recién clonado, no
//       existe hasta que alguien ejecuta `playwright install`.
//   2 · el **puerto libre**. Si algo lo ocupa, el recorrido no arranca y el
//       mensaje habla de una conexión rechazada, no del puerto.
// ─────────────────────────────────────────────────────────────────────────────
if (existsSync('apps/mobile/e2e/recorrido-web.mjs')) {
  const explicito = process.env.NCR_CHROMIUM;
  let navegador = null;

  if (explicito !== undefined && explicito !== '') {
    navegador = existsSync(explicito) ? explicito : null;
    if (navegador === null) {
      problemas.push(`NCR_CHROMIUM apunta a ${explicito} y ahí no hay nada`);
    }
  } else if (existsSync('/opt/pw-browsers/chromium')) {
    navegador = '/opt/pw-browsers/chromium';
  } else {
    // El camino normal fuera del contenedor: que lo resuelva Playwright.
    try {
      const { chromium } = await import('playwright');
      const ruta = chromium.executablePath();
      navegador = existsSync(ruta) ? ruta : null;
      if (navegador === null) {
        problemas.push(
          `Playwright espera Chromium en ${ruta} y no está.\n` +
            '      El paso 5e —el recorrido de la app en un navegador de verdad— no puede ' +
            'correr.\n      Instálelo: `pnpm exec playwright install chromium`',
        );
      }
    } catch (e) {
      problemas.push(
        `no se pudo cargar \`playwright\` (${String(e.message).split('\n')[0]}). ` +
          'Ejecute `pnpm install`',
      );
    }
  }

  // El puerto. Se comprueba INTENTANDO escucharlo, no consultando una lista.
  const puerto = Number(process.env.NCR_PUERTO_RECORRIDO ?? 4599);
  const ocupado = await new Promise((resolver) => {
    const s = createServer();
    s.once('error', (e) => resolver(e.code ?? 'EADDRINUSE'));
    s.once('listening', () => s.close(() => resolver(null)));
    s.listen(puerto, '127.0.0.1');
  });
  if (ocupado !== null) {
    problemas.push(
      `el puerto ${puerto}, que usa el recorrido del paso 5e, no se puede escuchar ` +
        `(${ocupado}).\n      Libérelo o exporte NCR_PUERTO_RECORRIDO con otro`,
    );
  }

  if (navegador !== null && ocupado === null) {
    resumenMovil += ` · recorrido listo (Chromium + puerto ${puerto})`;
  }
}

if (problemas.length > 0) {
  console.error('ENTORNO fuera de lo declarado:');
  for (const p of problemas) console.error(`  ✗ ${p}`);
  console.error(
    '\n  Node: usa la versión de .nvmrc (`nvm use`) y `corepack enable`.' +
      '\n  Flutter: la versión mínima está en `.flutter-version`; el mínimo de Dart, en' +
      '\n  `apps/mobile/pubspec.yaml`. Un desajuste aquí es la causa de los fallos que' +
      '\n  aparecen luego en los pasos 5b a 5e.',
  );
  process.exit(1);
}
console.log(`entorno: Node ${nodeLocal} y pnpm dentro de engines · .nvmrc ${nvmrc}${resumenMovil}`);
