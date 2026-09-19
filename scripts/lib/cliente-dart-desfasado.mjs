#!/usr/bin/env node
/**
 * CONTROL · el cliente Dart está GENERADO y al día con el contrato.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ, Y POR QUÉ EN DART MÁS QUE EN NINGÚN SITIO
 *
 * El documento de requisitos señala a Dart explícitamente: es **el único
 * componente que no comparte tipos con el resto**. La consola de Next.js
 * importa los tipos que `openapi-typescript` genera y el compilador la obliga a
 * seguir el contrato; si la API renombra un campo, la consola no compila. Dart
 * no tiene esa red. Un cliente escrito a mano —o uno generado que se quedó
 * atrás— compila perfectamente contra un contrato que ya no existe, y el primer
 * aviso es un campo nulo en el teléfono de un residente.
 *
 * Es el hermano de `contrato-desfasado.mjs`, que hace lo mismo con el cliente
 * de TypeScript.
 *
 * CÓMO. Se regenera el cliente en un directorio temporal, desde el MISMO
 * `openapi.json` versionado, y se compara con el que está en el repositorio.
 * Solo los ficheros que escribe el generador: los `.g.dart` los produce
 * `build_runner` a partir de ellos, así que compararlos sería comparar dos
 * veces lo mismo y sumarle el ruido de la versión del generador.
 *
 *   node scripts/lib/cliente-dart-desfasado.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';

const APP = 'apps/mobile';
const GENERADO = join(APP, 'lib/infraestructura/api/generado');
const CONTRATO = 'packages/contracts/openapi.json';

if (!existsSync(CONTRATO)) {
  console.error(`FALLO no existe ${CONTRATO}: genérelo con \`pnpm contrato\``);
  process.exit(1);
}
if (!existsSync(GENERADO)) {
  console.error(`FALLO no existe ${GENERADO}: el cliente Dart no está generado`);
  process.exit(1);
}

/**
 * Ruta de `flutter`, configurable como la de Chromium (`NCR_FLUTTER`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL `dart` SALE DEL SDK DE FLUTTER, NUNCA DEL PATH
 *
 * Antes esto usaba `dart` a secas cuando Flutter venía del PATH, y esa es
 * justamente la configuración que produce el síntoma más desconcertante de
 * todos: **`flutter pub get` funciona y `dart run` falla**. Ocurre cuando hay
 * un Dart suelto instalado —de Homebrew, de un SDK anterior— distinto del que
 * trae el Flutter en uso: dos SDK, dos resoluciones de paquetes y un
 * `.dart_tool` escrito por uno y leído por el otro.
 *
 * `flutter --version --machine` dice qué Dart trae; el binario vive junto al de
 * `flutter`. Si no se puede resolver, se cae a `dart` y se dice en el mensaje,
 * porque una suposición silenciosa aquí es media hora de diagnóstico ajeno.
 */
const flutterBin = process.env.NCR_FLUTTER ?? 'flutter';

const rutaDeFlutter = () => {
  try {
    return execFileSync(process.platform === 'win32' ? 'where' : 'command', ['-v', flutterBin], {
      encoding: 'utf8',
      shell: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .split('\n')[0];
  } catch {
    return null;
  }
};

const rutaFlutter = rutaDeFlutter();
const dartBin = rutaFlutter === null ? 'dart' : join(dirname(rutaFlutter), 'dart');

const ficheros = (raiz) => {
  const salida = [];
  const recorrer = (d) => {
    for (const e of readdirSync(d)) {
      const ruta = join(d, e);
      if (statSync(ruta).isDirectory()) {
        recorrer(ruta);
      } else if (e.endsWith('.dart') && !e.endsWith('.g.dart')) {
        salida.push(relative(raiz, ruta));
      }
    }
  };
  recorrer(raiz);
  return salida.sort();
};

const banco = mkdtempSync(join(tmpdir(), 'ncr-dart-'));
try {
  const destino = join(banco, 'generado');
  try {
    execFileSync(
      dartBin,
      [
        'run',
        'swagger_parser',
        '--schema_path',
        join(process.cwd(), CONTRATO),
        '--output_directory',
        destino,
        '--name',
        'ncr_api',
      ],
      { cwd: APP, stdio: 'pipe' },
    );
  } catch (e) {
    console.error('FALLO no se pudo ejecutar el generador de cliente Dart.');
    // Qué se intentó y desde dónde: un fallo de herramienta sin estos dos datos
    // manda a buscar el problema en el código.
    console.error(`  comando   : ${dartBin} run swagger_parser`);
    console.error(`  directorio: ${join(process.cwd(), APP)}`);
    console.error(
      '  Hace falta el SDK de Flutter en el PATH (o NCR_FLUTTER apuntando a su binario).\n' +
        '  Sin él, este control NO puede afirmar nada: una omisión no es un verde.',
    );
    console.error(String(e.stderr ?? e.message).slice(0, 400));
    process.exit(1);
  }

  const enRepo = ficheros(GENERADO);
  const reciennacido = ficheros(destino);

  const faltan = reciennacido.filter((f) => !enRepo.includes(f));
  const sobran = enRepo.filter((f) => !reciennacido.includes(f));
  const distintos = reciennacido
    .filter((f) => enRepo.includes(f))
    .filter(
      (f) => readFileSync(join(GENERADO, f), 'utf8') !== readFileSync(join(destino, f), 'utf8'),
    );

  if (faltan.length + sobran.length + distintos.length > 0) {
    console.error('FALLO el cliente Dart no coincide con el contrato:');
    for (const f of faltan) console.error(`  · falta en el repositorio: ${f}`);
    for (const f of sobran) console.error(`  · sobra (el contrato ya no lo produce): ${f}`);
    for (const f of distintos) console.error(`  · difiere: ${f}`);
    console.error(
      '\nRegenérelo:\n' +
        '  pnpm contrato && (cd apps/mobile && dart run swagger_parser && dart run build_runner build --delete-conflicting-outputs)',
    );
    process.exit(1);
  }

  console.log(
    `cliente Dart al día: ${enRepo.length} ficheros generados desde ${CONTRATO}, sin diferencias`,
  );
} finally {
  rmSync(banco, { recursive: true, force: true });
}
