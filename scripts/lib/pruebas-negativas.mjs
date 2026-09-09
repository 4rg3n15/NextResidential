#!/usr/bin/env node
/**
 * PRUEBAS NEGATIVAS de los propios controles.
 *
 * Un control que nadie ha visto fallar no está demostrado. Aquí se introduce
 * cada violación a propósito, se exige que el control la detecte, y se
 * comprueba que no quedó rastro.
 *
 * CORRECCIÓN 2026-09-07, dos defectos reportados desde macOS:
 *
 *  1. Las sondas escribían DENTRO del árbol de trabajo. Aunque revertían, un
 *     verificador que modifica archivos versionados es un riesgo innecesario:
 *     una interrupción a mitad —Ctrl-C, un `kill`, un fallo de disco— deja el
 *     repositorio alterado. Ahora **todas** operan sobre un directorio
 *     temporal fuera del árbol, con un clon ligero cuando hace falta que git
 *     las vea.
 *  2. La comprobación posterior informaba «package.json quedó alterado» con el
 *     árbol limpio: comparaba el contenido en memoria en vez de preguntarle a
 *     git. Ahora se usa `git diff --quiet`, que es la fuente de verdad.
 */
import { execFileSync } from 'node:child_process';
import {
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  cpSync,
  chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const raiz = process.cwd();
let fallos = 0;
const ok = (m) => console.log(`   ✓ ${m}`);
const mal = (m) => {
  console.log(`   ✗ ${m}`);
  fallos += 1;
};

const correr = (cmd, args, opciones = {}) => {
  try {
    return {
      codigo: 0,
      salida: execFileSync(cmd, args, {
        cwd: raiz,
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 120_000,
        ...opciones,
      }),
    };
  } catch (e) {
    return { codigo: e.status ?? 1, salida: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

/**
 * Estado del árbol según git, que es la fuente de verdad.
 *
 * NO se exige que el árbol esté limpio: durante el desarrollo tiene cambios
 * legítimos, y bloquear por eso convertiría el control en un estorbo. Lo que
 * se comprueba es la invariante real —**las sondas no cambian nada**—
 * comparando el estado antes y después. Eso vale igual con el árbol sucio.
 */
const estadoDelArbol = () => correr('git', ['status', '--porcelain=v1']).salida.trim();

const estadoInicial = estadoDelArbol();

/**
 * Banco de pruebas: un clon ligero del repositorio en un temporal. Las sondas
 * que necesitan que git las vea —el escaneo de secretos y el de portabilidad
 * recorren `git ls-files`— operan aquí, no en el repositorio real.
 */
const banco = mkdtempSync(join(tmpdir(), 'ncr-negativas-'));
const clon = join(banco, 'repo');
try {
  correr('git', ['clone', '--quiet', '--no-hardlinks', '--depth', '1', raiz, clon]);
  // El clon necesita los guiones tal como están AHORA, no como estén en HEAD:
  // se está verificando el árbol de trabajo, no el último commit.
  mkdirSync(join(clon, 'scripts', 'lib'), { recursive: true });
  cpSync(join(raiz, 'scripts', 'lib'), join(clon, 'scripts', 'lib'), { recursive: true });
  cpSync(join(raiz, 'package.json'), join(clon, 'package.json'));
  cpSync(join(raiz, '.nvmrc'), join(clon, '.nvmrc'));

  const enClon = (cmd, args) => correr(cmd, args, { cwd: clon });

  console.log('\n▸ 1 · un secreto sintético bloquea el escaneo');
  {
    // Valor SINTÉTICO con forma de llave secreta, en el clon temporal. Nunca
    // toca el repositorio real ni su índice.
    writeFileSync(
      join(clon, 'sonda-secreto.ts'),
      `export const x = 'sb_secret_${'A1b2C3d4E5f6G7h8'}';\n`,
    );
    enClon('git', ['add', '--intent-to-add', 'sonda-secreto.ts']);
    const r = enClon('node', ['scripts/lib/escanear-secretos.mjs']);
    if (r.codigo !== 0 && /sonda-secreto/.test(r.salida))
      ok('detectado, con salida distinta de cero');
    else mal(`NO detectado (codigo ${r.codigo})`);
    rmSync(join(clon, 'sonda-secreto.ts'), { force: true });
    enClon('git', ['rm', '--cached', '--quiet', '--force', 'sonda-secreto.ts']);
    enClon('node', ['scripts/lib/escanear-secretos.mjs']).codigo === 0
      ? ok('el banco de pruebas queda limpio')
      : mal('la sonda dejó rastro en el banco');
  }

  console.log('\n▸ 2 · una construcción BSD/GNU divergente rompe la verificación');
  {
    writeFileSync(
      join(clon, 'sonda-portabilidad.sh'),
      '#!/usr/bin/env bash\necho x | xargs -r echo\n',
    );
    enClon('git', ['add', '--intent-to-add', 'sonda-portabilidad.sh']);
    const r = enClon('node', ['scripts/lib/portabilidad.mjs']);
    if (r.codigo !== 0 && /xargs -r/.test(r.salida)) ok('detectada, con salida distinta de cero');
    else mal(`NO detectada (codigo ${r.codigo})`);
    rmSync(join(clon, 'sonda-portabilidad.sh'), { force: true });
    enClon('git', ['rm', '--cached', '--quiet', '--force', 'sonda-portabilidad.sh']);
    enClon('node', ['scripts/lib/portabilidad.mjs']).codigo === 0
      ? ok('el banco de pruebas queda limpio')
      : mal('la sonda dejó rastro en el banco');
  }

  console.log('\n▸ 3 · un fichero de prueba que nadie ejecuta dispara el recuento');
  {
    // Se simula la salida de una corrida que recogió MENOS ficheros de los que
    // hay en disco: es el escenario real —un patrón `include` que dejó de
    // alcanzarlos— sin estropear la configuración para provocarlo.
    const salidaFalsa = join(banco, 'salida-corrida.txt');
    writeFileSync(salidaFalsa, 'Test Files  2 passed (2)\nTests  9 passed (9)\n');
    const r = correr('node', ['scripts/lib/contar-pruebas.mjs', salidaFalsa]);
    if (r.codigo !== 0 && /recogidos/.test(r.salida)) ok('detectado, con salida distinta de cero');
    else mal(`NO detectado (codigo ${r.codigo}): ${r.salida.trim()}`);
  }

  console.log(
    '\n▸ 4 · el protocolo del fabricante fuera de packages/providers rompe el build (KPI-11)',
  );
  {
    // Dos violaciones en una sola sonda: la palabra del protocolo y una IP de
    // equipo. Ambas son las que la ETAPA 15 debe seguir teniendo confinadas.
    const sonda = join(clon, 'apps', 'api', 'src', 'sonda-hardware.ts');
    mkdirSync(join(clon, 'apps', 'api', 'src'), { recursive: true });
    // Línea base del clon: se compara CONTRA ELLA, no contra «cero hallazgos».
    // El clon es de HEAD, y el árbol de trabajo puede llevar ya una corrección
    // sin confirmar; exigir cero mediría el commit anterior, no la sonda.
    const base = enClon('node', ['scripts/lib/frontera-hardware.mjs']).salida;
    writeFileSync(sonda, `export const u = 'http://192.168.1.64/IS${'API'}/Streaming';\n`); // kpi-11-exento: sonda deliberada del propio control
    const r = enClon('node', ['scripts/lib/frontera-hardware.mjs']);
    if (r.codigo !== 0 && /sonda-hardware/.test(r.salida) && /192\.168\.1\.64/.test(r.salida)) {
      // kpi-11-exento
      ok('detectados el protocolo y la IP, con salida distinta de cero');
    } else {
      mal(`NO detectado (codigo ${r.codigo})`);
    }
    rmSync(sonda, { force: true });
    enClon('node', ['scripts/lib/frontera-hardware.mjs']).salida === base
      ? ok('el banco de pruebas vuelve a su línea base')
      : mal('la sonda dejó rastro en el banco');
  }

  console.log('\n▸ 5 · una clave ajena hacia una tabla append-only se detecta al escribirla');
  {
    // El defecto real de la ETAPA 01: `alertas_evento_fk` hacia `eventos`.
    // Estuvo vigente cinco etapas sin que ninguna suite lo notara, porque una
    // restricción que nunca se ejerce no se distingue de una que funciona.
    const sonda = join(clon, 'supabase', 'migrations', '29990101000000_9999_sonda.sql');
    mkdirSync(join(clon, 'supabase', 'migrations'), { recursive: true });
    cpSync(join(raiz, 'supabase', 'migrations'), join(clon, 'supabase', 'migrations'), {
      recursive: true,
    });
    enClon('node', ['scripts/lib/frontera-append-only.mjs']).codigo === 0
      ? ok('la línea base del banco está limpia')
      : mal('el banco NO parte de una línea base limpia');

    writeFileSync(
      sonda,
      'CREATE TABLE public.sonda (\n' +
        '  evento_id uuid NOT NULL,\n' +
        '  evento_ocurrido_en timestamptz NOT NULL,\n' +
        '  CONSTRAINT sonda_evento_fk FOREIGN KEY (evento_id, evento_ocurrido_en)\n' +
        '    REFERENCES public.eventos(id, ocurrido_en)\n' +
        ');\n',
    );
    const r = enClon('node', ['scripts/lib/frontera-append-only.mjs']);
    if (r.codigo !== 0 && /sonda_evento_fk/.test(r.salida)) {
      ok('detectada, con salida distinta de cero');
    } else {
      mal(`NO detectada (codigo ${r.codigo})`);
    }

    // Y la contraparte: retirada en una migración posterior, deja de serlo.
    writeFileSync(
      join(clon, 'supabase', 'migrations', '29990102000000_9999_sonda_retirada.sql'),
      'ALTER TABLE public.sonda DROP CONSTRAINT IF EXISTS sonda_evento_fk;\n',
    );
    enClon('node', ['scripts/lib/frontera-append-only.mjs']).codigo === 0
      ? ok('retirarla en una migración posterior la saca del recuento')
      : mal('una restricción ya retirada se sigue contando');
  }

  console.log('\n▸ 6 · un Node fuera de `engines` detiene la verificación');
  {
    // Se altera el package.json DEL CLON, no el real.
    const pkg = JSON.parse(readFileSync(join(clon, 'package.json'), 'utf8'));
    pkg.engines.node = '>=99.0.0';
    writeFileSync(join(clon, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
    const r = enClon('node', ['scripts/lib/verificar-entorno.mjs']);
    r.codigo !== 0 ? ok('detectado') : mal('NO detectado');
  }
  console.log('\n▸ 7 · una suite intermitente NO pasa por estable');
  {
    /**
     * Sonda de la ETAPA 07. El control de estabilidad ejecuta una orden varias
     * veces y compara; aquí la orden es un guion que **alterna** su resultado,
     * que es la forma exacta de la prueba intermitente que motivó el control.
     *
     * Se sustituye la suite por un guion en vez de invocar Vitest tres veces:
     * lo que se pone a prueba es la comparación de firmas, y hacerlo contra la
     * suite real costaría minutos en cada verificación sin comprobar nada más.
     * El análisis de la salida de Vitest lo ejercita el paso real.
     */
    const contador = join(banco, 'contador');
    const inestable = join(banco, 'suite-inestable.sh');
    writeFileSync(
      inestable,
      [
        '#!/usr/bin/env bash',
        `n=$(cat "${contador}" 2>/dev/null || echo 0)`,
        `echo $((n + 1)) > "${contador}"`,
        'if [ $((n % 2)) -eq 0 ]; then',
        '  echo "   Tests  85 passed (85)"; exit 0',
        'else',
        '  echo "   × zonas · CU-05 por HTTP > lista las zonas"',
        '  echo "   Tests  1 failed | 84 passed (85)"; exit 1',
        'fi',
      ].join('\n'),
    );
    chmodSync(inestable, 0o755);

    const r = correr('node', [
      'scripts/lib/estabilidad.mjs',
      '--repeticiones',
      '2',
      '--comando',
      inestable,
    ]);
    r.codigo !== 0 && /NO coincide|terminó en rojo/.test(r.salida)
      ? ok('detectada: dos corridas con resultado distinto son un fallo')
      : mal(`NO detectada (codigo ${r.codigo})`);

    // Y el reverso: un control que fallara siempre tampoco serviría de nada.
    const estable = join(banco, 'suite-estable.sh');
    writeFileSync(estable, '#!/usr/bin/env bash\necho "   Tests  85 passed (85)"\nexit 0\n');
    chmodSync(estable, 0o755);
    correr('node', ['scripts/lib/estabilidad.mjs', '--repeticiones', '2', '--comando', estable])
      .codigo === 0
      ? ok('una suite reproducible sí pasa')
      : mal('el control rechaza una suite que es estable');
  }
  console.log('\n▸ 8 · entrar en un módulo por dentro, y no por su barril, se detecta');
  {
    /**
     * Sonda de la ETAPA 08 (D-34). Se construye un árbol SINTÉTICO —dos módulos
     * y nada más— en vez de usar el clon del repositorio.
     *
     * Motivo, aprendido al escribirla: el clon es de HEAD, que todavía traía
     * las 35 violaciones que esta etapa corrige, así que la comprobación de la
     * vía legítima salía roja por culpa de ficheros ajenos a la sonda. Un
     * control se prueba contra un caso aislado, no contra el ruido del árbol.
     */
    const arbol = join(banco, 'frontera');
    const src = join(arbol, 'apps', 'api', 'src');
    const padronApp = join(src, 'padron', 'aplicacion');
    const autDominio = join(src, 'autenticacion', 'dominio');
    mkdirSync(padronApp, { recursive: true });
    mkdirSync(autDominio, { recursive: true });
    writeFileSync(join(autDominio, 'claims.ts'), 'export type X = string;\n');

    const conImport = (especificador) =>
      writeFileSync(
        join(padronApp, 'sonda-frontera.ts'),
        `import type { X } from '${especificador}';\nexport type Y = X;\n`,
      );

    conImport('../../autenticacion/dominio/claims');
    const r = correr('node', ['scripts/lib/frontera-modulos.mjs', arbol]);
    r.codigo !== 0 && /sonda-frontera/.test(r.salida)
      ? ok('detectada, con salida distinta de cero')
      : mal(`NO detectada (codigo ${r.codigo})`);

    // Y el barril sí se acepta: un control que rechazara también la vía
    // legítima obligaría a desactivarlo, que es la peor forma de no tenerlo.
    writeFileSync(
      join(src, 'autenticacion', 'index.ts'),
      "export type { X } from './dominio/claims';\n",
    );
    conImport('../../autenticacion');
    correr('node', ['scripts/lib/frontera-modulos.mjs', arbol]).codigo === 0
      ? ok('entrar por el barril no es una violación')
      : mal('el control rechaza la vía legítima');
  }
} finally {
  rmSync(banco, { recursive: true, force: true });
}

console.log('');
// La comprobación final le pregunta a git, no a una copia en memoria: es lo que
// falló antes, informando «alterado» con el árbol limpio.
const estadoFinal = estadoDelArbol();
if (estadoFinal === estadoInicial) {
  ok('el árbol de trabajo real quedó exactamente como estaba');
} else {
  mal('el árbol de trabajo real cambió durante las pruebas negativas');
  const antes = new Set(estadoInicial.split('\n'));
  for (const linea of estadoFinal.split('\n')) {
    if (linea && !antes.has(linea)) console.log(`     + ${linea}`);
  }
}

if (fallos > 0) {
  console.log(`\nPRUEBAS NEGATIVAS: ${fallos} comprobación(es) fallaron`);
  process.exit(1);
}
console.log('\nPRUEBAS NEGATIVAS: los 8 controles detectan su violación, sin tocar el árbol');
