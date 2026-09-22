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
  existsSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  chmodSync,
  rmSync,
  readFileSync,
  cpSync,
  symlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const CONTRATO = 'packages/contracts/openapi.json';
const CLIENTE = 'packages/contracts/src/generado/api.ts';

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
  /**
   * EL BANCO REFLEJA EL ÁRBOL DE TRABAJO, NO `HEAD`.
   *
   * Antes se copiaban tres cosas sueltas —`scripts/lib`, `package.json`,
   * `.nvmrc`— y el resto del banco quedaba en el último commit. Eso convierte
   * al banco en un artefacto que envejece: una corrección hecha en el árbol no
   * se veía aquí, y la sonda concluía sobre un estado que ya no existe. Es la
   * misma familia de fallo que motivó `contrato-desfasado.mjs`.
   *
   * Se copian TODOS los ficheros versionados tal como están ahora. El índice
   * del clon sigue siendo el de `HEAD`, que es lo que `git ls-files` necesita
   * para que las sondas vean lo mismo que ve el control real.
   */
  for (const relativo of correr('git', ['ls-files', '-z']).salida.split('\0')) {
    if (relativo.length === 0) continue;
    const origen = join(raiz, relativo);
    if (!existsSync(origen)) continue;
    mkdirSync(dirname(join(clon, relativo)), { recursive: true });
    cpSync(origen, join(clon, relativo));
  }

  const enClon = (cmd, args) => correr(cmd, args, { cwd: clon });

  /**
   * EL BANCO SOLO VE LO QUE GIT CONOCE.
   *
   * Un control recién escrito y todavía **sin versionar** no llega aquí: el
   * clon sale de `HEAD` y la copia recorre `git ls-files`. El control se
   * ejecuta, Node no encuentra el módulo y devuelve 1 — y 1 es exactamente lo
   * que la sonda espera de una violación, así que la línea base sale en rojo
   * con un diagnóstico que manda a buscar el defecto donde no está. Pasó con
   * `esquemas-unicos.mjs` y costó una lectura entera del banco.
   *
   * Es la familia otra vez, y esta vez dentro del control de los controles: el
   * control existía y no comprobaba lo que uno creía. Ahora se comprueba antes
   * de sondear, y el mensaje dice qué hacer.
   */
  const exigeControl = (ruta) => {
    if (existsSync(join(clon, ruta))) return true;
    mal(`${ruta} no está en el banco: falta versionarlo (\`git add\`) antes de verificar`);
    return false;
  };

  console.log('\n▸ 1 · un secreto sintético bloquea el escaneo');
  {
    /**
     * LÍNEA BASE PRIMERO. Sin esto, un hallazgo REAL del repositorio se
     * informaba como «la sonda dejó rastro en el banco»: un diagnóstico falso
     * que manda a buscar el defecto donde no está. Ocurrió —había una
     * contraseña literal en `e2e/doble-gotrue.mjs`— y costó una ronda.
     */
    enClon('node', ['scripts/lib/escanear-secretos.mjs']).codigo === 0
      ? ok('la línea base del banco está limpia')
      : mal('el banco NO parte de una línea base limpia: el repositorio tiene un hallazgo real');

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
    enClon('node', ['scripts/lib/portabilidad.mjs']).codigo === 0
      ? ok('la línea base del banco está limpia')
      : mal('el banco NO parte de una línea base limpia: el repositorio tiene un hallazgo real');

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

    /**
     * MITAD POSITIVA, añadida en la revisión del 2026-09-09.
     *
     * Sin ella, un `contar-pruebas.mjs` que fallara SIEMPRE —por un cambio en
     * el recorrido de directorios, por un error al arrancar— habría dejado
     * esta sonda en verde sin comprobar nada: solo se exigía que fallara.
     * Un control que no distingue el caso legítimo del ilegítimo no es un
     * control, es una constante.
     */
    const salidaCompleta = join(banco, 'salida-completa.txt');
    writeFileSync(salidaCompleta, 'Test Files  9999 passed (9999)\nTests  1 passed (1)\n');
    const positiva = correr('node', ['scripts/lib/contar-pruebas.mjs', salidaCompleta]);
    positiva.codigo === 0 && /ficheros de prueba ejecutados/.test(positiva.salida)
      ? ok('una corrida que sí recoge todos los ficheros pasa el control')
      : mal(`el control rechaza una corrida completa (codigo ${positiva.codigo})`);
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

  console.log('\n▸ 4b · un atributo `style` en la consola rompe el build (D-63, §2.7.7)');
  {
    /**
     * El control cuya ausencia dejó las barras del tablero a cero en
     * producción: la CSP rechaza `style="height:37%"`, jsdom no aplica CSP y el
     * recorrido del navegador visitaba el tablero sin datos. Aquí se introduce
     * la violación a propósito y se exige que se detecte.
     */
    const sonda = join(clon, 'apps', 'web', 'src', 'componentes', 'sonda-csp.tsx');
    mkdirSync(join(clon, 'apps', 'web', 'src', 'componentes'), { recursive: true });
    const base = enClon('node', ['scripts/lib/frontera-csp.mjs']).salida;
    writeFileSync(sonda, 'export const S = () => <div style={{ height: `50%` }} />;\n');
    const r = enClon('node', ['scripts/lib/frontera-csp.mjs']);
    if (r.codigo !== 0 && /sonda-csp/.test(r.salida)) {
      ok('detectado el atributo `style`, con salida distinta de cero');
    } else {
      mal(`NO detectado (codigo ${r.codigo})`);
    }
    rmSync(sonda, { force: true });
    enClon('node', ['scripts/lib/frontera-csp.mjs']).salida === base
      ? ok('el banco de pruebas vuelve a su línea base')
      : mal('la sonda dejó rastro en el banco');
  }

  console.log('\n▸ 4b-bis · un color literal se escapa del sistema de temas (bloque 6)');
  {
    /**
     * El fallo que este control impide es el de siempre en modo oscuro: un
     * `bg-white` que en claro se ve perfecto —el fondo de tarjeta ES blanco— y
     * en oscuro queda con la etiqueta clara encima. Había catorce en los
     * formularios de la consola y ninguna prueba los veía, porque en claro no
     * fallan.
     */
    const sonda = join(clon, 'apps', 'web', 'src', 'componentes', 'sonda-tema.tsx');
    const base = enClon('node', ['scripts/lib/frontera-tema.mjs']).salida;

    for (const [clase, etiqueta] of [
      ['bg-white', 'blanco literal'],
      ['dark:bg-gray-900', 'variante `dark:` suelta'],
      ['bg-[#101010]', 'hexadecimal en la clase'],
    ]) {
      writeFileSync(sonda, `export const S = () => <div className="${clase}" />;\n`);
      const r = enClon('node', ['scripts/lib/frontera-tema.mjs']);
      r.codigo !== 0 && /sonda-tema/.test(r.salida)
        ? ok(`detectado: ${etiqueta}`)
        : mal(`${etiqueta} NO detectado (codigo ${r.codigo})`);
    }

    rmSync(sonda, { force: true });
    enClon('node', ['scripts/lib/frontera-tema.mjs']).salida === base
      ? ok('el banco de pruebas vuelve a su línea base')
      : mal('la sonda dejó rastro en el banco');
  }

  console.log('\n▸ 4b-ter · el tipo de copropiedad entrando en el dominio se detecta');
  {
    /**
     * Este control sostiene una RESPUESTA, no una convención: «el tipo de
     * copropiedad se puede cambiar después y las viviendas ya creadas no se
     * enteran» es cierto solo mientras nada del dominio ramifique por él. Sin
     * el control, la afirmación envejece en silencio y se descubre el día que
     * un conjunto cambie el tipo en producción.
     */
    const sonda = join(clon, 'packages', 'domain-core', 'src', 'reglas', 'sonda-vocabulario.ts');
    const base = enClon('node', ['scripts/lib/frontera-vocabulario.mjs']).salida;

    for (const [linea, etiqueta] of [
      ['export type T = TipoDeCopropiedad;', 'el tipo de copropiedad'],
      ['export const e = (c: { etiquetaVivienda: string }) => c.etiquetaVivienda;', 'la etiqueta'],
    ]) {
      writeFileSync(sonda, `${linea}\n`);
      const r = enClon('node', ['scripts/lib/frontera-vocabulario.mjs']);
      r.codigo !== 0 && /sonda-vocabulario/.test(r.salida)
        ? ok(`detectado: ${etiqueta}`)
        : mal(`${etiqueta} NO detectado (codigo ${r.codigo})`);
    }

    // Y el comentario que EXPLICA por qué no está no puede dar rojo: si lo
    // diera, el control obligaría a no documentarse a sí mismo.
    writeFileSync(sonda, '// aquí no vive el TipoDeCopropiedad, y por eso se explica\n');
    enClon('node', ['scripts/lib/frontera-vocabulario.mjs']).codigo === 0
      ? ok('un comentario que lo nombra NO da falso positivo')
      : mal('el control rechaza un comentario explicativo');

    rmSync(sonda, { force: true });
    enClon('node', ['scripts/lib/frontera-vocabulario.mjs']).salida === base
      ? ok('el banco de pruebas vuelve a su línea base')
      : mal('la sonda dejó rastro en el banco');
  }

  console.log('\n▸ 4c · volver a `tsc -p` deja que un `dist/` VIEJO compile una app (D-65)');
  {
    /**
     * El defecto que reportó el usuario: `pnpm --filter @ncr/api build` daba
     * `TS2339: Property 'rehidratar' does not exist` sobre un método que SÍ
     * existía en el dominio y SÍ se exportaba —los dos llegaron en el mismo
     * commit—. La API compila contra el `dist/` de `@ncr/domain-core`, y con
     * `tsc -p` ese `dist/` puede ser de cualquier etapa anterior.
     *
     * **Por qué esta sonda comprueba configuración y no compila.** El banco es
     * una copia de los ficheros versionados **sin `node_modules`**: aquí no hay
     * `tsc` que ejecutar. La comprobación de extremo a extremo es el paso 3 del
     * verificador, que construye cada aplicación por separado partiendo de cero
     * `dist/`. Esto guarda la invariante que lo hace posible, y es lo que falla
     * si alguien vuelve a `tsc -p` o quita una referencia.
     */
    const tsconfigApi = join(clon, 'apps', 'api', 'tsconfig.json');
    const pkgApi = join(clon, 'apps', 'api', 'package.json');
    const tsconfigOriginal = readFileSync(tsconfigApi, 'utf8');
    const pkgOriginal = readFileSync(pkgApi, 'utf8');

    const base = enClon('node', ['scripts/lib/frontera-construccion.mjs']);
    if (base.codigo !== 0) {
      mal('el banco no parte de una línea base limpia');
    } else {
      ok('la configuración versionada pasa el control');

      // Violación 1: el script vuelve a `tsc -p`.
      writeFileSync(pkgApi, pkgOriginal.replace('tsc -b tsconfig.json', 'tsc -p tsconfig.json'));
      const conTscP = enClon('node', ['scripts/lib/frontera-construccion.mjs']);
      conTscP.codigo !== 0 && /tsc -p/.test(conTscP.salida)
        ? ok('`tsc -p` se detecta y nombra el script')
        : mal(`\`tsc -p\` NO detectado (codigo ${conTscP.codigo})`);
      writeFileSync(pkgApi, pkgOriginal);

      // Violación 2: desaparece la referencia al dominio.
      const sinReferencia = JSON.parse(tsconfigOriginal);
      sinReferencia.references = (sinReferencia.references ?? []).filter(
        (r) => !r.path.includes('domain-core'),
      );
      writeFileSync(tsconfigApi, JSON.stringify(sinReferencia, null, 2));
      const sinRef = enClon('node', ['scripts/lib/frontera-construccion.mjs']);
      sinRef.codigo !== 0 && /domain-core/.test(sinRef.salida)
        ? ok('una referencia que falta se detecta y se nombra')
        : mal(`la referencia ausente NO se detecta (codigo ${sinRef.codigo})`);
      writeFileSync(tsconfigApi, tsconfigOriginal);

      /**
       * Y un paquete SIN `tsconfig.json` se salta, no revienta.
       *
       * Esta sonda la pidió el trinquete de ramas en la ETAPA 12: hasta
       * entonces `apps/edge` era un esqueleto sin `tsconfig`, así que esa rama
       * se ejercitaba **por accidente**. Al construirse el Edge de verdad dejó
       * de tocarla nadie, y el trinquete lo cantó. Es justo para lo que está:
       * una rama que se cubría sola deja de cubrirse y el número lo dice.
       *
       * El caso no es hipotético: un paquete que no compila con TypeScript
       * —una app de Flutter, un guion suelto— no tiene `tsconfig.json`, y el
       * control tiene que pasar de largo en vez de fallar por su ausencia.
       */
      const sinTs = join(clon, 'packages', 'paquete-sin-tsconfig');
      mkdirSync(sinTs, { recursive: true });
      writeFileSync(
        join(sinTs, 'package.json'),
        JSON.stringify({ name: '@ncr/paquete-sin-tsconfig', version: '0.0.0' }, null, 2),
      );
      const sinTsconfig = enClon('node', ['scripts/lib/frontera-construccion.mjs']);
      sinTsconfig.codigo === 0
        ? ok('un paquete sin tsconfig.json se salta, no rompe el control')
        : mal(`un paquete sin tsconfig rompe el control (codigo ${sinTsconfig.codigo})`);
      rmSync(sinTs, { recursive: true, force: true });

      enClon('node', ['scripts/lib/frontera-construccion.mjs']).codigo === 0
        ? ok('el banco de pruebas vuelve a su línea base')
        : mal('la sonda dejó rastro en el banco');
    }
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
    /**
     * Se exige el MOTIVO, no solo el código de salida. Era la sonda más débil
     * de las diez (revisión del 2026-09-09): comprobaba únicamente
     * `codigo !== 0`, así que cualquier fallo ajeno —un `.nvmrc` que no
     * llegara al clon, un error al arrancar— la habría dado por buena. Habría
     * informado «detectado» sin que el control hubiera detectado nada.
     */
    r.codigo !== 0 && /99\.0\.0|engines|node/i.test(r.salida)
      ? ok('detectado, y por el motivo correcto')
      : mal(`NO detectado (codigo ${r.codigo}): ${r.salida.trim().slice(0, 120)}`);

    // Mitad positiva: con el `engines` original, el mismo clon pasa. Sin esto,
    // un control que fallara siempre seguiría figurando como verde.
    writeFileSync(join(clon, 'package.json'), readFileSync(join(raiz, 'package.json'), 'utf8'));
    enClon('node', ['scripts/lib/verificar-entorno.mjs']).codigo === 0
      ? ok('con el `engines` real, el mismo entorno pasa')
      : mal('el control rechaza un entorno que sí cumple');
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
  console.log('\n▸ 9 · una respuesta sin tipo en el contrato rompe la verificación');
  {
    // El defecto que motivó el control: `@ApiOkResponse` ausente deja la
    // respuesta sin esquema y el cliente generado la recibe como `unknown`.
    // Aquí se reproduce sobre una COPIA del contrato, sin tocar el árbol.
    const contrato = JSON.parse(readFileSync(join(raiz, CONTRATO), 'utf8'));
    const [primera] = Object.keys(contrato.paths);
    const operacion = Object.values(contrato.paths[primera])[0];
    for (const codigo of Object.keys(operacion.responses)) {
      if (codigo.startsWith('2')) operacion.responses[codigo] = { description: 'sin esquema' };
    }
    const mutado = join(banco, 'contrato-sin-tipo.json');
    writeFileSync(mutado, JSON.stringify(contrato));
    const r = correr('node', ['scripts/lib/contrato-tipado.mjs', mutado]);
    r.codigo !== 0 && /sin respuesta tipada/.test(r.salida)
      ? ok('detectada, con salida distinta de cero')
      : mal(`NO detectada (codigo ${r.codigo})`);

    // Y el contrato real SÍ se acepta: un control que rechazara también lo
    // correcto obligaría a desactivarlo.
    correr('node', ['scripts/lib/contrato-tipado.mjs', join(raiz, CONTRATO)]).codigo === 0
      ? ok('el contrato versionado pasa el control')
      : mal('el control rechaza el contrato versionado');
  }

  console.log('\n▸ 10 · un cliente generado que se quedó atrás rompe la verificación');
  {
    /**
     * LA SONDA MONTA SU PROPIO ESCENARIO, incluido el artefacto compilado.
     *
     * Defecto reportado desde el CI el 2026-09-09, y es la undécima aparición
     * de la familia «la comprobación existe pero no comprueba lo que crees»:
     * `contrato-desfasado.mjs` necesita `apps/api/dist/openapi.js` para
     * regenerar el contrato desde los controladores, y ese fichero está en
     * `.gitignore`. En el equipo de desarrollo existía porque
     * `verificar-etapa.sh` compila en el paso 3, mucho antes de llegar a estas
     * sondas en el paso 9. En el CI, en cambio, «Pruebas negativas» corre
     * ANTES de «Compilación, lint y tipos», así que sobre un checkout limpio
     * no había nada que ejecutar.
     *
     * El fallo fue RUIDOSO —«el espejo no reproduce el estado al día»— porque
     * la sonda comprueba su línea base antes de mutar nada. Sin esa
     * comprobación previa habría dado verde sin ejercitar el control, que es
     * lo que hay que evitar. Aun así, un control que solo funciona cuando
     * alguien compiló antes no es un control: aquí se compila si hace falta.
     *
     * `--filter "@ncr/api..."` arrastra las dependencias del paquete, así que
     * `@ncr/domain-core` y `@ncr/providers` entran solos.
     */
    const artefacto = join(raiz, 'apps', 'api', 'dist', 'openapi.js');
    if (!existsSync(artefacto)) {
      console.log('   · sin apps/api/dist: se compila para poder montar el escenario');
      const compilacion = correr('pnpm', ['--filter', '@ncr/api...', 'build'], {
        timeout: 600_000,
      });
      if (compilacion.codigo !== 0 || !existsSync(artefacto)) {
        mal('no se pudo compilar la API: la sonda no puede montar su escenario');
        console.log(compilacion.salida.split('\n').slice(-6).join('\n'));
      }
    }

    // Espejo del repositorio hecho con ENLACES a lo pesado —`node_modules` y
    // `apps/`, que incluye el `dist` recién asegurado— y copia de los dos
    // ficheros generados. Así la sonda puede mutarlos sin acercarse al árbol
    // de trabajo y sin volver a compilar.
    const espejo = join(banco, 'espejo');
    mkdirSync(join(espejo, 'packages', 'contracts', 'src', 'generado'), { recursive: true });
    symlinkSync(join(raiz, 'node_modules'), join(espejo, 'node_modules'), 'dir');
    symlinkSync(join(raiz, 'apps'), join(espejo, 'apps'), 'dir');
    symlinkSync(
      join(raiz, 'packages', 'contracts', 'node_modules'),
      join(espejo, 'packages', 'contracts', 'node_modules'),
      'dir',
    );
    cpSync(
      join(raiz, 'packages', 'contracts', 'package.json'),
      join(espejo, 'packages', 'contracts', 'package.json'),
    );
    cpSync(join(raiz, CONTRATO), join(espejo, CONTRATO));
    cpSync(join(raiz, CLIENTE), join(espejo, CLIENTE));
    cpSync(join(raiz, 'scripts'), join(espejo, 'scripts'), { recursive: true });

    const enEspejo = () => correr('node', ['scripts/lib/contrato-desfasado.mjs'], { cwd: espejo });
    if (enEspejo().codigo !== 0) {
      mal('el espejo no reproduce el estado al día: la sonda no puede concluir nada');
    } else {
      ok('el espejo parte de un estado al día');
      writeFileSync(
        join(espejo, CLIENTE),
        `${readFileSync(join(espejo, CLIENTE), 'utf8')}\n// editado a mano\n`,
      );
      const r = enEspejo();
      r.codigo !== 0 && /no coincide con el contrato/.test(r.salida)
        ? ok('un cliente editado a mano se detecta')
        : mal(`un cliente editado a mano NO se detecta (codigo ${r.codigo})`);

      cpSync(join(raiz, CLIENTE), join(espejo, CLIENTE));
      const contrato = JSON.parse(readFileSync(join(espejo, CONTRATO), 'utf8'));
      delete contrato.paths[Object.keys(contrato.paths).at(-1)];
      writeFileSync(join(espejo, CONTRATO), JSON.stringify(contrato, null, 2));
      const r2 = enEspejo();
      r2.codigo !== 0 && /desfasado respecto de los controladores/.test(r2.salida)
        ? ok('un contrato que perdió una ruta se detecta')
        : mal(`un contrato desfasado NO se detecta (codigo ${r2.codigo})`);
    }
  }

  console.log('\n▸ 11 · el último tramo del arranque en frío: «alguien puede entrar»');
  {
    /**
     * QUÉ CONTROLA ESTA SONDA. `supabase/arranque-en-frio.sh` comprueba que la
     * base produce claims; `apps/api/test/arranque-en-frio.e2e.test.ts`
     * comprueba lo siguiente —que con esos claims la API **abre**—, que es el
     * criterio que faltaba: «tiene un rol» no es «puede entrar».
     *
     * La sonda NO necesita PostgreSQL, y es deliberado: lo que se pone a prueba
     * es la suite, no la base. Se le dan claims sintéticos bien formados (debe
     * pasar), claims con el rol cambiado (debe romperse) y ningún fichero (debe
     * OMITIRSE, y la omisión debe ser visible para el guardián del paso 12b de
     * `verificar-etapa.sh`).
     *
     * El tercer caso es el importante: una suite que se omite en silencio es
     * verde sin haber ejercitado nada, que es justo el modo de fallo de §2.8.0.
     */
    const apiDir = join(raiz, 'apps', 'api');
    // `node_modules/.bin/vitest` es un envoltorio de shell, no JavaScript:
    // pasárselo a `node` da un SyntaxError. Se resuelve el punto de entrada
    // real del paquete, igual que hace `contrato-desfasado.mjs` con
    // `openapi-typescript` por exactamente el mismo motivo.
    const vitest = join(
      dirname(createRequire(join(apiDir, 'package.json')).resolve('vitest/package.json')),
      'vitest.mjs',
    );
    const suite = 'test/arranque-en-frio.e2e.test.ts';
    const correrSuite = (fichero) =>
      correr('node', [vitest, 'run', suite], {
        cwd: apiDir,
        timeout: 300_000,
        env: { ...process.env, NCR_CLAIMS_ARRANQUE: fichero, CI: '1' },
      });

    const legitimo = join(banco, 'claims-arranque.json');
    const claimsBase = {
      aud: 'authenticated',
      rol: 'superadministrador',
      usuario_id: 'f1e541fc-0000-4000-8000-0000000000f1',
      copropiedad_id: null,
    };
    writeFileSync(legitimo, JSON.stringify(claimsBase));

    const base = correrSuite(legitimo);
    if (base.codigo === 0 && /5 passed/.test(base.salida) && !/skipped/.test(base.salida)) {
      ok('con claims bien formados, la suite corre entera y la API abre');
    } else {
      mal(`la suite no parte de un estado sano (codigo ${base.codigo})`);
      console.log(base.salida.split('\n').slice(-8).join('\n'));
    }

    const mutado = join(banco, 'claims-mutados.json');
    writeFileSync(mutado, JSON.stringify({ ...claimsBase, rol: 'residente' }));
    correrSuite(mutado).codigo !== 0
      ? ok('unos claims con el rol equivocado rompen la suite')
      : mal('la suite acepta claims con el rol equivocado: no comprueba lo que dice');

    const ausente = join(banco, 'claims-que-no-existen.json');
    const sinFichero = correrSuite(ausente);
    /skipped/.test(sinFichero.salida)
      ? ok('sin claims la suite se OMITE, y la omisión queda escrita en la salida')
      : mal('sin claims la suite no declara su omisión: sería un verde vacío');
    // El guardián del paso 12b es literalmente este `grep`: se ejercita aquí
    // para que no dependa de que alguien lea la salida.
    /skipped/.test(sinFichero.salida) && !/skipped/.test(base.salida)
      ? ok('el guardián distingue la corrida real de la omitida')
      : mal('el guardián no distingue una omisión de una corrida real');
  }

  console.log('\n▸ 12 · un paso declarado que NO se ejecuta se detecta');
  {
    /**
     * El defecto de la sexta ronda: «12c · el camino del NAVEGADOR» estaba
     * dentro del bloque que exige base de datos, así que sin ella no se
     * ejecutaba ni se omitía — no salía. Ningún rojo: una salida más corta.
     * Lo cazó el usuario leyendo la salida; esto lo caza el guion.
     */
    const declarados = readFileSync(join(raiz, 'scripts', 'verificar-etapa.sh'), 'utf8')
      .split('\n')
      .map((linea) => /^\s*paso "([^"]+)"/.exec(linea))
      .filter((m) => m !== null)
      .map((m) => m[1]);
    const sinBase = declarados.filter((e) => !/\(requiere --con-base\)/.test(e));

    const completo = join(banco, 'pasos-completos.txt');
    writeFileSync(completo, `${sinBase.join('\n')}\n`);
    const r0 = correr('node', ['scripts/lib/pasos-ejecutados.mjs', completo]);
    r0.codigo === 0
      ? ok('una corrida que ejecuta todos los pasos pasa el control')
      : mal(`el control no acepta el caso legítimo (codigo ${r0.codigo}): ${r0.salida}`);

    const objetivo = sinBase.find((e) => e.startsWith('12c')) ?? sinBase[sinBase.length - 1];
    const mutilado = join(banco, 'pasos-sin-12c.txt');
    writeFileSync(mutilado, `${sinBase.filter((e) => e !== objetivo).join('\n')}\n`);
    const r1 = correr('node', ['scripts/lib/pasos-ejecutados.mjs', mutilado]);
    r1.codigo !== 0 && r1.salida.includes(objetivo)
      ? ok('un paso que no llegó a ejecutarse se nombra y rompe la verificación')
      : mal(`un paso ausente pasa inadvertido (codigo ${r1.codigo})`);

    // Y la exención tiene que ser real, no una coartada: los pasos con base
    // NO pueden exigirse en una corrida sin ella.
    const conBase = declarados.filter((e) => /\(requiere --con-base\)/.test(e));
    const r2 = correr('node', ['scripts/lib/pasos-ejecutados.mjs', completo, '--con-base']);
    conBase.length > 0 && r2.codigo !== 0
      ? ok('con --con-base sí se exigen los pasos que necesitan base')
      : mal('la exención de --con-base no distingue las dos corridas');
  }

  console.log('\n▸ 13 · sin Chromium, el camino del navegador NO pasa por verde');
  {
    /**
     * «Sin Chromium no se omite en silencio» era una afirmación mía, y era
     * falsa: el guardián miraba `/opt/pw-browsers`, una ruta de Linux, con el
     * entorno de desarrollo objetivo en macOS. Aquí se ejerce de verdad.
     */
    const r = correr('node', ['e2e/camino-de-acceso.mjs'], {
      timeout: 120_000,
      env: { ...process.env, NCR_CHROMIUM: join(banco, 'chromium-que-no-existe') },
    });
    r.codigo !== 0 && /no hay Chromium/.test(r.salida)
      ? ok('la ausencia de navegador es un fallo explícito, no un salto')
      : mal(`sin navegador el camino no falla como debe (codigo ${r.codigo})`);
  }

  console.log('\n▸ 14 · una cabecera congelada en ESTADO_ETAPAS.md se detecta');
  {
    /**
     * El control nació de un defecto REPETIDO: la cabecera del documento se
     * quedó atrás dos veces, la segunda pese a existir ya la regla del DoD que
     * obliga a actualizarla. Aquí se introducen las tres formas en que el
     * documento puede contradecirse y se exige que las tres den rojo.
     */
    const original = join(banco, 'estado-original.md');
    const doc = readFileSync(join(raiz, 'docs/ESTADO_ETAPAS.md'), 'utf8');
    writeFileSync(original, doc);
    correr('node', ['scripts/lib/coherencia-estado-etapas.mjs', original]).codigo === 0
      ? ok('la línea base del banco está limpia')
      : mal('el banco NO parte de una línea base limpia: ESTADO_ETAPAS.md ya se contradice');

    // (a) el mapa dice una cosa y la ficha otra.
    const desfasado = join(banco, 'estado-mapa-contra-ficha.md');
    const cerradaEnMapa = /^\|\s*\*{0,2}(\d{2})\*{0,2}\s.*\*\*CERRADA\*\*.*$/m.exec(doc);
    if (cerradaEnMapa === null) {
      mal('no hay ninguna fila CERRADA en el mapa con la que ejercer el control');
    } else {
      writeFileSync(
        desfasado,
        doc.replace(cerradaEnMapa[0], cerradaEnMapa[0].replace('**CERRADA**', 'PENDIENTE   ')),
      );
      const r = correr('node', ['scripts/lib/coherencia-estado-etapas.mjs', desfasado]);
      r.codigo !== 0 && /su ficha dice/.test(r.salida)
        ? ok('mapa y ficha en desacuerdo: detectado')
        : mal(`el desacuerdo entre mapa y ficha NO se detecta (codigo ${r.codigo})`);
    }

    // (b) un estado inventado, fuera del vocabulario que el propio documento
    //     declara. Es literalmente `CONSTRUIDA`, el que se colo el 2026-09-13.
    const inventado = join(banco, 'estado-vocabulario.md');
    writeFileSync(
      inventado,
      doc.replace(/^(## ETAPA \d{2} —[^\n]*?)\*\*CERRADA\*\*/m, '$1**CONSTRUIDA**'),
    );
    const rb = correr('node', ['scripts/lib/coherencia-estado-etapas.mjs', inventado]);
    rb.codigo !== 0 && /CONSTRUIDA/.test(rb.salida)
      ? ok('un estado fuera del vocabulario: detectado')
      : mal(`un estado inventado NO se detecta (codigo ${rb.codigo})`);

    // (c) el recuento de la cabecera, descuadrado en uno.
    const recuento = join(banco, 'estado-recuento.md');
    const fila = /\*\*Etapas cerradas\*\*[^\n]*?\*\*(\d+) de (\d+)\*\*/.exec(doc);
    if (fila === null) {
      mal('la cabecera no lleva el recuento «**N de M**» con el que ejercer el control');
    } else {
      writeFileSync(
        recuento,
        doc.replace(
          fila[0],
          fila[0].replace(
            `**${fila[1]} de ${fila[2]}**`,
            `**${Number(fila[1]) + 1} de ${fila[2]}**`,
          ),
        ),
      );
      const rc = correr('node', ['scripts/lib/coherencia-estado-etapas.mjs', recuento]);
      rc.codigo !== 0 && /etapas cerradas y el mapa marca/.test(rc.salida)
        ? ok('el recuento descuadrado: detectado')
        : mal(`un recuento descuadrado NO se detecta (codigo ${rc.codigo})`);
    }

    /**
     * (d) UNA RAMA «EN CURSO» QUE YA ESTÁ FUSIONADA · añadido en la ETAPA 13.
     *
     * Caso real: al abrir la etapa, la cabecera seguía diciendo «en curso la
     * rama `correccion-macos`» y la ficha presentaba el PR #22 como abierto,
     * con la fusión hecha hacía horas. El control no lo veía porque solo
     * comparaba el documento CONSIGO MISMO. Ahora le pregunta a git.
     *
     * Se usa `develop` como rama de ejemplo: resuelve en cualquier clon del
     * repositorio y es ancestro de toda rama de etapa, que es exactamente la
     * condición que el control persigue.
     */
    const fusionada = join(banco, 'estado-rama-fusionada.md');
    writeFileSync(
      fusionada,
      doc.replace(
        /^(\*\*Última actualización:\*\*[^\n]*)$/m,
        '$1 · y en curso la rama `develop` (sonda)',
      ),
    );
    const rd = correr('node', ['scripts/lib/coherencia-estado-etapas.mjs', fusionada], {
      cwd: raiz,
    });
    rd.codigo !== 0 && /ya está FUSIONADA/.test(rd.salida)
      ? ok('una rama «en curso» que ya está fusionada: detectada contra git')
      : mal(`una rama fusionada descrita como «en curso» NO se detecta (codigo ${rd.codigo})`);

    // Y una rama que NO existe no puede dar un falso positivo: no se comprueba,
    // y el recuento del veredicto lo dice en lugar de callarlo.
    const inexistente = join(banco, 'estado-rama-inexistente.md');
    writeFileSync(
      inexistente,
      doc.replace(
        /^(\*\*Última actualización:\*\*[^\n]*)$/m,
        '$1 · y en curso la rama `rama-que-no-existe-jamas`',
      ),
    );
    const re = correr('node', ['scripts/lib/coherencia-estado-etapas.mjs', inexistente], {
      cwd: raiz,
    });
    re.codigo === 0 && /0 de 1 rama\(s\)/.test(re.salida)
      ? ok('una rama que git no resuelve no se da por buena en silencio: sale en el recuento')
      : mal(`una rama no resoluble se cuenta mal o rompe (codigo ${re.codigo})`);
  }

  console.log('\n▸ 15 · `echo | grep -q` bajo pipefail se detecta (D-80)');
  {
    /**
     * El defecto más caro de la ETAPA 11-A, y estaba en el verificador: con
     * `set -o pipefail`, `echo "$x" | grep -q` devuelve 141 cuando ENCUENTRA lo
     * que busca. La comprobación de «pruebas en rojo» se leía como falsa justo
     * al acertar, y el paso informaba «suite completa en verde». El mismo
     * patrón estaba en la comprobación de SECRETOS de `verificar-frontera.sh`.
     */
    writeFileSync(
      join(clon, 'sonda-pipefail.sh'),
      '#!/usr/bin/env bash\nset -uo pipefail\nsalida=$(cat /etc/hostname)\n' +
        'if echo "$salida" | grep -q x; then echo si; fi\n',
    );
    enClon('git', ['add', '--intent-to-add', 'sonda-pipefail.sh']);
    const r = enClon('node', ['scripts/lib/portabilidad.mjs']);
    r.codigo !== 0 && /141/.test(r.salida)
      ? ok('detectado, con la explicación del 141')
      : mal(`NO detectado (codigo ${r.codigo})`);
    rmSync(join(clon, 'sonda-pipefail.sh'), { force: true });
    enClon('git', ['rm', '--cached', '--quiet', '--force', 'sonda-pipefail.sh']);
    enClon('node', ['scripts/lib/portabilidad.mjs']).codigo === 0
      ? ok('el banco de pruebas queda limpio')
      : mal('la sonda dejó rastro en el banco');
  }

  console.log('\n▸ 16 · un control SIN prueba negativa se detecta al cablearlo (D-81)');
  {
    /**
     * EL CONTROL GENÉRICO DE LA FAMILIA. Veinte defectos de este proyecto son
     * el mismo: el control existe y no comprueba lo que uno cree. Todos
     * comparten que NADIE los había visto fallar. Hasta ahora esta lista de
     * casos se mantenía a mano, así que un control nuevo podía entrar en el
     * verificador sin que nadie comprobara que sabe decir «✗» — que es
     * exactamente como nació D-81.
     *
     * Aquí se comprueba el control que compara los dos conjuntos: lo que el
     * verificador EJECUTA contra lo que esta suite EJERCITA.
     */
    const verificador = join(clon, 'scripts', 'verificar-etapa.sh');
    const original = readFileSync(verificador, 'utf8');

    enClon('node', ['scripts/lib/controles-sin-prueba-negativa.mjs']).codigo === 0
      ? ok('el banco parte en verde')
      : mal('el banco NO parte en verde');

    // Un control nuevo, cableado al verificador, que nadie ha visto fallar.
    writeFileSync(verificador, original + '\nnode scripts/lib/sonda-sin-prueba-negativa.mjs\n');
    const r = enClon('node', ['scripts/lib/controles-sin-prueba-negativa.mjs']);
    r.codigo !== 0 && /NADIE lo ha visto fallar/.test(r.salida)
      ? ok('un control nuevo sin prueba negativa: detectado al cablearlo')
      : mal(`un control sin prueba negativa pasa inadvertido (codigo ${r.codigo})`);

    // Y la otra mitad del trinquete: una exención que ya no corresponde. Sin
    // esto, la lista de deuda protegería para siempre a un control que ya tiene
    // prueba —o que ya nadie ejecuta— y volvería a ser una lista a mano.
    // Se usa un control que SIGA en la lista DEUDA: si se apunta a uno que ya
    // salió de ella, quitarlo del verificador no crea ningún zombi y la sonda
    // pasa a probar nada. Ocurrió al liquidar cinco deudas en la ETAPA 13.
    writeFileSync(
      verificador,
      original.replace('node scripts/lib/cliente-dart-desfasado.mjs', 'true'),
    );
    const rz = enClon('node', ['scripts/lib/controles-sin-prueba-negativa.mjs']);
    rz.codigo !== 0 && /ya no le corresponde/.test(rz.salida)
      ? ok('una exención zombi también rompe: la lista solo puede encoger')
      : mal(`una exención zombi sobrevive (codigo ${rz.codigo})`);

    writeFileSync(verificador, original);
    enClon('node', ['scripts/lib/controles-sin-prueba-negativa.mjs']).codigo === 0
      ? ok('el banco de pruebas queda limpio')
      : mal('la sonda dejó rastro en el banco');
  }

  console.log('\n▸ 17 · una declaración de «no ejercido» que sobrevive a su revisión se detecta');
  {
    /**
     * Declarar un paso no ejercido es legítimo; que la declaración sobreviva a
     * la etapa en que dijo revisarse, no. Sin esto, «revisión en la ETAPA 14»
     * sería una frase, y el paso quedaría desactivado para siempre con buenos
     * modales.
     */
    const estado = join(clon, 'docs', 'ESTADO_ETAPAS.md');
    const original = readFileSync(estado, 'utf8');

    enClon('node', ['scripts/lib/controles-declarados.mjs', '--auditar']).codigo === 0
      ? ok('con la etapa de revisión abierta, la declaración vale')
      : mal('una declaración en regla se rechaza');

    writeFileSync(
      estado,
      `${original}\n## ETAPA 14 — Observabilidad, CI/CD, PWA y escritorio · **CERRADA** · sonda\n`,
    );
    const r = enClon('node', ['scripts/lib/controles-declarados.mjs', '--auditar']);
    r.codigo !== 0 && /ya está CERRADA/.test(r.salida)
      ? ok('cerrada la etapa de revisión, la declaración CADUCA y rompe la verificación')
      : mal(`una declaración caducada sobrevive (codigo ${r.codigo})`);

    writeFileSync(estado, original);
    enClon('node', ['scripts/lib/controles-declarados.mjs', '--auditar']).codigo === 0
      ? ok('el banco de pruebas queda limpio')
      : mal('la sonda dejó rastro en el banco');
  }

  console.log('\n▸ 18 · una rama de control que nadie ejecuta se detecta (D-81, granularidad)');
  {
    /**
     * El trinquete de ramas, probado con cobertura FABRICADA en lugar de con una
     * corrida real: lo que se comprueba aquí es la decisión —«este número no
     * puede subir»—, no la medición de V8, que es de Node y ya está probada.
     */
    const dir = join(banco, 'cobertura-sonda');
    mkdirSync(dir, { recursive: true });
    const base = join(clon, 'scripts', 'lib', 'ramas-de-los-controles.json');
    const original = readFileSync(base, 'utf8');
    const volcado = (ceros) => {
      writeFileSync(
        join(dir, 'coverage-sonda.json'),
        JSON.stringify({
          result: [
            {
              url: `file://${join(clon, 'scripts', 'lib', 'contar-pruebas.mjs')}`,
              functions: [
                {
                  ranges: Array.from({ length: ceros }, (_, i) => ({
                    startOffset: i * 10,
                    endOffset: i * 10 + 5,
                    count: 0,
                  })),
                },
              ],
            },
          ],
        }),
      );
    };
    const conCobertura = () =>
      correr('node', ['scripts/lib/ramas-de-los-controles.mjs'], {
        cwd: clon,
        env: { ...process.env, NCR_COBERTURA_CONTROLES: dir },
      });

    writeFileSync(base, JSON.stringify({ 'scripts/lib/contar-pruebas.mjs': 7 }, null, 2));

    volcado(7);
    conCobertura().codigo === 0
      ? ok('con los mismos bloques sin ejercer, pasa')
      : mal('un número que no sube se rechaza');

    volcado(3);
    conCobertura().codigo === 0
      ? ok('bajarlo es libre: ejercitar más nunca rompe')
      : mal('bajar el número rompe, y no debería');

    volcado(8);
    const r = conCobertura();
    r.codigo !== 0 && /NADIE ejecuta/.test(r.salida)
      ? ok('una rama nueva que nadie ejercita: detectada')
      : mal(`una rama sin ejercitar pasa inadvertida (codigo ${r.codigo})`);

    // Y la otra mitad: una cifra en la base para un fichero que ya no se mide
    // protege a algo que nadie vigila. También rompe.
    volcado(7);
    writeFileSync(
      base,
      JSON.stringify(
        { 'scripts/lib/contar-pruebas.mjs': 7, 'scripts/lib/fantasma.mjs': 3 },
        null,
        2,
      ),
    );
    const rf = conCobertura();
    rf.codigo !== 0 && /ya no se mide/.test(rf.salida)
      ? ok('una entrada de la base que ya nadie mide: detectada')
      : mal(`una entrada fantasma sobrevive (codigo ${rf.codigo})`);

    /**
     * Y las dos ramas de higiene del propio control, que también son suyas: un
     * volcado a medias —de un proceso que murió— no es una rama sin ejercer, y
     * la suite negativa no se mide a sí misma (si se midiera, escribir una
     * prueba negativa rompería el trinquete que pide pruebas negativas).
     */
    volcado(7);
    writeFileSync(join(dir, 'coverage-roto.json'), '{"result": [');
    writeFileSync(
      join(dir, 'coverage-harness.json'),
      JSON.stringify({
        result: [
          {
            url: `file://${join(clon, 'scripts', 'lib', 'pruebas-negativas.mjs')}`,
            functions: [{ ranges: [{ startOffset: 0, endOffset: 5, count: 0 }] }],
          },
        ],
      }),
    );
    writeFileSync(base, JSON.stringify({ 'scripts/lib/contar-pruebas.mjs': 7 }, null, 2));
    const rh = conCobertura();
    rh.codigo === 0 && !/pruebas-negativas/.test(rh.salida)
      ? ok('un volcado roto se ignora y la suite no se mide a sí misma')
      : mal(`higiene del trinquete rota (codigo ${rh.codigo}): ${rh.salida.trim().slice(0, 120)}`);

    /**
     * Y las dos ramas de la exención por entorno (D-96). Un fichero declarado
     * sensible al host no se exige numéricamente —su cifra depende de si hay
     * Flutter, de si hay `xcrun`, de qué sondas corrieron—, pero la lista es un
     * trinquete por sí misma: una exención que protege a un fichero que ya no
     * existe es una desactivación en silencio.
     */
    volcado(9); // más que la base: si se exigiera, esto rompería
    writeFileSync(
      join(dir, 'coverage-sensible.json'),
      JSON.stringify({
        result: [
          {
            url: `file://${join(clon, 'scripts', 'lib', 'verificar-entorno.mjs')}`,
            functions: [
              {
                ranges: Array.from({ length: 99 }, (_, i) => ({
                  startOffset: i * 10,
                  endOffset: i * 10 + 5,
                  count: 0,
                })),
              },
            ],
          },
        ],
      }),
    );
    writeFileSync(base, JSON.stringify({ 'scripts/lib/contar-pruebas.mjs': 9 }, null, 2));
    const rs = conCobertura();
    rs.codigo === 0 && !/verificar-entorno/.test(rs.salida)
      ? ok('un control sensible al entorno no rompe por su cifra')
      : mal(`la exención por entorno no se aplica (codigo ${rs.codigo})`);

    // Y el otro lado de la lista: la exención sigue escrita y el fichero que
    // protegía ya no está. Eso es una desactivación en silencio, y rompe.
    const sensible = join(clon, 'scripts', 'lib', 'verificar-entorno.mjs');
    const guardado = readFileSync(sensible, 'utf8');
    rmSync(sensible, { force: true });
    const re = conCobertura();
    re.codigo !== 0 && /ya no existe/.test(re.salida)
      ? ok('una exención que protege a un fichero inexistente: detectada')
      : mal(`una exención huérfana sobrevive (codigo ${re.codigo})`);
    writeFileSync(sensible, guardado);

    // Y que `--actualizar` NO guarde la cifra del sensible: guardar un número
    // que no se exige invita a leerlo como si se exigiera.
    correr('node', ['scripts/lib/ramas-de-los-controles.mjs', '--actualizar'], {
      cwd: clon,
      env: { ...process.env, NCR_COBERTURA_CONTROLES: dir },
    });
    !/verificar-entorno/.test(readFileSync(base, 'utf8'))
      ? ok('`--actualizar` no escribe la cifra de un control sensible al entorno')
      : mal('la base guarda una cifra que no se exige');

    rmSync(join(dir, 'coverage-sensible.json'), { force: true });
    writeFileSync(base, original);
    rmSync(dir, { recursive: true, force: true });
  }

  console.log('\n▸ 19 · faltar Flutter NO es lo mismo que tenerlo mal (rojo del CI)');
  {
    /**
     * La comprobación de Flutter del paso 1 trató «no hay SDK» como si fuera un
     * desajuste de versión, y el trabajo `controles` del CI —que no compila la
     * app ni tiene el SDK— murió en su primer paso. Aquí se fija la distinción:
     * sin `flutter` en el PATH, aviso; con `NCR_FLUTTER` apuntando a algo que no
     * funciona, fallo, porque se pidió ese binario adrede.
     */
    const sinFlutter = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => k !== 'NCR_FLUTTER'),
    );
    sinFlutter.PATH = (process.env.PATH ?? '')
      .split(':')
      .filter((d) => d !== '' && !existsSync(join(d, 'flutter')))
      .join(':');

    const sin = correr('node', ['scripts/lib/verificar-entorno.mjs'], {
      cwd: clon,
      env: sinFlutter,
    });
    sin.codigo === 0 && /no hay `flutter` en el PATH/.test(sin.salida)
      ? ok('sin SDK: aviso y sigue, como necesita el CI')
      : mal(
          `sin SDK NO avisa o no sigue (codigo ${sin.codigo}): ${sin.salida.trim().slice(0, 120)}`,
        );

    const mal_apuntado = correr('node', ['scripts/lib/verificar-entorno.mjs'], {
      cwd: clon,
      env: { ...sinFlutter, NCR_FLUTTER: '/no/existe/flutter' },
    });
    mal_apuntado.codigo !== 0 && /NCR_FLUTTER apunta/.test(mal_apuntado.salida)
      ? ok('NCR_FLUTTER a un binario que no está: fallo, no aviso')
      : mal(`un NCR_FLUTTER roto pasa inadvertido (codigo ${mal_apuntado.codigo})`);
  }

  console.log('\n▸ 20 · un `.env.example` que no dice la verdad se detecta (D-90)');
  {
    /**
     * Las dos direcciones, que son dos defectos distintos: una variable que el
     * código lee y el ejemplo no declara deja a quien despliega sin saber que
     * existe; una que el ejemplo declara y nadie lee hace creer que se
     * configuró algo. La segunda es la que dejó el rate limiting en sus valores
     * por omisión durante semanas.
     */
    const ejemplo = join(clon, 'apps', 'api', '.env.example');
    const original = readFileSync(ejemplo, 'utf8');

    enClon('node', ['scripts/lib/entorno-declarado.mjs']).codigo === 0
      ? ok('el banco parte en verde')
      : mal('el ejemplo real no cuadra con el esquema');

    // (a) el `=` que falta: la línea sigue ahí y el comparador deja de verla.
    writeFileSync(ejemplo, original.replace('CORS_ALLOWED_ORIGINS=', 'CORS_ALLOWED_ORIGINS'));
    const rA = enClon('node', ['scripts/lib/entorno-declarado.mjs']);
    rA.codigo !== 0 && /CORS_ALLOWED_ORIGINS/.test(rA.salida)
      ? ok('una declaración sin `=` se detecta, no se disculpa')
      : mal(`una declaracion sin igual pasa inadvertida (codigo ${rA.codigo})`);

    // (b) un nombre que nadie lee.
    writeFileSync(ejemplo, `${original}\nVARIABLE_QUE_NADIE_LEE=1\n`);
    const rB = enClon('node', ['scripts/lib/entorno-declarado.mjs']);
    rB.codigo !== 0 && /NADIE la lee/.test(rB.salida)
      ? ok('una variable declarada que nadie lee: detectada')
      : mal(`una variable inventada pasa inadvertida (codigo ${rB.codigo})`);

    writeFileSync(ejemplo, original);
    enClon('node', ['scripts/lib/entorno-declarado.mjs']).codigo === 0
      ? ok('el banco de pruebas queda limpio')
      : mal('la sonda dejó rastro en el banco');
  }

  console.log('\n▸ 21 · dos DTO con el mismo nombre se detectan (D-92)');
  {
    /**
     * En OpenAPI el nombre de la clase es el nombre del esquema. La segunda
     * pisa a la primera y el cliente generado describe la forma equivocada sin
     * dar ningún error: lo encontró el compilador de Dart, no un control.
     */
    const sonda = join(clon, 'apps', 'api', 'src', 'sonda-dto.ts');

    // Sin el control en el banco, las tres sondas de abajo dirían cualquier
    // cosa: Node devuelve 1 por módulo inexistente y 1 es justo lo que la
    // sonda espera de una violación. Se comprueba antes, y el motivo que se
    // informa es el verdadero.
    if (exigeControl('scripts/lib/esquemas-unicos.mjs')) {
      enClon('node', ['scripts/lib/esquemas-unicos.mjs']).codigo === 0
        ? ok('el banco parte sin nombres repetidos')
        : mal('el repositorio real tiene nombres de esquema repetidos');

      writeFileSync(sonda, 'export class MiZonaDto {\n  otraCosa!: string;\n}\n');
      const r = enClon('node', ['scripts/lib/esquemas-unicos.mjs']);
      r.codigo !== 0 && /MiZonaDto/.test(r.salida)
        ? ok('un nombre de esquema repetido: detectado, con los dos ficheros')
        : mal(`un DTO homónimo pasa inadvertido (codigo ${r.codigo})`);

      rmSync(sonda, { force: true });
      enClon('node', ['scripts/lib/esquemas-unicos.mjs']).codigo === 0
        ? ok('el banco de pruebas queda limpio')
        : mal('la sonda dejó rastro en el banco');
    }
  }

  console.log('\n▸ 22 · una prueba ROJA se NOMBRA, y no se disfraza de otra cosa (D-100)');
  {
    /**
     * ════════════════════════════════════════════════════════════════════════
     * EL DEFECTO QUE ESTA SONDA CIERRA
     *
     * El CI de `ubuntu-latest` tumbó la ETAPA 12 con «la corrida NO terminó» y
     * un recuento de bytes. El informe JSON tenía delante el nombre de la
     * prueba roja y este guion no lo imprimía: encontrar cuál era costó abrir
     * el registro del trabajo a mano. Peor, el mensaje mandaba a buscar una
     * cobertura baja que no existía.
     *
     * Aquí se mete una prueba que falla A PROPÓSITO y se exige que la salida
     * del control **diga su nombre**. Un control que nadie ha visto fallar no
     * está demostrado (§2.8.0), y este llevaba desde la ETAPA 09 sin que nadie
     * viera qué imprime cuando de verdad hay una roja.
     *
     * Se restringe a `@ncr/config` con `NCR_PAQUETES_METRICAS`: dos segundos en
     * vez de varios minutos, por el mismo camino —vitest real, informe JSON
     * real— y sin añadir el peso de los seis paquetes al banco.
     *
     * ════════════════════════════════════════════════════════════════════════
     * ÚNICA SONDA QUE CORRE EN EL ÁRBOL REAL, Y POR QUÉ NO PUEDE SER DE OTRO MODO
     *
     * El banco es un clon SIN `node_modules`: copia los ficheros versionados y
     * `node_modules` no lo está. Ahí `pnpm exec vitest` no encuentra vitest y
     * todo sale como «corrida interrumpida» — justo el caso contrario al que
     * esta sonda tiene que provocar. Y ejecutar una suite de verdad es el punto:
     * lo que se demuestra es que el informe JSON REAL se convierte en un mensaje
     * con el nombre dentro.
     *
     * Por eso escribe un fichero en el árbol real y lo borra en `finally`. Es
     * una ruta NO versionada, así que `git status` vuelve a ser idéntico, y la
     * comprobación final del banco —que le pregunta a git, no a una copia en
     * memoria— lo verifica al terminar.
     * ════════════════════════════════════════════════════════════════════════
     */
    const sonda = join(raiz, 'packages', 'config', 'src', 'sonda-roja.test.ts');
    const conConfig = (extra = {}) =>
      correr('node', ['scripts/lib/metricas.mjs'], {
        cwd: raiz,
        env: { ...process.env, NCR_PAQUETES_METRICAS: '@ncr/config', ...extra },
      });

    /**
     * La línea base no se mide por el código de salida: una corrida
     * restringida sale 1 igualmente porque no puede medir las capas que no
     * corrió, y eso es correcto. Lo que hay que fijar antes de sondear es que
     * **no hay ninguna suite en rojo**, que es lo que la sonda va a provocar.
     */
    try {
      const base = conConfig();
      !/SUITE EN ROJO/.test(base.salida)
        ? ok('el banco parte sin ninguna suite en rojo')
        : mal('la línea base ya tiene pruebas rojas: la sonda no demostraría nada');

      writeFileSync(
        sonda,
        "import { describe, expect, it } from 'vitest';\n" +
          "describe('sonda de D-100', () => {\n" +
          "  it('esta prueba falla a proposito y su nombre tiene que aparecer', () => {\n" +
          '    expect(1).toBe(2);\n' +
          '  });\n' +
          // Y una SALTADA, para que el recuento de saltadas que D-112 añadió a
          // `metricas.mjs` se ejercite de verdad: sin ella esa rama no la
          // ejecutaba nadie, y el trinquete de D-81 lo cantó.
          "  it.skip('esta se salta a proposito y tiene que contarse como saltada', () => {\n" +
          '    expect(1).toBe(1);\n' +
          '  });\n' +
          '});\n',
      );
      const conRoja = conConfig();

      conRoja.codigo !== 0
        ? ok('una suite en rojo hace fallar la medición')
        : mal('una prueba roja pasa inadvertida: el paquete se mediría igual');

      // LO QUE IMPORTA: el nombre, no el recuento.
      /esta prueba falla a proposito y su nombre tiene que aparecer/.test(conRoja.salida)
        ? ok('el NOMBRE de la prueba roja aparece en la salida')
        : mal('la prueba roja NO se nombra: el mensaje vuelve a mandar a buscar a ciegas');

      /sonda-roja\.test\.ts/.test(conRoja.salida)
        ? ok('y también su fichero')
        : mal('no se dice en qué fichero está');

      // Y que NO se disfrace de corrida interrumpida, que es el otro remedio.
      /SUITE EN ROJO/.test(conRoja.salida) && !/CORRIDA INTERRUMPIDA/.test(conRoja.salida)
        ? ok('se clasifica como SUITE EN ROJO, no como corrida interrumpida')
        : mal('una suite en rojo se informa como corrida interrumpida: remedio equivocado');

      /saltadas=1\b/.test(conRoja.salida)
        ? ok('la prueba SALTADA se cuenta y se publica para que otro la compare (D-112)')
        : mal('una saltada no aparece en el recuento legible por máquina');

      // El eco de pnpm no es el nombre de ninguna prueba.
      !/ERR_PNPM_/.test(conRoja.salida)
        ? ok('la línea de pnpm no se cuela como si fuera una pista')
        : mal('ERR_PNPM_* sigue apareciendo entre las pistas');

      /**
       * D-102 · y NADA de la salida es un objeto sin serializar. El bloque
       * «QUEDARON FUERA de la medición» interpolaba el fallo entero y escribía
       * `[object Object]` — con el detalle correcto impreso diez líneas más
       * arriba—. La sonda ya provocaba ese caso y no lo miraba: comprobaba lo
       * que se había arreglado, no lo que el control imprime. Esta aserción es
       * genérica a propósito: cubre ese sitio y cualquier otro que nazca igual.
       */
      !/\[object Object\]/.test(conRoja.salida)
        ? ok('ningún objeto llega a la salida sin serializar')
        : mal('la salida contiene [object Object]: un mensaje que no dice nada (D-102)');

      // Y el segundo mensaje nombra la MISMA clase que el primero. Decir «la
      // corrida no terminó» de una suite en rojo manda al remedio contrario.
      !/(?:sin resumen de cobertura|QUEDARON FUERA)[\s\S]{0,200}?la corrida no terminó/i.test(
        conRoja.salida,
      )
        ? ok('el resumen final no llama «corrida no terminada» a una suite en rojo')
        : mal('el resumen final contradice la clasificación de D-100');

      rmSync(sonda, { force: true });
      !/SUITE EN ROJO/.test(conConfig().salida)
        ? ok('el árbol real queda sin la sonda')
        : mal('la sonda dejó rastro en el árbol real');
    } finally {
      // Si cualquier aserción de arriba lanzara, el fichero NO se queda.
      rmSync(sonda, { force: true });
    }
  }

  console.log('\n▸ 23 · un número de `wc` comparado como TEXTO se detecta (D-103)');
  {
    /**
     * ════════════════════════════════════════════════════════════════════════
     * EL DEFECTO QUE ESTA SONDA CIERRA
     *
     * `30_concurrencia_placas.sh` capturaba `exitosos=$(… | wc -l)` en una
     * línea y comparaba `[[ "$exitosos" != "1" ]]` en otra. En BSD `wc`
     * almohadilla —«       1»— y en GNU no, así que en macOS el paso 12 fallaba
     * **con el KPI-03 cumplido delante**: una sola inserción aceptada, cero
     * duplicados, y el guion informando incumplimiento.
     *
     * Ninguna regla de LÍNEA podía verlo: las dos líneas son portables por
     * separado; lo que no lo es, es la pareja. Por eso la regla nueva mira el
     * fichero entero, y por eso esta sonda comprueba las tres respuestas:
     * que detecta el defecto, que NO se queja de la comparación numérica, y
     * que NO se queja de la captura ya normalizada. Un control que solo se ve
     * decir «✗» tampoco está demostrado: hay que verlo callar cuando toca.
     * ════════════════════════════════════════════════════════════════════════
     */
    const escribirSonda = (cuerpo) => {
      writeFileSync(join(clon, 'sonda-wc.sh'), `#!/usr/bin/env bash\nset -euo pipefail\n${cuerpo}`);
      enClon('git', ['add', '--intent-to-add', 'sonda-wc.sh']);
      return enClon('node', ['scripts/lib/portabilidad.mjs']);
    };
    const limpiar = () => {
      rmSync(join(clon, 'sonda-wc.sh'), { force: true });
      enClon('git', ['rm', '--cached', '--quiet', '--force', 'sonda-wc.sh']);
    };

    try {
      const roto = escribirSonda('n=$(ls | wc -l)\nif [[ "$n" != "1" ]]; then echo distinto; fi\n');
      roto.codigo !== 0 && /wc/.test(roto.salida)
        ? ok('detectado, con salida distinta de cero')
        : mal(`NO detectado: el defecto que rompió el paso 12 en macOS (codigo ${roto.codigo})`);

      // Que NOMBRE las dos líneas: sin eso hay que buscar la captura a mano, y
      // es justo lo que hizo caro encontrarlo la primera vez.
      /viene de la línea 3/.test(roto.salida)
        ? ok('y dice en qué línea se capturó el número, no solo dónde se compara')
        : mal('no enlaza la comparación con la captura: obliga a buscarla a mano');
      limpiar();

      const numerico = escribirSonda(
        'n=$(ls | wc -l)\nif [[ "$n" -ne 1 ]]; then echo distinto; fi\n',
      );
      numerico.codigo === 0
        ? ok('la comparación NUMÉRICA no se marca: no hay falso positivo')
        : mal('marca `-ne`, que es exactamente el remedio que el control pide');
      limpiar();

      const normalizado = escribirSonda(
        'n=$(ls | wc -l | tr -d "[:space:]")\nif [[ "$n" != "1" ]]; then echo distinto; fi\n',
      );
      normalizado.codigo === 0
        ? ok('una captura ya normalizada tampoco se marca')
        : mal('marca una captura limpia: el control obligaría a cambios inútiles');
      limpiar();

      /**
       * Los otros dos productores que el usuario pidió revisar, y que fallan
       * por motivos DISTINTOS al de `wc`. No basta con que la regla exista:
       * hay que haberlos visto detectar, porque cada uno tiene su regex y una
       * regex que no se ejercita es una rama que nadie ha visto correr (D-81).
       */
      const conPsql = escribirSonda(
        'n=$(psql -t -c "select count(*) from t")\nif [[ "$n" != "1" ]]; then echo d; fi\n',
      );
      conPsql.codigo !== 0 && /psql/.test(conPsql.salida)
        ? ok('`psql -t` sin `-A` también se detecta: alinea la columna con espacios')
        : mal('`psql -t` sin `-A` pasa: devuelve el valor almohadillado y nadie lo ve');
      limpiar();

      // Y con `-A` NO se marca: `-Atq` es la forma correcta y el repositorio la
      // usa en todas partes. Marcarla sería inutilizable.
      const psqlCorrecto = escribirSonda(
        'n=$(psql -Atq -c "select count(*) from t")\nif [[ "$n" != "1" ]]; then echo d; fi\n',
      );
      psqlCorrecto.codigo === 0
        ? ok('y `psql -Atq`, que es la forma correcta, no se marca')
        : mal('marca `psql -Atq`: la forma que el repositorio usa en todas partes');
      limpiar();

      const conGrepC = escribirSonda(
        'n=$(grep -c foo a.txt b.txt)\nif [[ "$n" != "1" ]]; then echo d; fi\n',
      );
      conGrepC.codigo !== 0 && /grep -c/.test(conGrepC.salida)
        ? ok('`grep -c` también: antepone «fichero:» cuando recibe varios')
        : mal('`grep -c` pasa: con varios ficheros el valor no es un número');
      limpiar();

      // La forma de UNA línea, sin variable de por medio, que es la otra manera
      // de escribir el mismo defecto.
      const enUnaLinea = escribirSonda('if [[ "$(ls | wc -l)" == "1" ]]; then echo d; fi\n');
      enUnaLinea.codigo !== 0
        ? ok('la captura y la comparación en la MISMA línea también se detectan')
        : mal('escrito en una sola línea, el mismo defecto pasa inadvertido');
      limpiar();

      enClon('node', ['scripts/lib/portabilidad.mjs']).codigo === 0
        ? ok('el banco de pruebas queda limpio')
        : mal('la sonda dejó rastro en el banco');
    } finally {
      limpiar();
    }
  }

  console.log('\n▸ 24 · los colores de Vitest no pueden partir un recuento (D-108)');
  {
    /**
     * ════════════════════════════════════════════════════════════════════════
     * EL DEFECTO QUE ESTA SONDA CIERRA, Y POR QUÉ ES EL TERCERO IGUAL
     *
     * Vitest escribe «Tests  648 passed» con códigos de color EN MEDIO:
     * `Tests \e[22m \e[1m\e[32m648 passed`. Ninguna expresión regular del tipo
     * `Tests +[0-9]` casa con eso.
     *
     * Ya había ocurrido una vez, en `estabilidad.mjs`, y su cabecera lo cuenta.
     * Se arregló allí. El paso 5 de `verificar-etapa.sh` conservó el defecto
     * intacto hasta la primera corrida del verificador en macOS, donde la
     * suite informó 648 verdes de 658 y el paso dijo «la suite no informó ni
     * una prueba».
     *
     * Lo que se exige aquí no es solo que limpie: es que **el recuento
     * sobreviva entero**, porque un filtro demasiado ávido que se comiera el
     * número sería el mismo fallo con otra cara.
     * ════════════════════════════════════════════════════════════════════════
     */
    const conColores =
      'Tests \u001B[22m \u001B[1m\u001B[32m648 passed\u001B[39m\u001B[2m | \u001B[22m10 skipped\n' +
      '\u001B[2K\u001B[1GTest Files \u001B[1m54 passed\u001B[22m\n';

    const r = correr('node', ['scripts/lib/sin-colores.mjs'], { cwd: raiz, input: conColores });

    /Tests {2}648 passed/.test(r.salida)
      ? ok('«Tests  648 passed» vuelve a ser una sola cadena que se puede contar')
      : mal('el recuento sigue partido: el paso 5 no podría contarlo');

    /Test Files 54 passed/.test(r.salida)
      ? ok('y también sobrevive a los borrados de línea que emite turbo')
      : mal('un movimiento de cursor sigue partiendo la línea');

    // eslint-disable-next-line no-control-regex
    !/\u001B\[/.test(r.salida)
      ? ok('no queda ni un escape en la salida')
      : mal('quedan escapes ANSI sin limpiar');

    // Y que NO se coma texto legítimo: un filtro demasiado ávido es el mismo
    // defecto con otra cara.
    const limpio = correr('node', ['scripts/lib/sin-colores.mjs'], {
      cwd: raiz,
      input: 'Tests  12 passed [corchetes] 3;4 m\n',
    });
    /Tests {2}12 passed \[corchetes\] 3;4 m/.test(limpio.salida)
      ? ok('un texto sin escapes pasa intacto, corchetes y puntos y coma incluidos')
      : mal('se come texto legítimo: el recuento podría desaparecer por el otro lado');
  }

  console.log('\n▸ 25 · dos recuentos de la MISMA suite que discrepan se detectan (D-112)');
  {
    /**
     * ════════════════════════════════════════════════════════════════════════
     * EL DEFECTO QUE ESTA SONDA CIERRA
     *
     * El verificador ejecuta la suite dos veces: el paso 5 por turbo y el paso
     * 7 por vitest directo. La corrida del usuario con la base ya correcta dejó
     * a la vista que los dos daban verde DISCREPANDO: turbo informaba
     * «@ncr/api: 653 passed | 5 skipped» y vitest ejecutaba las 658. Las cinco
     * eran las de `residente-pg.test.ts`, y bajo turbo no llegaban a correr
     * porque `turbo.json` no declaraba `DATABASE_URL_PRUEBAS` —Turborepo 2.x
     * filtra el entorno— así que `it.runIf(...)` las saltaba en silencio.
     *
     * Las dos cifras estaban. Faltaba quien las comparase.
     *
     * Se exige que detecte la divergencia REAL, que NOMBRE la prueba saltada
     * —si no, hay que reproducirla para saber cuál fue—, que NO se queje cuando
     * coinciden, y que trate como fallo el quedarse sin nada que comparar por
     * cualquiera de los dos lados. Esto último no es teórico: la primera
     * versión de `estabilidad.mjs` daba «idéntico» comparando dos firmas
     * vacías.
     * ════════════════════════════════════════════════════════════════════════
     */
    const arbol = join(banco, 'arbol-d112');
    const dirApi = join(arbol, 'apps', 'api');
    mkdirSync(dirApi, { recursive: true });
    writeFileSync(join(dirApi, 'package.json'), JSON.stringify({ name: '@ncr/api' }));
    const p7 = join(banco, 'paso7.txt');
    const informe = join(dirApi, '.informe-paso5.json');

    const comparar = () =>
      correr('node', ['scripts/lib/recuentos-coherentes.mjs', arbol, p7], { cwd: raiz });

    /** Un informe de vitest con el reparto que se le pida. */
    const informeCon = (verdes, saltadas) => ({
      numTotalTests: verdes + saltadas,
      numPassedTests: verdes,
      numFailedTests: 0,
      numPendingTests: saltadas,
      numTodoTests: 0,
      testResults: [
        {
          name: '/x/apps/api/test/residente-pg.test.ts',
          assertionResults: [
            // Los tres estados que vitest usa para «no se ejecutó». Que sean
            // tres y no uno importa: `todo` y `skipped` conviven con `pending`
            // en el mismo informe, y una rama que solo mira uno deja pasar los
            // otros dos.
            ...Array.from({ length: saltadas }, (_, i) => ({
              status: ['pending', 'skipped', 'todo'][i % 3],
              fullName: `la consulta del titular encaja con el esquema ${i + 1}`,
            })),
          ],
        },
      ],
    });
    const RECUENTO_658 =
      '   RECUENTO @ncr/api ficheros=56 pruebas=658 verdes=658 rojas=0 saltadas=0\n';

    writeFileSync(informe, JSON.stringify(informeCon(658, 0)));
    writeFileSync(p7, RECUENTO_658);
    comparar().codigo === 0
      ? ok('cuando los dos caminos coinciden, no se queja')
      : mal('marca una coincidencia: el control sería inutilizable');

    writeFileSync(informe, JSON.stringify(informeCon(653, 5)));
    const r = comparar();
    r.codigo !== 0
      ? ok('la divergencia real de D-112 se detecta')
      : mal('«653 passed | 5 skipped» frente a 658 ejecutadas pasa por buena');
    /saltadas/.test(r.salida) && /653/.test(r.salida) && /658/.test(r.salida)
      ? ok('y salen los DOS recuentos y el campo que difiere, no solo el aviso')
      : mal('no enseña las dos cifras: obliga a buscarlas a mano');
    /la consulta del titular encaja con el esquema 1/.test(r.salida)
      ? ok('y NOMBRA la prueba que se quedó fuera, con su fichero')
      : mal('no dice qué prueba se saltó: habría que reproducirlo para saberlo');

    // Un paquete que el paso 7 mide y del que el paso 5 no dejó informe. Hace
    // falta OTRO paquete con informe: si no queda ninguno, lo que salta es la
    // comprobación de «no hay nada que comparar», que es un caso distinto.
    const dirWeb = join(arbol, 'apps', 'web');
    mkdirSync(dirWeb, { recursive: true });
    writeFileSync(join(dirWeb, 'package.json'), JSON.stringify({ name: '@ncr/web' }));
    writeFileSync(join(dirWeb, '.informe-paso5.json'), JSON.stringify(informeCon(350, 0)));
    writeFileSync(
      p7,
      RECUENTO_658 + '   RECUENTO @ncr/web ficheros=30 pruebas=350 verdes=350 rojas=0 saltadas=0\n',
    );
    rmSync(informe, { force: true });
    /el paso 5 no dejó informe de este paquete/.test(comparar().salida)
      ? ok('un paquete del que un camino no informa se detecta, no se ignora')
      : mal('un paquete ausente en un lado pasa inadvertido');
    rmSync(dirWeb, { recursive: true, force: true });

    // Y un paquete bajo `packages/`, no solo bajo `apps/`: el control recorre
    // los dos grupos y hasta aquí solo se había visto recorrer uno.
    const dirCfg = join(arbol, 'packages', 'config');
    mkdirSync(dirCfg, { recursive: true });
    writeFileSync(join(dirCfg, 'package.json'), JSON.stringify({ name: '@ncr/config' }));
    writeFileSync(join(dirCfg, '.informe-paso5.json'), JSON.stringify(informeCon(144, 0)));
    writeFileSync(informe, JSON.stringify(informeCon(658, 0)));
    writeFileSync(
      p7,
      RECUENTO_658 +
        '   RECUENTO @ncr/config ficheros=2 pruebas=144 verdes=144 rojas=0 saltadas=0\n',
    );
    comparar().codigo === 0
      ? ok('también mira `packages/`, no solo `apps/`')
      : mal('un paquete de packages/ no se compara: media medición');
    rmSync(join(arbol, 'packages'), { recursive: true, force: true });

    // Y las dos formas de quedarse sin nada que comparar.
    writeFileSync(p7, 'sin una sola linea RECUENTO\n');
    writeFileSync(informe, JSON.stringify(informeCon(658, 0)));
    comparar().codigo !== 0
      ? ok('una salida del paso 7 sin líneas RECUENTO es un FALLO, no un empate')
      : mal('sin recuentos del paso 7 daría por bueno cualquier cosa');

    writeFileSync(p7, RECUENTO_658);
    rmSync(join(arbol, 'apps'), { recursive: true, force: true });
    comparar().codigo !== 0
      ? ok('y no encontrar ningún informe del paso 5, igual')
      : mal('sin informes del paso 5 daría por bueno cualquier cosa');

    // Un informe ilegible se dice; no se confunde con «cero divergencias».
    mkdirSync(dirApi, { recursive: true });
    writeFileSync(join(dirApi, 'package.json'), JSON.stringify({ name: '@ncr/api' }));
    writeFileSync(informe, '{esto no es json');
    const roto = comparar();
    roto.codigo !== 0 && /no se pudo leer/.test(roto.salida)
      ? ok('un informe ilegible se dice, no se confunde con un empate')
      : mal('un informe corrupto pasa como si no hubiera divergencias');

    correr('node', ['scripts/lib/recuentos-coherentes.mjs'], { cwd: raiz }).codigo !== 0
      ? ok('invocarlo sin argumentos no devuelve verde')
      : mal('sin argumentos da 0: un control que no mira nada y aprueba');

    /**
     * D-114 · y el modo que NOMBRA lo saltado. El paso 5 decía «5 saltadas» sin
     * decir cuáles, y averiguarlo costó tres corridas del runner — con el
     * nombre esperando dentro del informe JSON que ese mismo paso acababa de
     * escribir. Es D-100 otra vez, un paso más allá.
     */
    writeFileSync(informe, JSON.stringify(informeCon(653, 5)));
    const nombradas = correr(
      'node',
      ['scripts/lib/recuentos-coherentes.mjs', '--saltadas', arbol],
      { cwd: raiz },
    );
    /la consulta del titular encaja con el esquema 1/.test(nombradas.salida) &&
    /la consulta del titular encaja con el esquema 5/.test(nombradas.salida)
      ? ok('`--saltadas` nombra TODAS las que no se ejecutaron, no solo la primera')
      : mal('no nombra las saltadas: «5 saltadas» sin decir cuáles no sirve de nada');
    nombradas.codigo !== 0
      ? ok('y una saltada SIN declarar hace fallar el control')
      : mal('una saltada sin declarar pasa por buena: la regla no sirve de nada');

    /**
     * Y el otro lado, que es el que hace útil a la regla: una saltada
     * DECLARADA —las del arranque en frío, que el paso 12b ejecuta con los
     * claims que él mismo escribe— no puede romper el paso 5. Sin esta mitad,
     * la única salida sería relajar la regla para todas.
     */
    writeFileSync(
      informe,
      JSON.stringify({
        ...informeCon(653, 5),
        testResults: [
          {
            name: '/x/apps/api/test/arranque-en-frio.e2e.test.ts',
            assertionResults: Array.from({ length: 5 }, (_, i) => ({
              status: 'pending',
              fullName: `el superadministrador recien aprovisionado PUEDE entrar ${i + 1}`,
            })),
          },
        ],
      }),
    );
    const declaradas = correr(
      'node',
      ['scripts/lib/recuentos-coherentes.mjs', '--saltadas', arbol],
      { cwd: raiz },
    );
    declaradas.codigo === 0 && /DECLARADA/.test(declaradas.salida)
      ? ok('una saltada DECLARADA no rompe, y dice por qué lo está')
      : mal('una saltada declarada rompe igual: obligaría a relajar la regla entera');

    writeFileSync(informe, JSON.stringify(informeCon(658, 0)));
    /ninguna prueba saltada/.test(
      correr('node', ['scripts/lib/recuentos-coherentes.mjs', '--saltadas', arbol], { cwd: raiz })
        .salida,
    )
      ? ok('y lo dice con todas las letras cuando no hay ninguna')
      : mal('con cero saltadas calla: el silencio se lee como «no miré»');
  }

  console.log('\n▸ 26 · cinco controles salen de la deuda de prueba negativa (ETAPA 13)');
  {
    /**
     * ════════════════════════════════════════════════════════════════════════
     * LA DEUDA DECLARADA, PAGADA DONDE SE PUEDE PAGAR
     *
     * Siete controles entraron en `DEUDA` el 2026-09-19 con su motivo escrito.
     * La ETAPA 13 los revisa uno por uno, que es lo que una auditoría hace con
     * una deuda: no la hereda, la liquida o la justifica.
     *
     * Cinco son ganables sin SDK de Flutter porque aceptan la ruta que miran o
     * se dejan apuntar con `cwd`. Los otros dos —`cliente-dart-desfasado` y
     * `recorrido-web`— necesitan ejecutar Dart y un navegador contra la app
     * compilada; se quedan en la deuda con el motivo actualizado, que es la
     * otra mitad legítima de la regla.
     * ════════════════════════════════════════════════════════════════════════
     */
    const arbol13 = join(banco, 'deuda-13');

    // (a) flutter-sin-secretos · un secreto incrustado en un .dart.
    {
      const app = join(arbol13, 'app-con-secreto');
      mkdirSync(join(app, 'lib'), { recursive: true });
      writeFileSync(
        join(app, 'lib', 'config.dart'),
        "const llave = 'sb_secret_" + 'A1b2C3d4E5f6G7h8I9j0' + "';\n",
      );
      const r = correr('node', ['scripts/lib/flutter-sin-secretos.mjs', app], { cwd: raiz });
      r.codigo !== 0 && /config\.dart/.test(r.salida)
        ? ok('flutter-sin-secretos: una llave secreta en un .dart se detecta, con su fichero')
        : mal(`flutter-sin-secretos NO detecta una llave incrustada (codigo ${r.codigo})`);

      const limpia = join(arbol13, 'app-limpia');
      mkdirSync(join(limpia, 'lib'), { recursive: true });
      writeFileSync(join(limpia, 'lib', 'config.dart'), "const base = 'https://api.example';\n");
      correr('node', ['scripts/lib/flutter-sin-secretos.mjs', limpia], { cwd: raiz }).codigo === 0
        ? ok('y una app sin secretos no se marca')
        : mal('flutter-sin-secretos marca una app limpia: falso positivo');
    }

    // (b) cobertura-flutter · un lcov por debajo del umbral.
    {
      const bajo = join(arbol13, 'lcov-bajo.info');
      // Una capa de dominio con 10 líneas y 1 cubierta: 10 %, muy por debajo del 90 %.
      const lineas = Array.from({ length: 10 }, (_, i) => `DA:${i + 1},${i === 0 ? 1 : 0}`);
      writeFileSync(bajo, `SF:lib/dominio/regla.dart\n${lineas.join('\n')}\nend_of_record\n`);
      const r = correr('node', ['scripts/lib/cobertura-flutter.mjs', bajo], { cwd: raiz });
      r.codigo !== 0
        ? ok('cobertura-flutter: una capa por debajo del umbral se detecta')
        : mal(`cobertura-flutter da por buena una capa al 10 % (codigo ${r.codigo})`);

      const vacio = join(arbol13, 'lcov-vacio.info');
      writeFileSync(vacio, '');
      correr('node', ['scripts/lib/cobertura-flutter.mjs', vacio], { cwd: raiz }).codigo !== 0
        ? ok('y un lcov VACÍO no se lee como «todo cubierto»')
        : mal('un lcov vacío pasa por bueno: es el falso verde que el control persigue');
    }

    // (c) verificar-base-de-pruebas · un puerto muerto y una base sin esquema.
    {
      const muerto = correr('node', ['scripts/lib/verificar-base-de-pruebas.mjs'], {
        cwd: raiz,
        env: { ...process.env, DATABASE_URL_PRUEBAS: 'postgresql://nadie@127.0.0.1:1/ncr' },
      });
      muerto.codigo !== 0 && /no se pudo usar la base/.test(muerto.salida)
        ? ok('verificar-base-de-pruebas: un puerto muerto se detecta y se nombra')
        : mal(`un puerto muerto NO se detecta (codigo ${muerto.codigo})`);

      const sinVariable = correr('node', ['scripts/lib/verificar-base-de-pruebas.mjs'], {
        cwd: raiz,
        env: { ...process.env, DATABASE_URL_PRUEBAS: '' },
      });
      sinVariable.codigo !== 0 && /no está definida/.test(sinVariable.salida)
        ? ok('y la variable vacía tampoco pasa por buena')
        : mal('una DATABASE_URL_PRUEBAS vacía se lee como definida');
    }

    // (d) dependencias-acotadas · una acotación sin motivo escrito.
    {
      const app = join(arbol13, 'pub-a-ciegas', 'apps', 'mobile');
      mkdirSync(app, { recursive: true });
      writeFileSync(
        join(app, 'pubspec.yaml'),
        'name: ncr\ndependency_overrides:\n  objective_c: 9.4.0\n',
      );
      // La ruta del guion va ABSOLUTA: con `cwd` cambiado, la relativa no
      // resuelve y node sale 1 por MODULE_NOT_FOUND. La primera versión de esta
      // sonda leía ese 1 como «detectado» — pasaba por la razón equivocada, que
      // es exactamente la familia de defecto que esta suite existe para cerrar.
      const r = correr('node', [join(raiz, 'scripts/lib/dependencias-acotadas.mjs')], {
        cwd: join(arbol13, 'pub-a-ciegas'),
      });
      r.codigo !== 0 && /objective_c/.test(r.salida)
        ? ok('dependencias-acotadas: una acotación SIN motivo escrito se detecta')
        : mal(`una acotación a ciegas NO se detecta (codigo ${r.codigo})`);
    }

    // (e) verificar-escritura · una ruta que NO se puede usar.
    {
      /**
       * La sonda no usa permisos: esta suite corre como root en el contenedor y
       * root escribe donde quiera, así que un `chmod 500` no demuestra nada —la
       * primera versión de esta sonda lo intentó y pasaba por la razón
       * equivocada—. Se usa una condición que ningún privilegio salva: un
       * FICHERO donde el control espera un DIRECTORIO.
       */
      const app = join(arbol13, 'sin-permiso');
      mkdirSync(join(app, 'apps', 'mobile'), { recursive: true });
      writeFileSync(join(app, 'apps', 'mobile', 'pubspec.yaml'), 'name: ncr\n');
      writeFileSync(
        join(app, 'apps', 'mobile', '.dart_tool'),
        'esto es un fichero, no un directorio',
      );
      const r = correr('node', [join(raiz, 'scripts/lib/verificar-escritura.mjs')], { cwd: app });
      r.codigo !== 0 && /dart_tool/.test(r.salida)
        ? ok('verificar-escritura: una ruta inservible se detecta y se nombra')
        : mal(`una ruta inservible pasa por buena (codigo ${r.codigo})`);

      rmSync(join(app, 'apps', 'mobile', '.dart_tool'), { force: true });
      correr('node', [join(raiz, 'scripts/lib/verificar-escritura.mjs')], { cwd: app }).codigo === 0
        ? ok('y un árbol sano no se marca')
        : mal('verificar-escritura marca un árbol sano: falso positivo');
    }
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
console.log(
  '\nPRUEBAS NEGATIVAS: los 24 controles detectan su violación y aceptan el caso legítimo, ' +
    'sin tocar el árbol',
);
