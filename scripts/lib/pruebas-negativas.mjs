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
  readdirSync,
  cpSync,
  symlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { arbolDeSonda } from '../../e2e/arbol-de-sonda.mjs';
import { sinColores } from './sin-colores.mjs';
import { conLectorLento } from './lector-lento.mjs';
import { sondasDeEstabilidad } from './sondas/estabilidad.mjs';
import { sondasDeFicherosCaidos } from './sondas/ficheros-caidos.mjs';
import { sondaDeBaseCorta, sondaDeBaseRepuesta } from './sondas/base-corta.mjs';
import { sondasDeLectorLentoPorClase } from './sondas/lector-lento-por-clase.mjs';

/** 15-S5 · DT-15S2-11 · un representante por clase de guion con salida sin tope. */
const ESCRITORES_SIN_TOPE = {
  hallazgos: 'scripts/lib/inyeccion-explicita.mjs',
  resumen: 'scripts/lib/estabilidad.mjs',
};
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
    // 15-S2 · la señal dice si lo mató el plazo (SIGTERM de `timeout`): sin ella,
    // una salida cortada a medias parecía un control que no detecta nada.
    return {
      codigo: e.status ?? 1,
      senal: e.signal ?? null,
      salida: `${e.stdout ?? ''}${e.stderr ?? ''}`,
    };
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

    /**
     * ═══════════════════════════════════════════════════════════════════════
     * LOS RANGOS DE DOCUMENTACIÓN NO SON UNA PUERTA TRASERA (ETAPA 15-B, A.7)
     *
     * El control acepta `192.0.2.x`, `198.51.100.x` y `203.0.113.x` porque el
     * IETF los reserva para ejemplos (RFC 5737): no se enrutan y no pueden ser
     * de ningún equipo. La tentación peligrosa era la contraria —aceptar
     * `192.168.x.x` «porque es privada»—, y ésas SÍ son direcciones de equipos
     * de verdad: la cámara de este proyecto vivía en una.
     *
     * Las dos direcciones se comprueban juntas y a propósito: una sola de las
     * dos daría verde con el control roto en el otro sentido.
     * ═══════════════════════════════════════════════════════════════════════
     */
    writeFileSync(sonda, `export const ejemplo = 'http://203.0.113.10:80/';\n`);
    const doc = enClon('node', ['scripts/lib/frontera-hardware.mjs']);
    doc.codigo === 0
      ? ok('una IP de los rangos de documentación (RFC 5737) NO se marca')
      : mal(`un ejemplo con 203.0.113.10 se marca como IP de equipo (codigo ${doc.codigo})`);

    writeFileSync(sonda, `export const real = 'http://192.168.1.64:80/';\n`); // kpi-11-exento: sonda
    const privada = enClon('node', ['scripts/lib/frontera-hardware.mjs']);
    privada.codigo !== 0 && /sonda-hardware/.test(privada.salida)
      ? ok('y una IP privada SIGUE marcándose: es la de un equipo de verdad')
      : mal(`una IP privada pasó inadvertida (codigo ${privada.codigo})`);

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

  console.log('\n▸ 5 bis · una orden de psql en una migración se detecta al escribirla');
  {
    // El defecto real de la víspera de sitio (2026-10-06): `\set ON_ERROR_STOP on`
    // en la 0052 y la 0053. `psql -f` la entendía; `supabase db push`, no.
    // Las migraciones del clon son las reales, copiadas en el bloque 5.
    enClon('node', ['scripts/lib/migraciones-sin-psql.mjs']).codigo === 0
      ? ok('las migraciones reales pasan')
      : mal('las migraciones reales NO pasan: el banco no parte de una línea base limpia');

    // Lo que psql NO toma por orden suya: una `\` dentro de un comentario, una
    // cadena (también `E'…'` y `''`), un identificador entre comillas o un cuerpo
    // `$…$`. Las expresiones de los CHECK reales llevan `\x00`: no pueden caer.
    const legitima = join(clon, 'supabase', 'migrations', '29990103000000_9999_sonda_legitima.sql');
    writeFileSync(
      legitima,
      '-- \\set en un comentario de línea\n' +
        '/* \\set en un comentario de bloque */\n' +
        'CREATE TABLE sonda (c text CHECK (c !~ \'[\\x00-\\x1F]\'), "col\\umna" int);\n' +
        "SELECT 'it''s \\ literal', E'escapada \\' y \\\\', $$ cuerpo \\set $$, $f$ otro \\i $f$;\n" +
        'SELECT $1 FROM sonda; -- final sin salto de línea',
    );
    enClon('node', ['scripts/lib/migraciones-sin-psql.mjs']).codigo === 0
      ? ok('una `\\` en comentarios, cadenas, identificadores y cuerpos $…$ no cuenta')
      : mal('marca como orden de psql una `\\` que psql no ejecutaría');

    // Y lo que SÍ: al principio de la línea (el defecto real) y a mitad de ella,
    // detrás de SQL (la forma que el primer control dejaba pasar, Codex en #49).
    const sonda = join(clon, 'supabase', 'migrations', '29990104000000_9999_sonda_psql.sql');
    writeFileSync(
      sonda,
      "SELECT 1;\nSELECT 2; \\set ON_ERROR_STOP on\n\\gexec\nSELECT 'sin cerrar",
    );
    const r = enClon('node', ['scripts/lib/migraciones-sin-psql.mjs']);
    if (
      r.codigo !== 0 &&
      /9999_sonda_psql\.sql:2/.test(r.salida) &&
      /9999_sonda_psql\.sql:3/.test(r.salida) &&
      !/9999_sonda_legitima/.test(r.salida)
    ) {
      ok('detectada a mitad de línea y al principio, con su fichero y su línea');
    } else {
      mal(`NO detectada como debe (codigo ${r.codigo}): ${r.salida.slice(0, 300)}`);
    }
    rmSync(sonda);
    rmSync(legitima);
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
  // 15-S5 · las sondas de este control viven en `sondas/`: este fichero no puede crecer.
  sondasDeEstabilidad({ raiz, banco, correr, ok, mal, control: 'scripts/lib/estabilidad.mjs' });
  sondasDeFicherosCaidos({ raiz, banco, correr, ok, mal, control: 'scripts/lib/estabilidad.mjs' });
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
     * LA RAMA SE CREA EN EL BANCO, no se toma prestada del repositorio.
     *
     * La primera versión usaba `develop` «porque resuelve en cualquier clon», y
     * el CI demostró que no: `actions/checkout` deja como referencia LOCAL solo
     * la rama del evento, así que en el runner `develop` no existe y la sonda
     * caía en la rama de «no resuelta» —que, correctamente, no falla—. Verde en
     * local, rojo en CI, y por una diferencia de entorno que no tenía nada que
     * ver con lo que la sonda quiere demostrar.
     *
     * Aquí se crea `rama-sonda-fusionada` en el clon, apuntando a su propio
     * `HEAD`: un commit es ancestro de sí mismo, que es exactamente la
     * condición «ya fusionada» que el control persigue. Hermético, y da igual
     * qué referencias traiga la máquina.
     */
    enClon('git', ['branch', '-f', 'rama-sonda-fusionada', 'HEAD']);
    const fusionada = join(clon, 'estado-rama-fusionada.md');
    writeFileSync(
      fusionada,
      doc.replace(
        /^(\*\*Última actualización:\*\*[^\n]*)$/m,
        '$1 · y en curso la rama `rama-sonda-fusionada`',
      ),
    );
    const rd = correr('node', [join(raiz, 'scripts/lib/coherencia-estado-etapas.mjs'), fusionada], {
      cwd: clon,
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
      // La etapa de revisión la lee el control de `DECLARADOS`: si cambia allí,
      // cambia aquí. Hoy es la 16, porque la 14 acotó la declaración del paso 5e
      // a macOS en vez de dejarla valiendo en todas partes.
      `${original}\n## ETAPA 16 — Documentación técnica final · **CERRADA** · sonda\n`,
    );
    const r = enClon('node', ['scripts/lib/controles-declarados.mjs', '--auditar']);
    r.codigo !== 0 && /ya está CERRADA/.test(r.salida)
      ? ok('cerrada la etapa de revisión, la declaración CADUCA y rompe la verificación')
      : mal(`una declaración caducada sobrevive (codigo ${r.codigo})`);

    writeFileSync(estado, original);
    enClon('node', ['scripts/lib/controles-declarados.mjs', '--auditar']).codigo === 0
      ? ok('el banco de pruebas queda limpio')
      : mal('la sonda dejó rastro en el banco');

    /**
     * ═══════════════════════════════════════════════════════════════════════
     * LA DECLARACIÓN ACOTADA POR PLATAFORMA · ETAPA 14
     *
     * Acotar una declaración a `soloEn: ['darwin']` es lo que permite que el
     * paso SE EJERCITE donde puede ejercitarse. La rama que decide eso tiene
     * que verse fallar, o sería una exención silenciosa con otro nombre: una
     * lista mal escrita dejaría el paso declarado en TODAS partes sin que nada
     * lo dijera.
     */
    const declarados = join(clon, 'scripts/lib/controles-declarados.mjs');
    const fuente = readFileSync(declarados, 'utf8');

    // (a) FUERA de su plataforma, el paso NO está declarado: código 1, que es
    //     lo que hace al verificador tomar la rama que lo ejecuta de verdad.
    const otra = process.platform === 'darwin' ? 'linux' : 'darwin';
    writeFileSync(declarados, fuente.replace(/soloEn: \[[^\]]*\]/, `soloEn: ['${otra}']`));
    enClon('node', ['scripts/lib/controles-declarados.mjs', '5e']).codigo !== 0
      ? ok('fuera de su plataforma, el paso NO se da por declarado')
      : mal('un paso declarado para OTRA plataforma se exime igual aquí');

    // (b) DENTRO de su plataforma sí, y con su motivo impreso.
    writeFileSync(
      declarados,
      fuente.replace(/soloEn: \[[^\]]*\]/, `soloEn: ['${process.platform}']`),
    );
    const dentro = enClon('node', ['scripts/lib/controles-declarados.mjs', '5e']);
    dentro.codigo === 0 && /DECLARADO NO EJERCIDO/.test(dentro.salida)
      ? ok('y dentro de ella sí, imprimiendo su motivo')
      : mal(`la declaración no se aplica en su propia plataforma (codigo ${dentro.codigo})`);

    // (c-bis) SIN `soloEn` la declaración vale en TODAS partes, que es el
    //         comportamiento de siempre y tiene que seguir funcionando.
    writeFileSync(declarados, fuente.replace(/\s*soloEn: \[[^\]]*\],/, ''));
    const sinAcotar = enClon('node', ['scripts/lib/controles-declarados.mjs', '5e']);
    const auditada = enClon('node', ['scripts/lib/controles-declarados.mjs', '--auditar']);
    sinAcotar.codigo === 0 && auditada.codigo === 0
      ? ok('una declaración SIN acotar sigue valiendo en todas las plataformas')
      : mal(
          `quitar \`soloEn\` rompe la declaración (paso ${sinAcotar.codigo}, ` +
            `auditoría ${auditada.codigo})`,
        );

    // (c) UNA LISTA MAL ESCRITA se detecta en la auditoría.
    writeFileSync(declarados, fuente.replace(/soloEn: \[[^\]]*\]/, 'soloEn: []'));
    const vacia = enClon('node', ['scripts/lib/controles-declarados.mjs', '--auditar']);
    vacia.codigo !== 0 && /soloEn/.test(vacia.salida)
      ? ok('una lista de plataformas vacía se detecta')
      : mal(`\`soloEn: []\` pasa por buena (codigo ${vacia.codigo})`);

    writeFileSync(declarados, fuente);
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
    /**
     * 15-S2 · plazo propio de 300 s. Dos de cinco corridas del banco en la
     * 15-S2 —y una de la 15-K— dieron aquí «dijo: nada»: la salida traía la
     * lista de ficheros de `metricas.mjs` y nada más, que es lo que queda si el
     * plazo de 120 s de `correr` lo corta antes de los resultados. Aislada, la
     * medición tarda 3 s. Y si vuelve a fallar, `porque` dice cómo terminó.
     */
    const conConfig = (extra = {}) =>
      correr('node', ['scripts/lib/metricas.mjs'], {
        cwd: raiz,
        timeout: 300_000,
        env: { ...process.env, NCR_PAQUETES_METRICAS: '@ncr/config', ...extra },
      });
    const porque = (r) =>
      `código ${String(r.codigo)}${r.senal ? `, señal ${r.senal} (¿el plazo?)` : ''} · ` +
      r.salida.trim().split('\n').slice(-2).join(' | ').slice(0, 200);

    /**
     * La línea base no se mide por el código de salida: una corrida
     * restringida sale 1 igualmente porque no puede medir las capas que no
     * corrió, y eso es correcto. Lo que hay que fijar antes de sondear es que
     * **no hay ninguna suite en rojo**, que es lo que la sonda va a provocar.
     */
    try {
      const inicioBase = Date.now();
      const base = conConfig();
      const duracionBase = Date.now() - inicioBase;
      !/SUITE EN ROJO/.test(base.salida)
        ? ok('el banco parte sin ninguna suite en rojo')
        : mal('la línea base ya tiene pruebas rojas: la sonda no demostraría nada');

      /**
       * 15-S2 · H-15S2-09 · LA CAUSA DEL «dijo: nada». No era el plazo: la
       * salida de Node hacia un pipe es asíncrona, y el `process.exit(1)` del
       * final de `metricas.mjs` tiraba lo que quedaba en cola cuando el lector
       * se retrasaba. Aquí el lector se retrasa A PROPÓSITO —hasta que el
       * proceso termina, o el triple de lo que tardó la línea base— y la salida
       * tiene que llegar entera. Con `process.exit` llega cortada siempre en el
       * mismo byte.
       */
      const lenta = await conLectorLento('node', ['scripts/lib/metricas.mjs'], {
        cwd: raiz,
        env: { ...process.env, NCR_PAQUETES_METRICAS: '@ncr/config' },
        esperaMs: 3 * duracionBase + 5000,
      });
      /## Totales/.test(lenta.salida)
        ? ok('la salida llega entera aunque quien la lee se retrase (H-15S2-09)')
        : mal(
            `con un lector lento la salida se corta en ${lenta.salida.length} bytes (código ${String(lenta.codigo)}): un process.exit tira lo que quedaba en cola (H-15S2-09)`,
          );

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

      /**
       * 15-K (anexo) · si esto falla, lo que dijo el control va en la propia
       * línea ✗: el verificador sólo imprime las ✗, y en la corrida final de
       * la 15-K esta sonda falló una vez sin dejar ni una pista de por qué.
       */
      const dijo = conRoja.salida
        .split('\n')
        .filter((l) => /SUITE EN ROJO|CORRIDA INTERRUMPIDA|no se pudo cargar|✗ /.test(l))
        .slice(0, 4)
        .map((l) => l.trim().slice(0, 160))
        .join(' | ');

      // LO QUE IMPORTA: el nombre, no el recuento.
      /esta prueba falla a proposito y su nombre tiene que aparecer/.test(conRoja.salida)
        ? ok('el NOMBRE de la prueba roja aparece en la salida')
        : mal(
            `la prueba roja NO se nombra: el mensaje vuelve a mandar a buscar a ciegas (dijo: ${dijo || 'nada'}; ${porque(conRoja)})`,
          );

      /sonda-roja\.test\.ts/.test(conRoja.salida)
        ? ok('y también su fichero')
        : mal('no se dice en qué fichero está');

      // Y que NO se disfrace de corrida interrumpida, que es el otro remedio.
      /SUITE EN ROJO/.test(conRoja.salida) && !/CORRIDA INTERRUMPIDA/.test(conRoja.salida)
        ? ok('se clasifica como SUITE EN ROJO, no como corrida interrumpida')
        : mal(
            `una suite en rojo se informa como corrida interrumpida: remedio equivocado (${porque(conRoja)})`,
          );

      /saltadas=1\b/.test(conRoja.salida)
        ? ok('la prueba SALTADA se cuenta y se publica para que otro la compare (D-112)')
        : mal(`una saltada no aparece en el recuento legible por máquina (${porque(conRoja)})`);

      // 15-K (anexo) · un fichero que NO CARGA se nombra con su motivo, y no
      // se disfraza de corrida interrumpida.
      writeFileSync(
        sonda,
        "import { it } from 'vitest';\n" +
          "throw new Error('esta sonda no carga a proposito');\n" +
          "it('nunca llega a correr', () => undefined);\n",
      );
      const sinCargar = conConfig();
      /no se pudo cargar \(o falló fuera de sus pruebas\) packages\/config\/src\/sonda-roja\.test\.ts/.test(
        sinCargar.salida,
      ) &&
      /esta sonda no carga a proposito/.test(sinCargar.salida) &&
      !/CORRIDA INTERRUMPIDA/.test(sinCargar.salida)
        ? ok('un fichero de prueba que no carga se nombra con su motivo, como SUITE EN ROJO')
        : mal(
            `un fichero que no carga se informa sin su motivo: otra vez a buscar a ciegas (${porque(sinCargar)})`,
          );

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
    // 15-S5 · DT-15S2-11 · un lector lento por clase de guion: la salida llega entera (sondas/).
    await sondasDeLectorLentoPorClase({ raiz, banco, ok, mal, controles: ESCRITORES_SIN_TOPE });
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

    // (c bis) base-de-pruebas · un clúster VIVO con `max_connections` corto.
    {
      /**
       * ═══════════════════════════════════════════════════════════════════════
       * D-114 · «UN CONTROL QUE DA POR BUENO UN ESTADO QUE NO COMPROBÓ»
       *
       * `base-de-pruebas.sh` aplicaba `max_connections=300` SÓLO al crear el
       * clúster, y si encontraba uno vivo lo reutilizaba **sin mirar nada**. Un
       * clúster levantado antes de esa corrección seguía con el 100 por
       * omisión, y las pruebas de KPI-03 y de aforo morían con «sorry, too many
       * clients already» en los pasos 7, 7b y 14 — de forma intermitente, según
       * cómo repartiera vitest los ficheros ese día.
       *
       * La sonda levanta a propósito un clúster CORTO y exige que la siguiente
       * invocación lo detecte, lo diga y lo reinicie. Es el estado exacto que
       * producía el falso verde.
       * ═══════════════════════════════════════════════════════════════════════
       */
      const dirPg = '/var/tmp/ncr-negativas-conexiones';
      const entorno = {
        ...process.env,
        NCR_PGDATA: join(dirPg, 'data'),
        NCR_PGSOCK: join(dirPg, 'sock'),
        NCR_PGPORT: '55439',
        NCR_PGDATABASE: 'ncr_sonda',
      };
      const guion = join(raiz, 'scripts/base-de-pruebas.sh');
      const urlDeLaSonda = 'postgresql://postgres@127.0.0.1:55439/ncr_sonda';

      /**
       * ═══════════════════════════════════════════════════════════════════
       * D-115 · UN `pg_ctl` NO ES UN SERVIDOR
       *
       * La fórmula `libpq` de Homebrew —la que trae el runner de macOS—
       * instala `psql`, `pg_ctl` e `initdb`, pero NO el ejecutable
       * `postgres`. El guion elegía ese directorio porque encontraba
       * `pg_ctl`, y el error llegaba a mitad de `initdb`, donde ya no se
       * distingue de un control roto.
       *
       * Aquí se reproduce el escenario EXACTO en cualquier máquina: un
       * directorio con `pg_ctl` e `initdb` y sin servidor. Tiene que
       * negarse ANTES de tocar nada, y decirlo con esas palabras.
       * ═══════════════════════════════════════════════════════════════════
       */
      {
        const falso = mkdtempSync(join(tmpdir(), 'ncr-pgbin-sin-servidor-'));
        for (const cliente of ['pg_ctl', 'initdb', 'psql']) {
          const ruta = join(falso, cliente);
          writeFileSync(ruta, '#!/bin/sh\nexit 0\n');
          chmodSync(ruta, 0o755);
        }
        const aMedias = correr('bash', ['-c', `"${guion}" arrancar 2>&1`], {
          cwd: raiz,
          env: { ...entorno, NCR_PGBIN: falso },
        });
        aMedias.codigo !== 0 &&
        /no encuentro un servidor PostgreSQL utilizable/.test(aMedias.salida)
          ? ok('base-de-pruebas: un directorio con pg_ctl pero SIN servidor se rechaza, no se usa')
          : mal(
              'un directorio con pg_ctl y sin `postgres` se dio por bueno: ' +
                `codigo ${aMedias.codigo} · ${aMedias.salida.trim().split('\n').slice(-2).join(' · ')}`,
            );
        rmSync(falso, { recursive: true, force: true });
      }
      /**
       * Se invoca por `bash -c … 2>&1` a propósito: el aviso que esta sonda
       * tiene que leer se escribe en **stderr**, y `execFileSync` no devuelve
       * stderr cuando el proceso sale con cero. Leerlo de stdout habría dado
       * «no detectado» con el control funcionando — un falso negativo dentro
       * del banco que existe para impedirlos.
       */
      const invocar = (orden, extra = {}) =>
        correr('bash', ['-c', `"${guion}" ${orden} 2>&1`], {
          cwd: raiz,
          env: { ...entorno, ...extra },
        });
      const parar = () => invocar('parar');

      parar();
      rmSync(dirPg, { recursive: true, force: true });

      // 1 · se levanta A 100, que es el clúster de antes de la corrección.
      const corto = invocar('arrancar', { NCR_PGMAXCONN: '100' });

      /**
       * ═══════════════════════════════════════════════════════════════════
       * SIN CLÚSTER NO HAY NADA QUE EJERCITAR — y eso NO es un verde
       *
       * Esta sonda necesita levantar un PostgreSQL de verdad: es la única
       * forma de reproducir el estado que mataba los pasos 7, 7b y 14.
       *
       * La primera versión miraba si el mensaje decía «no encuentro pg_ctl», y
       * el CI de macOS enseñó dos veces que eso era atarse a UNA de las formas
       * de no poder. La segunda fue más instructiva que la primera: el runner
       * SÍ tenía `pg_ctl` —la fórmula `libpq` lo instala— pero no el servidor,
       * así que `base-de-pruebas.sh` lo daba por bueno y moría dentro de
       * `initdb`. Eso ya está corregido en el guion, que ahora exige los tres
       * binarios; aquí se lee el mensaje que produce esa comprobación.
       *
       * Se mira, además, lo único que de verdad importa —si el clúster
       * arrancó— y **se imprime el motivo**, que es lo que permite distinguir
       * «aquí no se puede» de «el control está mal».
       *
       * Cuenta como FALLO cuando la corrida lleva base (`DATABASE_URL_PRUEBAS`
       * definida), que es justo cuando este control está en juego. Es la misma
       * distinción que hace la sección 19 con Flutter: faltar no es lo mismo
       * que tenerlo mal.
       * ═══════════════════════════════════════════════════════════════════
       */
      if (corto.codigo !== 0) {
        const motivo = corto.salida.trim().split('\n').slice(-4).join(' · ') || '(sin salida)';
        if (/no encuentro un servidor PostgreSQL utilizable/.test(corto.salida)) {
          // PostgreSQL AUSENTE —o a medias, que para esto es lo mismo—:
          // declarado con esas palabras, y no como verde. Es la misma
          // distinción de la sección 19 con Flutter.
          console.log(
            '   · base-de-pruebas: sin servidor PostgreSQL en esta máquina, la sonda ' +
              'de max_connections NO se ejercitó (no se da por buena: no se ejecutó)',
          );
        } else {
          // PostgreSQL está y aun así no arrancó: eso SÍ es un fallo, y el
          // motivo va impreso para poder diagnosticarlo sin volver a correrlo.
          mal(`no se pudo levantar el clúster de la sonda (codigo ${corto.codigo}): ${motivo}`);
        }
        rmSync(dirPg, { recursive: true, force: true });
      } else {
        ok('base-de-pruebas: la sonda levanta un clúster corto a propósito');
        // 15-S5 · H-15S4-01 · el control del principio del verificador lo rechaza (sondas/).
        const sobreLaCorta = { raiz, banco, correr, ok, mal, url: urlDeLaSonda };
        sondaDeBaseCorta({ ...sobreLaCorta, control: 'scripts/lib/verificar-base-de-pruebas.mjs' });

        // 2 · la siguiente invocación lo encuentra vivo. Tiene que NEGARSE a
        //     reutilizarlo, decir por qué, y dejarlo con el valor que la suite
        //     necesita.
        const r = invocar('arrancar');
        r.codigo === 0 && /max_connections=100/.test(r.salida) && /Se reinicia/.test(r.salida)
          ? ok('un clúster vivo con max_connections=100 se detecta, se nombra y se reinicia')
          : mal(
              `un clúster corto se reutiliza a ciegas (codigo ${r.codigo}): ` +
                'es el estado que mataba los pasos 7, 7b y 14',
            );

        const ahora = invocar('arrancar');
        /Se reinicia/.test(ahora.salida)
          ? mal('el clúster reiniciado SIGUE por debajo del mínimo: se reinicia en bucle')
          : ok('y la invocación siguiente ya lo reutiliza, porque ahora sí sirve');
        sondaDeBaseRepuesta({
          ...sobreLaCorta,
          control: 'scripts/lib/verificar-base-de-pruebas.mjs',
        });

        parar();
        rmSync(dirPg, { recursive: true, force: true });
      }
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

  console.log('\n▸ 27 · un campo de texto SIN longitud máxima se detecta (H-13-09)');
  {
    if (exigeControl('scripts/lib/longitud-por-campo.mjs')) {
      enClon('node', ['scripts/lib/longitud-por-campo.mjs']).codigo === 0
        ? ok('la línea base del banco está limpia')
        : mal('el banco NO parte de una línea base limpia');

      // Un DTO nuevo con `@IsString()` y sin cota. Es exactamente la forma en
      // que §2.7.4 se pierde: nadie borra la regla, simplemente el campo
      // siguiente nace sin ella.
      const dto = join(clon, 'apps/api/src/sonda-dto.ts');
      writeFileSync(
        dto,
        "import { IsString } from 'class-validator';\n" +
          'export class SondaDto {\n  @IsString()\n  readonly notas!: string;\n}\n',
      );
      enClon('git', ['add', '--intent-to-add', 'apps/api/src/sonda-dto.ts']);
      const r = enClon('node', ['scripts/lib/longitud-por-campo.mjs']);
      r.codigo !== 0 && /sonda-dto/.test(r.salida)
        ? ok('detectado, con salida distinta de cero')
        : mal(`un campo sin cota NO se detecta (codigo ${r.codigo})`);

      // Y con la cota puesta, el mismo fichero pasa: que no sea un control que
      // siempre grita.
      writeFileSync(
        dto,
        "import { IsString, MaxLength } from 'class-validator';\n" +
          'export class SondaDto {\n  @IsString()\n  @MaxLength(512)\n  readonly notas!: string;\n}\n',
      );
      enClon('node', ['scripts/lib/longitud-por-campo.mjs']).codigo === 0
        ? ok('y con @MaxLength el mismo campo pasa')
        : mal('marca como sin cota un campo que SÍ la declara: falso positivo');

      rmSync(dto, { force: true });
      enClon('git', ['rm', '--cached', '--quiet', '--force', 'apps/api/src/sonda-dto.ts']);
    }
  }

  console.log('\n▸ 29 · una PWA que deja de ser instalable se detecta (ETAPA 14)');
  {
    if (exigeControl('scripts/lib/pwa-instalable.mjs')) {
      const manifiesto = join(clon, 'apps/web/public/manifest.webmanifest');
      const original = readFileSync(manifiesto, 'utf8');

      enClon('node', ['scripts/lib/pwa-instalable.mjs']).codigo === 0
        ? ok('la línea base del banco es instalable')
        : mal('el banco NO parte de una consola instalable');

      // (a) `display: browser` · la forma más silenciosa de perder la
      //     instalabilidad: el manifiesto sigue siendo válido y el navegador
      //     deja de ofrecer instalar, sin un solo error.
      writeFileSync(manifiesto, original.replace('"standalone"', '"browser"'));
      const a = enClon('node', ['scripts/lib/pwa-instalable.mjs']);
      a.codigo !== 0 && /display/.test(a.salida)
        ? ok('`display: browser` se detecta: ahí se pierde la instalación sin dar error')
        : mal(`un manifiesto no instalable pasa por bueno (codigo ${a.codigo})`);

      // (b) EL ICONO ENMASCARABLE QUE NO LO ES · el hallazgo que motivó el
      //     control: era byte a byte el mismo fichero que el normal.
      writeFileSync(
        manifiesto,
        original.replace('/iconos/icono-mascara.png', '/iconos/icono-512.png'),
      );
      const b = enClon('node', ['scripts/lib/pwa-instalable.mjs']);
      b.codigo !== 0 && /BYTE A BYTE/.test(b.salida)
        ? ok('un «enmascarable» que es el mismo fichero que el normal se detecta')
        : mal(`el icono enmascarable falso pasa inadvertido (codigo ${b.codigo})`);

      // (c) EL TAMAÑO DECLARADO QUE NO ES EL REAL.
      writeFileSync(manifiesto, original.replace('"sizes": "192x192"', '"sizes": "144x144"'));
      const c = enClon('node', ['scripts/lib/pwa-instalable.mjs']);
      c.codigo !== 0 && /mide/.test(c.salida)
        ? ok('un icono que dice un tamaño y mide otro se detecta')
        : mal(`el tamaño declarado no se comprueba contra el fichero (codigo ${c.codigo})`);

      // (c-bis) EL ICONO QUE NO ESTÁ · el manifiesto lo promete y el fichero
      //         no existe: el navegador no instala y no dice por qué.
      writeFileSync(manifiesto, original.replace('icono-512.png', 'icono-que-no-existe.png'));
      const cb = enClon('node', ['scripts/lib/pwa-instalable.mjs']);
      cb.codigo !== 0 && /no existe/.test(cb.salida)
        ? ok('un icono prometido y ausente se detecta')
        : mal(`un icono inexistente pasa inadvertido (codigo ${cb.codigo})`);

      // (c-ter) SIN `lang` · el sistema no sabe en qué idioma anunciarla.
      writeFileSync(manifiesto, original.replace(/\s*"lang": "[^"]*",/, ''));
      const ct = enClon('node', ['scripts/lib/pwa-instalable.mjs']);
      ct.codigo !== 0 && /lang/.test(ct.salida)
        ? ok('un manifiesto sin `lang` se detecta')
        : mal(`falta \`lang\` y nadie lo nota (codigo ${ct.codigo})`);
      writeFileSync(manifiesto, original);

      // (e) EL SERVICE WORKER QUE NADIE REGISTRA · el fichero existe, el
      //     navegador no lo usa, y la consola parece una PWA sin serlo.
      {
        const disposicion = join(clon, 'apps/web/src/app/layout.tsx');
        const antes = readFileSync(disposicion, 'utf8');
        writeFileSync(disposicion, antes.replace("register('/sw.js')", "registrar('/sw.js')"));
        const e = enClon('node', ['scripts/lib/pwa-instalable.mjs']);
        e.codigo !== 0 && /registra/.test(e.salida)
          ? ok('un service worker que nadie registra se detecta')
          : mal(`el sw.js sin registro pasa por bueno (codigo ${e.codigo})`);
        writeFileSync(disposicion, antes);
      }

      // (f) EL REPLIEGUE HACIA UNA RUTA QUE NO EXISTE · peor que no tenerlo.
      {
        const pagina = join(clon, 'apps/web/src/app/sin-conexion');
        rmSync(pagina, { recursive: true, force: true });
        const f = enClon('node', ['scripts/lib/pwa-instalable.mjs']);
        f.codigo !== 0 && /sin-conexion/.test(f.salida)
          ? ok('la página de sin conexión ausente se detecta')
          : mal(`el repliegue hacia una ruta inexistente pasa (codigo ${f.codigo})`);
        enClon('git', ['checkout', '--', 'apps/web/src/app/sin-conexion']);
      }

      // (d) `/api/` DENTRO DE LA CACHÉ · la fuga multiempresa desde el propio
      //     navegador, que ninguna RLS puede ver.
      writeFileSync(manifiesto, original);
      const sw = join(clon, 'apps/web/public/sw.js');
      const swOriginal = readFileSync(sw, 'utf8');
      writeFileSync(sw, swOriginal.replace('if (esApi(url)) return;', '// sin exclusión'));
      const d = enClon('node', ['scripts/lib/pwa-instalable.mjs']);
      d.codigo !== 0 && /fuga/.test(d.salida)
        ? ok('quitar la exclusión de `/api/` de la caché se detecta')
        : mal(`el service worker podría cachear respuestas de la API (codigo ${d.codigo})`);
      writeFileSync(sw, swOriginal);
    }
  }

  console.log('\n▸ 30 · una paleta de la app desfasada del preset se detecta (D-78, ETAPA 14)');
  {
    if (exigeControl('scripts/lib/generar-paleta-dart.mjs')) {
      /**
       * El control necesita `packages/config/dist/temas.js`, que está ignorado
       * y no viaja en el clon. Se monta un banco con el `dist` REAL enlazado y
       * una copia del generado, para poder estropear la copia sin tocar el
       * árbol de trabajo.
       *
       * ═══════════════════════════════════════════════════════════════════════
       * Y LA SONDA SE ASEGURA DE QUE ESE `dist` EXISTA · corregido en CI
       *
       * En local pasaba y en CI fallaba las tres veces, con «el banco NO parte
       * de una paleta al día». El motivo: este banco corre ANTES del paso de
       * compilación del flujo, así que `packages/config/dist` no existía y el
       * control informaba de su ausencia —correctamente— en los tres casos.
       *
       * La sonda depende de un artefacto y por tanto lo produce ella misma, en
       * vez de dar por hecho que alguien lo dejó ahí. Es lo mismo que se hizo
       * con la sonda 14 cuando dependía de una rama que el checkout no traía:
       * una prueba negativa que solo funciona si el entorno viene preparado no
       * demuestra nada en el entorno que no lo trae.
       * ═══════════════════════════════════════════════════════════════════════
       */
      if (!existsSync(join(raiz, 'packages/config/dist/temas.js'))) {
        correr('pnpm', ['--filter', '@ncr/config', 'build'], { cwd: raiz });
      }
      const banquito = mkdtempSync(join(tmpdir(), 'ncr-paleta-'));
      try {
        mkdirSync(join(banquito, 'packages/config'), { recursive: true });
        mkdirSync(join(banquito, 'apps/mobile/lib/configuracion'), { recursive: true });
        symlinkSync(join(raiz, 'packages/config/dist'), join(banquito, 'packages/config/dist'));
        const destino = join(banquito, 'apps/mobile/lib/configuracion/paleta.g.dart');
        const generada = readFileSync(join(raiz, 'apps/mobile/lib/configuracion/paleta.g.dart'));
        writeFileSync(destino, generada);

        const correrControl = () =>
          correr('node', ['scripts/lib/generar-paleta-dart.mjs', banquito, '--comprobar'], {
            cwd: raiz,
          });

        correrControl().codigo === 0
          ? ok('la línea base del banco está al día')
          : mal('el banco NO parte de una paleta al día');

        // (a) EDITAR EL GENERADO A MANO · §2.6: lo generado no se edita.
        writeFileSync(destino, String(generada).replace('Color(0xFFE63946)', 'Color(0xFF00FF00)'));
        const a = correrControl();
        a.codigo !== 0 && /no coincide con el preset/.test(a.salida)
          ? ok('un color editado a mano en el fichero generado se detecta')
          : mal(`editar el generado a mano pasa inadvertido (codigo ${a.codigo})`);

        // (b) EL PRESET CAMBIA Y NADIE REGENERA · se simula quitando un token
        //     del generado, que es lo que se ve cuando el preset gana uno.
        writeFileSync(
          destino,
          String(generada)
            .split('\n')
            .filter((l) => !l.includes('static const marcaSuave'))
            .join('\n'),
        );
        const b = correrControl();
        b.codigo !== 0
          ? ok('un token que falta respecto del preset se detecta')
          : mal(`una paleta incompleta pasa por al día (codigo ${b.codigo})`);

        // (c) Y CON LA COPIA BUENA, VERDE: que no sea un control que siempre grita.
        writeFileSync(destino, generada);
        correrControl().codigo === 0
          ? ok('y con el generado intacto, pasa')
          : mal('marca como desfasada una paleta idéntica: falso positivo');
      } finally {
        rmSync(banquito, { recursive: true, force: true });
      }
    }
  }

  console.log('\n▸ 31 · un diagrama Mermaid que NO analiza se detecta (ETAPA 14)');
  {
    if (exigeControl('scripts/lib/mermaid-analizable.mjs')) {
      // Este control se ejecuta desde la RAÍZ REAL y se le pasa el directorio a
      // revisar. No corre dentro del clon porque necesita `mermaid` y `jsdom`
      // resueltos, y el banco es un clon sin `node_modules`. Lo que se prueba
      // es el control, no dónde vive el fichero: el argumento de raíz existe
      // justamente para eso.
      const banquito = mkdtempSync(join(tmpdir(), 'ncr-mermaid-'));
      try {
        const escribir = (nombre, cuerpo) => {
          mkdirSync(join(banquito, 'docs'), { recursive: true });
          writeFileSync(join(banquito, 'docs', nombre), cuerpo);
        };
        const correrControl = () =>
          correr('node', ['scripts/lib/mermaid-analizable.mjs', banquito], { cwd: raiz });

        // (a) LÍNEA BASE · sin ningún bloque, el control no inventa hallazgos.
        escribir('sin-diagramas.md', '# solo prosa\n\nNada que analizar.\n');
        correrControl().codigo === 0
          ? ok('un documento sin diagramas no produce hallazgos')
          : mal('el control grita sobre un documento que no tiene un solo bloque');

        // (b) UNO CORRECTO · que no sea un control que siempre grita.
        escribir(
          'bueno.md',
          '# bueno\n\n```mermaid\nflowchart TD\n  A["Dominio"] --> B["Aplicación"]\n```\n',
        );
        correrControl().codigo === 0
          ? ok('un diagrama correcto pasa')
          : mal('marca como roto un diagrama que Mermaid sí analiza: falso positivo');

        // (c) LA VIOLACIÓN · el paréntesis suelto dentro de la etiqueta, que es
        //     exactamente la forma en que estos diagramas se rompen al editarlos.
        escribir(
          'roto.md',
          '# roto\n\n```mermaid\nflowchart TD\n  A[Presentación (driving)] --> B\n```\n',
        );
        const r = correrControl();
        r.codigo !== 0 && /roto\.md:3/.test(r.salida) && /NO ANALIZA/.test(r.salida)
          ? ok('detectado, con fichero y línea, y salida distinta de cero')
          : mal(`un diagrama roto pasa por bueno (codigo ${r.codigo})`);

        // (d) EL COLOR FIJADO A MANO · analiza perfectamente y aun así se
        //     rechaza: en el tema oscuro de GitHub no se lee.
        rmSync(join(banquito, 'docs', 'roto.md'), { force: true });
        escribir(
          'color.md',
          '# color\n\n```mermaid\nflowchart TD\n  A["Dominio"] --> B["Aplicación"]\n' +
            '  style A fill:#ffffff,stroke:#000000\n```\n',
        );
        const c = correrControl();
        c.codigo !== 0 && /color fijado a mano/.test(c.salida)
          ? ok('un color literal se rechaza aunque el diagrama analice')
          : mal(`un color fijado a mano pasa (codigo ${c.codigo})`);

        // (e) EL BLOQUE SIN CERRAR · no se descarta en silencio.
        rmSync(join(banquito, 'docs', 'color.md'), { force: true });
        escribir('abierto.md', '# abierto\n\n```mermaid\nflowchart TD\n  A --> B\n');
        const a = correrControl();
        a.codigo !== 0 && /no se cierra/.test(a.salida)
          ? ok('un bloque ```mermaid sin cerrar se detecta')
          : mal(`un bloque sin cerrar se descarta en silencio (codigo ${a.codigo})`);
      } finally {
        rmSync(banquito, { recursive: true, force: true });
      }
    }
  }

  console.log('\n▸ 32 · un acoplamiento a una marca de hardware se detecta (O2, ETAPA 15-D)');
  {
    if (exigeControl('scripts/lib/frontera-extensibilidad.mjs')) {
      const control = () => enClon('node', ['scripts/lib/frontera-extensibilidad.mjs']);
      const base = control();
      base.codigo === 0
        ? ok('la línea base del banco está limpia')
        : mal(`el banco NO parte de una línea base limpia: ${base.salida.split('\n')[1] ?? ''}`);

      // (A) el dominio importa el paquete de proveedores, aunque sea un tipo.
      const sondaDominio = join(clon, 'packages/domain-core/src/sonda-extensibilidad.ts');
      writeFileSync(sondaDominio, "import type { X } from '@ncr/providers';\nexport type Y = X;\n");
      const a = control();
      a.codigo !== 0 && /sonda-extensibilidad/.test(a.salida) && /\(A\)/.test(a.salida)
        ? ok('(A) el dominio importando @ncr/providers se detecta, aunque sea un tipo')
        : mal(`(A) NO detectado en el dominio (codigo ${a.codigo})`);
      rmSync(sondaDominio, { force: true });

      // (A bis) la capa de aplicación lo importa como VALOR; como tipo se admite.
      const sondaAplicacion = join(clon, 'apps/api/src/eventos/aplicacion/sonda-extensibilidad.ts');
      writeFileSync(
        sondaAplicacion,
        "import { crearProveedorDeEquipos } from '@ncr/providers';\nexport const f = crearProveedorDeEquipos;\n",
      );
      const av = control();
      av.codigo !== 0 && /como VALOR/.test(av.salida)
        ? ok('(A) la aplicación importando un VALOR de @ncr/providers se detecta')
        : mal(`(A) el valor en aplicación NO se detecta (codigo ${av.codigo})`);
      writeFileSync(
        sondaAplicacion,
        "import type { FichaDelEquipo } from '@ncr/providers';\nexport type F = FichaDelEquipo;\n",
      );
      control().codigo === 0
        ? ok('(A) y un `import type` en aplicación se admite: no ejecuta nada del paquete')
        : mal('(A) el control rechaza el `import type` legítimo');
      rmSync(sondaAplicacion, { force: true });

      // (B) alguien fuera del paquete construye un adaptador de marca.
      const sondaMarca = join(clon, 'apps/api/src/sonda-extensibilidad.ts');
      writeFileSync(
        sondaMarca,
        "import { HikvisionProvider } from '@ncr/providers';\nexport const p = new HikvisionProvider({} as never);\n", // extensibilidad-exenta: sonda
      );
      const b = control();
      b.codigo !== 0 && /\(B\)/.test(b.salida)
        ? ok('(B) construir un adaptador de marca fuera del paquete se detecta')
        : mal(`(B) NO detectado (codigo ${b.codigo})`);
      rmSync(sondaMarca, { force: true });

      // (C) el ficticio toca la carpeta de otra marca.
      const sondaFicticio = join(clon, 'packages/providers/src/ficticio/sonda-extensibilidad.ts');
      writeFileSync(
        sondaFicticio,
        "import { ClienteDeEquipo } from '../equipo/cliente';\nexport const c = ClienteDeEquipo;\n",
      );
      const c = control();
      c.codigo !== 0 && /\(C\)/.test(c.salida)
        ? ok('(C) el ficticio importando el cliente de la marca real se detecta')
        : mal(`(C) NO detectado (codigo ${c.codigo})`);
      rmSync(sondaFicticio, { force: true });

      // (D) el barril exporta la marca inventada.
      const barril = join(clon, 'packages/providers/src/index.ts');
      const barrilOriginal = readFileSync(barril, 'utf8');
      writeFileSync(barril, barrilOriginal + "\nexport * from './ficticio/registrar';\n");
      const d = control();
      d.codigo !== 0 && /\(D\)/.test(d.salida)
        ? ok('(D) exportar el ficticio por el barril se detecta')
        : mal(`(D) NO detectado (codigo ${d.codigo})`);
      writeFileSync(barril, barrilOriginal);

      // (C bis) sin ficticio no hay prueba de fuego: también se detecta.
      const ficticio = join(clon, 'packages/providers/src/ficticio');
      const respaldo = join(banco, 'ficticio-respaldo');
      cpSync(ficticio, respaldo, { recursive: true });
      rmSync(ficticio, { recursive: true, force: true });
      const sin = control();
      sin.codigo !== 0 && /prueba de fuego/.test(sin.salida)
        ? ok('(C) que el adaptador ficticio desaparezca se detecta')
        : mal(`(C) la ausencia del ficticio pasa (codigo ${sin.codigo})`);
      cpSync(respaldo, ficticio, { recursive: true });

      control().salida === base.salida
        ? ok('el banco de pruebas vuelve a su línea base')
        : mal('la sonda dejó rastro en el banco');
    }
  }

  console.log('\n▸ 33 · una clase que Nest construye e inyecta POR TIPO se detecta (H-SITIO-06)');
  {
    /**
     * En sitio, `start:dev` (tsx, sin metadatos de tipos) inyectó `undefined`
     * en el `ModuleRef` del planificador y la API cayó al arrancar. El control
     * se ejecuta desde el repositorio real —necesita `typescript`— contra un
     * árbol de sondas del banco, como el de Mermaid.
     */
    if (exigeControl('scripts/lib/inyeccion-explicita.mjs')) {
      const arbol = join(banco, 'sonda-inyeccion');
      mkdirSync(arbol, { recursive: true });
      const sonda = join(arbol, 'sonda.module.ts');
      const control = () =>
        correr('node', ['scripts/lib/inyeccion-explicita.mjs', arbol], { cwd: raiz });
      const modulo = (parametro, extra = '') =>
        "import { Controller, Inject, Injectable, Module } from '@nestjs/common';\n" +
        'class CasoDeUso {}\n' +
        `@Controller('sonda') export class SondaController { constructor(${parametro}) {} }\n` +
        `${extra}\n` +
        '@Module({ controllers: [SondaController] }) export class SondaModule {}\n';

      writeFileSync(sonda, modulo('private readonly caso: CasoDeUso'));
      const a = control();
      a.codigo !== 0 && /SondaController\(caso: CasoDeUso\)/.test(a.salida)
        ? ok('un controlador que inyecta por tipo, sin @Inject, se detecta')
        : mal(`el controlador sin @Inject NO se detecta (codigo ${a.codigo})`);

      writeFileSync(
        sonda,
        "import { Inject, Injectable, Module } from '@nestjs/common';\n" +
          'class Dependencia {}\n' +
          '@Injectable() export class Servicio { constructor(private readonly d: Dependencia) {} }\n' +
          '@Module({ providers: [{ provide: Servicio, useClass: Servicio }] }) export class M {}\n',
      );
      const b = control();
      b.codigo !== 0 && /Servicio\(d: Dependencia\)/.test(b.salida)
        ? ok('y un proveedor de `useClass:` que inyecta por tipo, también')
        : mal(`el proveedor de useClass sin @Inject NO se detecta (codigo ${b.codigo})`);

      writeFileSync(sonda, modulo('@Inject(CasoDeUso) private readonly caso: CasoDeUso'));
      control().codigo === 0
        ? ok('con @Inject explícito el control lo admite')
        : mal('el control rechaza un @Inject explícito');

      // Lo que se construye en una fábrica lleva sus argumentos escritos: no cuenta.
      writeFileSync(
        sonda,
        "import { Injectable, Module } from '@nestjs/common';\n" +
          '@Injectable() export class RepoPg { constructor(private readonly pool: object) {} }\n' +
          '@Module({ providers: [{ provide: RepoPg, useFactory: () => new RepoPg({}) }] }) export class M {}\n',
      );
      control().codigo === 0
        ? ok('una clase construida en `useFactory` no da falso positivo')
        : mal('el control marca una clase que sólo se construye en una fábrica');
      rmSync(arbol, { recursive: true, force: true });
    }
  }

  console.log(
    '\n▸ 34 · un Info.plist de iOS que pierde la red local, o la deja sólo en depuración, se detecta (H-SITIO-11)',
  );
  {
    /**
     * En sitio, un iPhone físico no alcanzaba la API por la IP privada:
     * faltaba `NSLocalNetworkUsageDescription`. Y la corrección de la 15-L
     * exige la app en RELEASE, abierta desde el ícono: la excepción de red
     * local va en Debug, Release y Profile. El control lee cada configuración
     * como la construye Xcode; aquí se le dan variantes rotas en el banco.
     */
    if (exigeControl('scripts/lib/info-plist-ios.mjs')) {
      const original = readFileSync(join(raiz, 'apps/mobile/ios/Runner/Info.plist'), 'utf8');
      const pbxproj = readFileSync(
        join(raiz, 'apps/mobile/ios/Runner.xcodeproj/project.pbxproj'),
        'utf8',
      );
      const debugXc = readFileSync(join(raiz, 'apps/mobile/ios/Flutter/Debug.xcconfig'), 'utf8');
      const releaseXc = readFileSync(
        join(raiz, 'apps/mobile/ios/Flutter/Release.xcconfig'),
        'utf8',
      );
      const sonda = join(banco, 'Info-sonda.plist');
      const proyecto = join(banco, 'project-sonda.pbxproj');
      const xc = join(banco, 'xcconfig-sonda');
      mkdirSync(xc, { recursive: true });
      const preparar = ({
        plist = original,
        debug = debugXc,
        release = releaseXc,
        pbx = pbxproj,
      } = {}) => {
        writeFileSync(sonda, plist);
        writeFileSync(proyecto, pbx);
        writeFileSync(join(xc, 'Debug.xcconfig'), debug);
        writeFileSync(join(xc, 'Release.xcconfig'), release);
      };
      const control = () =>
        correr('node', [
          'scripts/lib/info-plist-ios.mjs',
          '--plist',
          sonda,
          '--xcconfig',
          xc,
          '--pbxproj',
          proyecto,
        ]);

      preparar();
      const base = control();
      base.codigo === 0 &&
      /Debug/.test(base.salida) &&
      /Release/.test(base.salida) &&
      /Profile/.test(base.salida)
        ? ok('el Info.plist del repositorio pasa en Debug, Release y Profile: línea base limpia')
        : mal(`el Info.plist del repositorio NO pasa: ${base.salida.split('\n')[1] ?? ''}`);

      preparar({
        plist: original.replace(
          /<key>NSLocalNetworkUsageDescription<\/key>\s*<string>[^<]*<\/string>/,
          '',
        ),
      });
      const a = control();
      a.codigo !== 0 && /Release: falta NSLocalNetworkUsageDescription/.test(a.salida)
        ? ok('sin la clave de red local se detecta (el síntoma de sitio)')
        : mal(`sin la clave de red local NO se detecta (codigo ${a.codigo})`);

      // La reversión exacta de esta corrección: ATS sólo bajo una marca que
      // sólo Debug define, con el plist preprocesado como en la 15-K.
      preparar({
        plist: original.replace(
          /(<key>NSAppTransportSecurity<\/key>\s*<dict>[\s\S]*?<\/dict>)/,
          '<!--\n#if NCR_DEPURACION\n-->\n$1\n<!--\n#endif\n-->',
        ),
        debug: `${debugXc}\nINFOPLIST_PREPROCESS = YES\nINFOPLIST_PREPROCESSOR_DEFINITIONS = NCR_DEPURACION=1\n`,
        release: `${releaseXc}\nINFOPLIST_PREPROCESS = YES\n`,
      });
      const b = control();
      b.codigo !== 0 &&
      /Release: falta NSAppTransportSecurity/.test(b.salida) &&
      /Profile: falta NSAppTransportSecurity/.test(b.salida) &&
      !/Debug: falta/.test(b.salida)
        ? ok('la excepción de red local sólo en depuración se detecta en Release y en Profile')
        : mal(`ATS sólo en depuración NO se detecta (codigo ${b.codigo})`);

      preparar({
        plist: original.replace(
          '<key>NSAllowsLocalNetworking</key>',
          '<key>NSAllowsArbitraryLoads</key><true/><key>NSAllowsLocalNetworking</key>',
        ),
      });
      const c = control();
      c.codigo !== 0 && /NSAllowsArbitraryLoads/.test(c.salida)
        ? ok('NSAllowsArbitraryLoads se detecta')
        : mal(`NSAllowsArbitraryLoads NO se detecta (codigo ${c.codigo})`);

      preparar({ plist: original.replace('</dict>\n</plist>', '</plist>') });
      control().codigo !== 0
        ? ok('un plist mal formado es un fallo, no un «no encontrado»')
        : mal('un plist mal formado pasa');

      preparar({
        plist: original.replace(/<key>NSAppTransportSecurity<\/key>\s*<dict>[\s\S]*?<\/dict>/, ''),
      });
      const d = control();
      d.codigo !== 0 && /Debug: falta NSAppTransportSecurity/.test(d.salida)
        ? ok('sin la excepción de red local se detecta')
        : mal(`sin ATS local NO se detecta (codigo ${d.codigo})`);

      // Profile sin su configuración: lo que no se construye no se comprueba.
      preparar({ pbx: pbxproj.replace(/name = Profile;/g, 'name = Otra;') });
      const e = control();
      e.codigo !== 0 && /no tiene la configuración Profile/.test(e.salida)
        ? ok('un proyecto sin la configuración Profile es un fallo, no un silencio')
        : mal(`sin Profile NO se detecta (codigo ${e.codigo})`);

      preparar();
      rmSync(join(xc, 'Release.xcconfig'), { force: true });
      const f = control();
      f.codigo !== 0 && /no se pudo leer/.test(f.salida)
        ? ok('un .xcconfig que falta es un fallo, no un silencio')
        : mal(`un .xcconfig que falta NO se detecta (codigo ${f.codigo})`);

      // Sin el proyecto no se sabe qué construye cada configuración.
      preparar();
      rmSync(proyecto, { force: true });
      const g = control();
      g.codigo !== 0 && /no se pudo leer .*project-sonda\.pbxproj/.test(g.salida)
        ? ok('un proyecto de Xcode que falta es un fallo, no un «todo en orden»')
        : mal(`sin el proyecto de Xcode NO se detecta (codigo ${g.codigo})`);

      // Release (y Profile, que lo usa) sin su .xcconfig: no se sabe si
      // preprocesa, así que no se da por buena.
      preparar({
        pbx: pbxproj.replace(
          /\t+baseConfigurationReference = \w+ \/\* Release\.xcconfig \*\/;\n/g,
          '',
        ),
      });
      const h = control();
      h.codigo !== 0 &&
      /Release: la configuración no declara su \.xcconfig/.test(h.salida) &&
      /Profile: la configuración no declara su \.xcconfig/.test(h.salida)
        ? ok('una configuración sin .xcconfig es un fallo, no un plist leído a ciegas')
        : mal(`una configuración sin .xcconfig NO se detecta (codigo ${h.codigo})`);

      preparar({ plist: original.replace('</plist>', '<dict/>\n</plist>') });
      const i = control();
      i.codigo !== 0 && /contenido después del <dict> raíz/.test(i.salida)
        ? ok('lo que sobra tras el <dict> raíz es un fallo')
        : mal(`contenido tras el <dict> raíz NO se detecta (codigo ${i.codigo})`);

      rmSync(xc, { recursive: true, force: true });
      rmSync(sonda, { force: true });
      rmSync(proyecto, { force: true });
    }
  }

  console.log(
    '\n▸ 35 · start:dev con tsx deja el ValidationPipe inerte, y el paso 12d lo ve (H-SITIO-06)',
  );
  {
    /**
     * Anexo 15-K · el 12d arrancaba la API con tsx y sólo miraba la inyección;
     * la mitad silenciosa —sin metadatos de tipos el `ValidationPipe` no valida
     * ningún DTO— la destapó el recorrido de la consola. Dos sondas, en
     * ÁRBOLES de sonda (sólo `apps/api` copiada, el resto enlazado):
     *
     *  · 35a · `start:dev` vuelve a ser tsx y se quita la negativa del
     *          arranque: es la API de sitio. El paso debe decir que NO valida.
     *  · 35b · sólo se quita la negativa: `start:dev` sigue sano, pero nada
     *          impide arrancar con tsx. El paso debe decir que tsx ARRANCA.
     */
    const sinNegativa = [
      'apps/api/src/main.ts',
      'if (!emiteMetadatosDeTipos()) throw new ErrorDeConfiguracion([MOTIVO_SIN_METADATOS]);',
      'void [emiteMetadatosDeTipos, MOTIVO_SIN_METADATOS];',
    ];
    const casos = [
      {
        id: '35a',
        parches: [
          sinNegativa,
          ['apps/api/package.json', /"start:dev": "[^"]*"/, '"start:dev": "tsx watch src/main.ts"'],
        ],
        esperado: /ValidationPipe NO valida/,
        bien: 'con el start:dev de sitio (tsx) el paso 12d dice que el ValidationPipe no valida',
      },
      {
        id: '35b',
        parches: [sinNegativa],
        esperado: /con tsx la API ARRANCA sin metadatos/,
        bien: 'sin la negativa del arranque el paso 12d dice que tsx arranca sin validar',
      },
    ];
    for (const caso of casos) {
      const arbol = arbolDeSonda({ copiar: ['apps/api'] });
      try {
        for (const [fichero, antes, despues] of caso.parches) arbol.mutar(fichero, antes, despues);
        const r = correr('node', ['e2e/arranque-de-desarrollo.mjs'], {
          timeout: 420_000,
          env: { ...process.env, NCR_RAIZ: arbol.raiz },
        });
        r.codigo !== 0 && caso.esperado.test(r.salida)
          ? ok(`${caso.id} · ${caso.bien}`)
          : mal(`${caso.id} · el paso 12d NO lo detecta (codigo ${r.codigo})`);
      } finally {
        arbol.limpiar();
      }
    }
  }

  console.log(
    '\n▸ 36 · el recorrido de la consola sin base o sin navegador NO pasa por verde (§4)',
  );
  {
    /**
     * La prueba negativa FUERTE del recorrido es el paso 13c: reintroduce
     * H-SITIO-02, 03 y 08 y exige que lo nombre. Aquí, sin base de datos, se
     * comprueba lo que puede comprobarse siempre: que la falta de lo que
     * necesita es un fallo explícito, nunca un salto en silencio.
     */
    const sinBase = correr('node', ['e2e/recorrido-de-consola.mjs'], {
      timeout: 60_000,
      env: { ...process.env, DATABASE_URL_PRUEBAS: '' },
    });
    sinBase.codigo !== 0 && /sin DATABASE_URL_PRUEBAS/.test(sinBase.salida)
      ? ok('sin base el recorrido falla y dice que NO se ha verificado')
      : mal(`sin base el recorrido no falla como debe (codigo ${sinBase.codigo})`);
    const sinNavegador = correr('node', ['e2e/recorrido-de-consola.mjs'], {
      timeout: 60_000,
      env: { ...process.env, NCR_CHROMIUM: join(banco, 'chromium-que-no-existe') },
    });
    sinNavegador.codigo !== 0 && /no hay Chromium/.test(sinNavegador.salida)
      ? ok('sin Chromium el recorrido falla y lo dice')
      : mal(`sin Chromium el recorrido no falla como debe (codigo ${sinNavegador.codigo})`);
  }

  console.log('\n▸ 37 · la sonda negativa del recorrido sin ninguna sonda NO es un verde (§4)');
  {
    const r = correr('node', ['e2e/recorrido-negativo.mjs'], {
      timeout: 60_000,
      env: { ...process.env, NCR_SONDAS: 'H-SITIO-INEXISTENTE' },
    });
    r.codigo !== 0 && /no se ejecutó ninguna sonda/.test(r.salida)
      ? ok('un filtro que no casa con ninguna sonda es un fallo, no un «todo detectado»')
      : mal(`sin sondas el recorrido negativo pasa (codigo ${r.codigo})`);
  }

  console.log(
    '\n▸ 38 · el guion de sitio (paso 12e) ve H-SITIO-13 con --abrir y una escritura de audio sin declarar',
  );
  {
    /**
     * Anexo 15-K · el 12e ensaya el guion contra los simulados; aquí se le ve
     * fallar. Se copia `packages/providers` a un árbol de sonda, se muta, se
     * compila, y el guion se ejecuta DESDE el árbol (`--preserve-symlinks-main`:
     * sin eso, `scripts/` —un enlace— se resolvería al repositorio real y
     * cargaría el paquete sano).
     *
     *  · 38a · la apertura de la terminal vuelve al cuerpo mínimo: el equipo
     *          dice «OK» y la puerta no se mueve. `--abrir` debe decirlo.
     *  · 38b · el canal de audio pierde su `sinCuerpo`: el cliente se niega a
     *          abrirlo. `--con-audio` debe decirlo.
     */
    const casos = [
      {
        id: '38a',
        fichero: 'packages/providers/src/equipo/catalogo-de-rutas.ts',
        antes: 'export const CUERPO_DE_APERTURA_DE_LA_TERMINAL = DOCUMENTO_DE_APERTURA;',
        despues:
          "export const CUERPO_DE_APERTURA_DE_LA_TERMINAL = '<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>';",
        argumentos: ['--simulado', '--abrir'],
        esperado: /la puerta NO se movió/,
        bien: '--abrir dice que la puerta de la terminal NO se movió con la orden aceptada',
      },
      {
        id: '38b',
        fichero: 'packages/providers/src/equipo/catalogo-de-rutas.ts',
        antes: /\n {4}sinCuerpo: true,/g,
        despues: '',
        argumentos: ['--simulado', '--con-audio'],
        esperado: /abrir el canal de audio bidireccional \(canal 1\) — inalcanzable/,
        bien: '--con-audio dice que el canal de audio no se pudo abrir',
      },
    ];
    // 38c · sin mutar nada: un equipo que no contesta NO es una apertura
    // verificada, y `--abrir` lo dice con su salida.
    {
      const r = correr(
        'node',
        [
          'scripts/puesta-en-marcha-equipos.mjs',
          '--abrir',
          `--informe=${join(banco, 'guion-38c.md')}`,
        ],
        {
          timeout: 60_000,
          input: '',
          env: {
            ...process.env,
            TERMINAL_HOST: 'terminal-de-sonda.invalid',
            TERMINAL_USUARIO: 'sonda',
            TERMINAL_CLAVE: 'sonda',
            VIDEOPORTERO_HOST: '',
          },
        },
      );
      r.codigo !== 0 &&
      /orden NO aceptada/.test(r.salida) &&
      /la apertura NO queda verificada/.test(r.salida)
        ? ok('38c · --abrir contra un equipo que no contesta sale en 1 y lo dice')
        : mal(`38c · --abrir sin equipo pasa por verde (codigo ${r.codigo})`);
    }
    for (const caso of casos) {
      const arbol = arbolDeSonda({ copiar: ['packages/providers'] });
      try {
        arbol.mutar(caso.fichero, caso.antes, caso.despues);
        arbol.compilar('packages/providers');
        const informe = join(banco, `guion-${caso.id}.md`);
        const r = correr(
          'node',
          [
            '--preserve-symlinks-main',
            join(arbol.raiz, 'scripts/puesta-en-marcha-equipos.mjs'),
            ...caso.argumentos,
            `--informe=${informe}`,
            `--hoja=${join(banco, `hoja-${caso.id}.md`)}`,
          ],
          { timeout: 120_000, input: '' },
        );
        r.codigo !== 0 && caso.esperado.test(r.salida)
          ? ok(`${caso.id} · ${caso.bien}`)
          : mal(`${caso.id} · el guion NO lo detecta (codigo ${r.codigo})`);
      } finally {
        arbol.limpiar();
      }
    }
  }

  console.log(
    '\n▸ 39 · una prueba OMITIDA por falta de base FALLA con --con-base, y se nombra (H-15L-C01)',
  );
  {
    /**
     * ════════════════════════════════════════════════════════════════════════
     * EL DEFECTO QUE ESTA SONDA CIERRA
     *
     * `visitas-pg.test.ts` estuvo en verde con la base local caída: cada prueba
     * salía por `if (omitida()) return;` y una prueba que retorna antes de su
     * primera aserción PASA. La lista de visitas del residente salía vacía
     * contra PostgreSQL (H-15L-C01) y el verificador, pedido con `--con-base`,
     * no lo vio: vitest no la cuenta como saltada, así que D-112 tampoco.
     *
     * Se siembra la omisión DE VERDAD: una suite real de PostgreSQL contra una
     * base que no contesta (el puerto 1 del bucle local rechaza al instante).
     * `aforo-concurrencia.test.ts` y no la de visitas porque no arrastra Nest ni
     * los equipos —dos segundos, y nada que otro trabajo en curso rompa—; el
     * guardián es el mismo `exigirBase` de `base-exigida.ts`. Y sus informes
     * JSON REALES alimentan el control del paso 5.
     * ════════════════════════════════════════════════════════════════════════
     */
    const apiDir = join(raiz, 'apps', 'api');
    const vitest = join(
      dirname(createRequire(join(apiDir, 'package.json')).resolve('vitest/package.json')),
      'vitest.mjs',
    );
    const BASE_MUERTA = 'postgresql://nadie@127.0.0.1:1/ncr';
    // El verificador exporta NCR_BASE_EXIGIDA con --con-base: aquí se decide caso a caso.
    const entornoLibre = { ...process.env, CI: '1' };
    delete entornoLibre.NCR_BASE_EXIGIDA;
    const suiteContra = (caso, extra) => {
      const informe = join(banco, `omision-${caso}.json`);
      const r = correr(
        'node',
        [vitest, 'run', 'test/aforo-concurrencia.test.ts', `--outputFile.json=${informe}`],
        { cwd: apiDir, timeout: 300_000, env: { ...entornoLibre, ...extra } },
      );
      return { ...r, salida: sinColores(r.salida), informe };
    };
    const PRUEBA = '50 ingresos simultáneos sobre 10 plazas: entran 10, ni una más';

    const libre = suiteContra('libre', { DATABASE_URL_PRUEBAS: BASE_MUERTA });
    libre.codigo === 0 && /OMITIDA: test\/aforo-concurrencia\.test\.ts › /.test(libre.salida)
      ? ok('sin --con-base, la base caída OMITE —permitido— y lo anuncia con el nombre')
      : mal(`sin --con-base la suite no parte de un estado sano (codigo ${libre.codigo})`);

    const exigida = suiteContra('exigida', {
      DATABASE_URL_PRUEBAS: BASE_MUERTA,
      NCR_BASE_EXIGIDA: '1',
    });
    exigida.codigo !== 0
      ? ok('con --con-base, la MISMA suite con la base caída FALLA')
      : mal('con --con-base la suite sin base PASA: es el verde de H-15L-C01');
    exigida.salida.includes(`OMISIÓN POR FALTA DE BASE con --con-base · test/aforo-concurrencia`) &&
    exigida.salida.includes(PRUEBA)
      ? ok('y cada prueba falla con su fichero, su bloque, su nombre y el motivo')
      : mal('falla sin decir qué prueba se omitió ni por qué');

    const sinUrl = suiteContra('sin-url', { DATABASE_URL_PRUEBAS: '', NCR_BASE_EXIGIDA: '1' });
    sinUrl.codigo !== 0 && /DATABASE_URL_PRUEBAS no llega a esta suite/.test(sinUrl.salida)
      ? ok('con --con-base y SIN la variable, el fichero no carga y dice por qué')
      : mal('con --con-base y sin DATABASE_URL_PRUEBAS la suite se salta en silencio');

    // ─── El control del paso 5, sobre esos informes reales y sobre un árbol ──
    const arbol = join(banco, 'arbol-omisiones');
    const dirApi = join(arbol, 'apps', 'api');
    const informe = join(dirApi, '.informe-paso5.json');
    mkdirSync(join(dirApi, 'test'), { recursive: true });
    mkdirSync(join(arbol, 'apps', 'web'), { recursive: true });
    const controlar = (...args) =>
      correr('node', ['scripts/lib/omisiones-sin-base.mjs', ...args, arbol], { cwd: raiz });
    const poner = (relativo, texto) => {
      mkdirSync(dirname(join(arbol, relativo)), { recursive: true });
      writeFileSync(join(arbol, relativo), texto);
    };

    // Línea base: un árbol que cumple la regla y un informe sin omisiones.
    poner('apps/api/test/base-exigida.ts', 'export const u = process.env.DATABASE_URL_PRUEBAS;\n');
    poner(
      'apps/api/test/con-guardian-pg.test.ts',
      "import { URL_BASE, exigirBase as guardian } from './base-exigida';\n" +
        "guardian('sonda', () => URL_BASE !== undefined);\n",
    );
    poner('apps/api/test/sin-base.test.ts', "import { it } from 'vitest';\n");
    poner('apps/api/src/config.ts', 'export const u = process.env.DATABASE_URL_PRUEBAS;\n');
    poner(
      'apps/api/node_modules/dep/leer.test.ts',
      'export const u = process.env.DATABASE_URL_PRUEBAS;\n',
    );
    writeFileSync(
      informe,
      JSON.stringify({
        testResults: [
          {
            name: '/x/apps/api/test/con-guardian-pg.test.ts',
            status: 'passed',
            message: '',
            assertionResults: [{ fullName: 'corre contra la base', failureMessages: [] }],
          },
        ],
      }),
    );
    const limpia = controlar('--exigida');
    limpia.codigo === 0 && /ninguna · 1 fichero\(s\) de prueba usan la base/.test(limpia.salida)
      ? ok('un árbol en regla y sin omisiones pasa, y cuenta los ficheros con guardián')
      : mal(
          `la línea base del control no pasa: sería un control que siempre grita (${limpia.salida.trim()})`,
        );

    // El informe REAL de la base caída sin --con-base: permitido y contado.
    cpSync(libre.informe, informe);
    const permitida = controlar();
    permitida.codigo === 0 && /aforo-concurrencia\.test\.ts: 5 omitida/.test(permitida.salida)
      ? ok('sin --con-base, las omisiones se permiten y se cuentan por fichero')
      : mal(`sin --con-base el control rompe o calla las omisiones (codigo ${permitida.codigo})`);
    const marcada = controlar('--exigida');
    marcada.codigo !== 0 && marcada.salida.includes(PRUEBA)
      ? ok('y ese mismo informe con --con-base FALLA y NOMBRA la prueba: si la variable no llegara')
      : mal('una prueba MARCADA como omitida pasa por verde con --con-base');

    cpSync(exigida.informe, informe);
    const fallada = controlar('--exigida');
    fallada.codigo !== 0 &&
    fallada.salida.includes(PRUEBA) &&
    /motivo: sin DATABASE_URL/.test(fallada.salida)
      ? ok('las que FALLARON por omisión se nombran con su motivo, no como una roja cualquiera')
      : mal('las pruebas falladas por omisión no se nombran como omisiones');

    cpSync(sinUrl.informe, informe);
    /aforo-concurrencia\.test\.ts › \(el fichero no cargó\)/.test(controlar('--exigida').salida)
      ? ok('el fichero que no carga por falta de base también se nombra')
      : mal('un fichero que no carga por falta de base no se nombra');

    // Los que se saltan la regla, con y sin --con-base.
    writeFileSync(informe, JSON.stringify({ testResults: [] }));
    poner(
      'apps/api/test/por-su-cuenta-pg.test.ts',
      "const u = process.env['DATABASE_URL_PRUEBAS'];\n",
    );
    poner(
      'apps/api/test/sin-guardian-pg.test.ts',
      "import { URL_BASE } from './base-exigida';\nif (!URL_BASE) throw new Error('x');\n",
    );
    poner(
      'apps/api/test/guardian-sin-llamar-pg.test.ts',
      "import { exigirBase } from './base-exigida';\nexport const g = exigirBase;\n",
    );
    const fuera = controlar();
    fuera.codigo !== 0 &&
    /por-su-cuenta-pg\.test\.ts: lee DATABASE_URL_PRUEBAS/.test(fuera.salida) &&
    /sin-guardian-pg\.test\.ts: importa de base-exigida\.ts y no registra/.test(fuera.salida) &&
    /guardian-sin-llamar-pg\.test\.ts: importa/.test(fuera.salida)
      ? ok('leer la base por su cuenta, o usarla sin guardián, rompe SIEMPRE y se nombra')
      : mal(`un fichero que lee la base sin el guardián pasa (codigo ${fuera.codigo})`);
    !/config\.ts|node_modules/.test(fuera.salida)
      ? ok('y no confunde el código de la aplicación ni las dependencias con pruebas')
      : mal('marca como prueba lo que no lo es');

    // Y las dos formas de no tener nada que mirar.
    writeFileSync(informe, '{esto no es json');
    const rota = controlar('--exigida');
    rota.codigo !== 0 && /no se pudo leer/.test(rota.salida)
      ? ok('un informe ilegible se dice, no se confunde con «sin omisiones»')
      : mal('un informe corrupto pasa como si no hubiera omisiones');
    rmSync(informe, { force: true });
    controlar('--exigida').codigo !== 0
      ? ok('sin ningún informe del paso 5 no hay verde')
      : mal('sin informes el control aprueba sin mirar nada');
    correr('node', ['scripts/lib/omisiones-sin-base.mjs'], { cwd: raiz }).codigo !== 0
      ? ok('invocarlo sin raíz no devuelve verde')
      : mal('sin argumentos da 0: un control que no mira nada y aprueba');
  }

  console.log(
    "\n▸ 40 · un pool o un cliente de PostgreSQL sin oyente de 'error', o un préstamo a mano, se detecta (15-O)",
  );
  {
    /**
     * En sitio (30/09/2026) el pooler de Supabase cortó conexiones y la API
     * murió: «Unhandled 'error' event». Ni el `Pool` ni los `pool.connect()`
     * escuchaban. El control lee el código; aquí se le da un árbol de sondas
     * con cada forma de volver a romperlo, y las formas correctas.
     */
    if (exigeControl('scripts/lib/frontera-conexiones.mjs')) {
      const arbol = join(banco, 'sonda-conexiones');
      const persistencia = join(arbol, 'persistencia');
      mkdirSync(persistencia, { recursive: true });
      const control = () =>
        correr('node', ['scripts/lib/frontera-conexiones.mjs', arbol], { cwd: raiz });
      const sonda = join(arbol, 'repositorio-pg.ts');
      // El ayudante SÍ presta: no cuenta como préstamo a mano.
      writeFileSync(
        join(persistencia, 'con-cliente.ts'),
        'export const conCliente = async (pool, fn) => { const c = await pool.connect(); return fn(c); };\n',
      );

      writeFileSync(
        sonda,
        '// pool.connect() en un comentario no es un préstamo\n' +
          'export const leer = async (pool) => {\n  const cliente = await pool.connect();\n  cliente.release();\n};\n',
      );
      const a = control();
      a.codigo !== 0 &&
      /repositorio-pg\.ts:3 `pool\.connect\(\)` presta un cliente a mano/.test(a.salida)
        ? ok('un `pool.connect()` fuera de conCliente se detecta, con su línea')
        : mal(`el préstamo a mano NO se detecta (codigo ${a.codigo})`);
      /con-cliente\.ts|:1 /.test(a.salida)
        ? mal('marca al propio ayudante, o a un comentario, como préstamo')
        : ok('y no marca al ayudante ni a un comentario que lo nombra');

      writeFileSync(
        sonda,
        "import { Pool } from 'pg';\nexport const pool = new Pool({ max: 2 });\n",
      );
      const b = control();
      b.codigo !== 0 && /`pool = new Pool\(` sin `pool\.on\('error'/.test(b.salida)
        ? ok("un `new Pool(` sin `.on('error')` se detecta")
        : mal(`el pool sin oyente NO se detecta (codigo ${b.codigo})`);

      writeFileSync(
        sonda,
        "import PgBoss from 'pg-boss';\nexport const arrancar = async () => {\n" +
          '  this.boss = new PgBoss({ max: 2 });\n  await this.boss.start();\n};\n',
      );
      const c = control();
      c.codigo !== 0 && /`boss = new PgBoss\(`/.test(c.salida)
        ? ok("y un `new PgBoss(` sin `.on('error')`, también")
        : mal(`pg-boss sin oyente NO se detecta (codigo ${c.codigo})`);

      writeFileSync(
        sonda,
        "import { Pool } from 'pg';\nexport const crear = () => usar(new Pool({}));\n",
      );
      const d = control();
      d.codigo !== 0 && /sin variable ni `vigilarPool\(`/.test(d.salida)
        ? ok('un pool construido sin variable ni `vigilarPool(` no se da por bueno')
        : mal(`un pool anónimo pasa sin comprobar su oyente (codigo ${d.codigo})`);

      writeFileSync(
        sonda,
        "import { Client, Pool } from 'pg';\n" +
          'export const p = vigilarPool(new Pool({}), () => undefined);\n' +
          "const q = new Pool({});\nq.on('error', () => undefined);\n" +
          'export const probar = async () => {\n  const cliente = new Client({});\n' +
          "  cliente.on('error', () => undefined);\n  await cliente.connect();\n};\n",
      );
      mkdirSync(join(arbol, 'node_modules'), { recursive: true });
      writeFileSync(join(arbol, 'node_modules', 'ajeno.js'), 'await pool.connect();\n');
      // Una raíz que no existe se salta; lo de `node_modules` no es del proyecto.
      const e = correr(
        'node',
        ['scripts/lib/frontera-conexiones.mjs', arbol, join(banco, 'no-existe')],
        { cwd: raiz },
      );
      e.codigo === 0 && /OK 3 pools\/clientes/.test(e.salida)
        ? ok("con `vigilarPool(`, `.on('error')` y un Client que se conecta a sí mismo, lo admite")
        : mal(
            `el control rechaza las formas correctas (codigo ${e.codigo}): ${e.salida.slice(0, 300)}`,
          );
      rmSync(arbol, { recursive: true, force: true });

      // Sin argumentos mira el repositorio, que debe estar limpio.
      const repo = correr('node', ['scripts/lib/frontera-conexiones.mjs'], { cwd: raiz });
      repo.codigo === 0 && /OK [1-9]\d* pools/.test(repo.salida)
        ? ok('sin argumentos mira el repositorio, y el repositorio pasa')
        : mal(
            `el repositorio no pasa su propio control (codigo ${repo.codigo}): ${repo.salida.slice(0, 300)}`,
          );
    }
  }

  console.log(
    '\n▸ 41 · un error de tipos en una prueba de la API, del dominio, de proveedores o del Edge rompe `pnpm typecheck` (DT-15S1-03, DT-15S1-C02)',
  );
  {
    /**
     * ════════════════════════════════════════════════════════════════════════
     * DT-15S1-03 · LAS PRUEBAS DE LA API NO SE COMPILABAN
     *
     * `apps/api/tsconfig.json` excluye `src/**\/*.test.ts` y no alcanza `test/`:
     * las pruebas sólo pasaban por SWC, que transpila sin comprobar tipos. Al
     * compilarlas salieron 52 errores, y dos pruebas huecas entre ellos: la de
     * H-13-02, que desde la 15-E dejaba el sobre en una clave inexistente y
     * seguía en verde con UNA llave para todas las copropiedades, y la de «el
     * motivo no lleva la dirección», cuyo mensaje nunca la llevó.
     *
     * DT-15S1-C02 · Y EL MISMO AGUJERO EN DOMINIO, PROVEEDORES Y EDGE. Sus
     * `tsconfig.json` excluyen las pruebas y el del Edge no alcanza `test/`:
     * proveedores tenía tres errores de tipos en pruebas que pasaban.
     *
     * Ahora el `typecheck` de cada uno compila también su `tsconfig.pruebas.json`.
     * Aquí se le ve fallar: en la API se devuelve el defecto que abrió la deuda
     * —el doble `HogarEnMemoria` sin `darDeBaja`—, en proveedores uno de sus
     * tres errores, y en los cuatro se mete un error en una prueba. Y se vigila
     * lo que lo dejaría ciego sin ponerse rojo: un `typecheck` que ya no las
     * compila, una configuración menos estricta, o turbo sirviendo de su caché un
     * verde viejo (H-15S1-C05: las pruebas de la API y las del Edge leen ficheros
     * de otros paquetes, y las de proveedores, `scripts/`).
     *
     * Por qué en un espejo y con `tsc -p`: el banco no tiene `node_modules`, y
     * `tsc -b` necesitaría los `dist/` de los paquetes internos. Los
     * `tsconfig.pruebas.json` los resuelven al FUENTE (`paths`), así que basta
     * enlazar `node_modules`. Y con el `tsc` del repositorio, no el del PATH: en
     * el contenedor de la nube hay un TypeScript 6 global que rechaza la
     * configuración por otra razón, y la sonda concluiría sobre él.
     * ════════════════════════════════════════════════════════════════════════
     */
    const PROGRAMAS = [
      { de: 'de la API', paquete: '@ncr/api', carpeta: 'apps/api', sonda: 'src' },
      {
        de: 'del dominio',
        paquete: '@ncr/domain-core',
        carpeta: 'packages/domain-core',
        sonda: 'src',
      },
      {
        de: 'de proveedores',
        paquete: '@ncr/providers',
        carpeta: 'packages/providers',
        sonda: 'src',
      },
      // En el Edge se siembra en `test/`: es lo que su `tsconfig.json` no alcanzaba.
      { de: 'del Edge', paquete: '@ncr/edge', carpeta: 'apps/edge', sonda: 'test' },
    ];
    if (PROGRAMAS.every(({ carpeta }) => exigeControl(`${carpeta}/tsconfig.pruebas.json`))) {
      const espejo = join(banco, 'tipos-de-las-pruebas');
      cpSync(clon, espejo, { recursive: true, filter: (o) => o !== join(clon, '.git') });
      const enlazar = (relativo) => {
        const modulos = join(raiz, relativo, 'node_modules');
        if (existsSync(modulos) && existsSync(join(espejo, relativo))) {
          symlinkSync(modulos, join(espejo, relativo, 'node_modules'), 'dir');
        }
      };
      enlazar('.');
      for (const carpeta of ['apps', 'packages']) {
        for (const paquete of readdirSync(join(raiz, carpeta))) enlazar(join(carpeta, paquete));
      }
      const TSC = join(raiz, 'node_modules', 'typescript', 'bin', 'tsc');
      const tsc = (...args) =>
        correr(process.execPath, [TSC, ...args], { cwd: espejo, timeout: 300_000 });
      const compilar = (carpeta) => tsc('-p', `${carpeta}/tsconfig.pruebas.json`);

      // Las opciones EFECTIVAS (`--showConfig` resuelve el `extends`).
      const ESTRICTAS = [
        'strict',
        'noUncheckedIndexedAccess',
        'exactOptionalPropertyTypes',
        'noImplicitOverride',
        'noFallthroughCasesInSwitch',
        'noUnusedLocals',
        'noUnusedParameters',
      ];
      const opciones = (tsconfig) => {
        const r = tsc('-p', tsconfig, '--showConfig');
        return r.codigo === 0 ? (JSON.parse(r.salida).compilerOptions ?? {}) : {};
      };
      const relajadas = (carpeta) => {
        const delPaquete = opciones(`${carpeta}/tsconfig.json`);
        const deLasPruebas = opciones(`${carpeta}/tsconfig.pruebas.json`);
        const menos = ESTRICTAS.filter((o) => delPaquete[o] !== true || deLasPruebas[o] !== true);
        return deLasPruebas.noEmit === true ? menos : [...menos, 'noEmit'];
      };
      const rutaTurbo = join(espejo, 'turbo.json');
      const sinCache = (paquete) =>
        JSON.parse(readFileSync(rutaTurbo, 'utf8')).tasks?.[`${paquete}#typecheck`]?.cache ===
        false;

      for (const { de, paquete, carpeta } of PROGRAMAS) {
        const base = compilar(carpeta);
        base.codigo === 0
          ? ok(`la línea base compila: las pruebas ${de}, sin un error de tipos`)
          : mal(
              `la línea base ${de} NO compila (codigo ${base.codigo}): ${base.salida.slice(0, 400)}`,
            );
        const guion =
          JSON.parse(readFileSync(join(espejo, carpeta, 'package.json'), 'utf8')).scripts
            ?.typecheck ?? '';
        /\btsc -p tsconfig\.pruebas\.json\b/.test(guion)
          ? ok(
              `\`typecheck\` de ${paquete} compila las pruebas: \`pnpm typecheck\` (paso 4) las ve`,
            )
          : mal(`\`typecheck\` de ${paquete} ya no compila las pruebas: «${guion}»`);
        const menos = relajadas(carpeta);
        menos.length === 0
          ? ok(`las ${de}, con las mismas opciones estrictas que su paquete, y sin emitir`)
          : mal(`las pruebas ${de} se compilan con menos rigor: ${menos.join(', ')}`);
        sinCache(paquete)
          ? ok(`\`typecheck\` de ${paquete} no se sirve de la caché de turbo`)
          : mal(
              `\`typecheck\` de ${paquete} se sirve de la caché de turbo: un verde viejo pasa por nuevo`,
            );
      }

      // Y esas dos vigilancias, vistas fallar: un `false` heredado no pasa, y
      // quitar `cache: false` tampoco.
      const rutaConfig = join(espejo, 'apps/api/tsconfig.pruebas.json');
      const config = readFileSync(rutaConfig, 'utf8');
      const floja = JSON.parse(config);
      floja.compilerOptions.exactOptionalPropertyTypes = false;
      writeFileSync(rutaConfig, JSON.stringify(floja));
      relajadas('apps/api').includes('exactOptionalPropertyTypes')
        ? ok('una configuración de pruebas relajada se nombra')
        : mal('relajar `exactOptionalPropertyTypes` en las pruebas pasa inadvertido');
      writeFileSync(rutaConfig, config);
      const turbo = readFileSync(rutaTurbo, 'utf8');
      for (const paquete of ['@ncr/api', '@ncr/edge']) {
        const conCache = JSON.parse(turbo);
        delete conCache.tasks[`${paquete}#typecheck`];
        writeFileSync(rutaTurbo, JSON.stringify(conCache));
        sinCache(paquete)
          ? mal(`quitarle \`cache: false\` a ${paquete} en turbo.json pasa inadvertido`)
          : ok(`y quitarle \`cache: false\` a ${paquete} se nombra`);
        writeFileSync(rutaTurbo, turbo);
      }

      // Los defectos que abrieron las deudas, devueltos.
      const hogar = join(espejo, 'apps/api/test/dobles/hogar-en-memoria.ts');
      const doble = readFileSync(hogar, 'utf8');
      const sinBaja = doble.replace(/\n {2}async darDeBaja\([\s\S]*?\n {2}}\n/, '\n');
      if (sinBaja === doble) {
        mal('la sonda no encontró `darDeBaja` en el doble: no puede devolver el defecto');
      } else {
        writeFileSync(hogar, sinBaja);
        const a = compilar('apps/api');
        a.codigo !== 0 && /hogar-en-memoria\.ts\(\d+,\d+\): error TS2420/.test(a.salida)
          ? ok('el doble sin `darDeBaja` —el defecto de DT-15S1-03— rompe la compilación')
          : mal(`el doble sin \`darDeBaja\` NO se detecta (codigo ${a.codigo})`);
        writeFileSync(hogar, doble);
      }
      const apertura = join(
        espejo,
        'packages/providers/src/diagnostico/apertura-de-verificacion.test.ts',
      );
      const prueba = readFileSync(apertura, 'utf8');
      const conIndefinido = prueba.replace(
        '{ ...opciones, body: null }',
        '{ ...opciones, body: undefined }',
      );
      if (conIndefinido === prueba) {
        mal(
          'la sonda no encontró `body: null` en la prueba de proveedores: no puede devolver el defecto',
        );
      } else {
        writeFileSync(apertura, conIndefinido);
        const c = compilar('packages/providers');
        c.codigo !== 0 &&
        /apertura-de-verificacion\.test\.ts\(\d+,\d+\): error TS2345/.test(c.salida)
          ? ok(
              '`body: undefined` con `exactOptionalPropertyTypes` —uno de los tres de DT-15S1-C02— rompe la compilación',
            )
          : mal(
              `\`body: undefined\` en la prueba de proveedores NO se detecta (codigo ${c.codigo})`,
            );
        writeFileSync(apertura, prueba);
      }

      for (const { de, carpeta, sonda } of PROGRAMAS) {
        const fichero = join(espejo, carpeta, sonda, 'sonda-de-tipos.test.ts');
        writeFileSync(fichero, "export const n: number = 'no es un número';\n");
        const b = compilar(carpeta);
        b.codigo !== 0 && /sonda-de-tipos\.test\.ts\(1,\d+\): error TS2322/.test(b.salida)
          ? ok(`un error de tipos en una prueba de \`${sonda}/\` ${de} se detecta, con su fichero`)
          : mal(`un error de tipos en \`${carpeta}/${sonda}\` NO se detecta (codigo ${b.codigo})`);
        rmSync(fichero, { force: true });
      }
      rmSync(espejo, { recursive: true, force: true });
    }
  }

  console.log('\n▸ 28 · las cuatro grietas del escaneo de secretos (ETAPA 13)');
  {
    // (a) EL ÍNDICE, no el árbol · H-13-20.
    {
      // Línea base del modo índice, antes de plantar nada: un control que
      // siempre grita no distingue un hallazgo de su propio ruido.
      enClon('node', ['scripts/lib/escanear-secretos.mjs', '--indice']).codigo === 0
        ? ok('la línea base del modo índice está limpia')
        : mal('el modo índice marca un árbol limpio: falso positivo');

      const fuga = join(clon, 'sonda-indice.ts');
      writeFileSync(fuga, `export const k = 'sb_secret_${'S1t2A3g4E5d6O7n8'}';\n`);
      enClon('git', ['add', 'sonda-indice.ts']);
      writeFileSync(fuga, "export const k = 'inocuo';\n");

      const arbol = enClon('node', ['scripts/lib/escanear-secretos.mjs']);
      const indice = enClon('node', ['scripts/lib/escanear-secretos.mjs', '--indice']);
      arbol.codigo === 0 && indice.codigo !== 0 && /sonda-indice/.test(indice.salida)
        ? ok('lo PREPARADO se inspecciona aunque el árbol ya sea inocuo')
        : mal(
            `el modo índice no ve lo que se confirmaría (arbol ${arbol.codigo}, indice ${indice.codigo})`,
          );

      rmSync(fuga, { force: true });
      enClon('git', ['rm', '--cached', '--quiet', '--force', 'sonda-indice.ts']);
    }

    // (b) EL BYTE NUL ya no esconde el fichero · H-13-18.
    {
      const fuga = join(clon, 'sonda-nul.ts');
      writeFileSync(fuga, `export const k = 'sb_secret_${'N1u2L3b4Y5p6A7s8'}';\nconst x = '\0';\n`);
      enClon('git', ['add', '--intent-to-add', 'sonda-nul.ts']);
      const r = enClon('node', ['scripts/lib/escanear-secretos.mjs']);
      r.codigo !== 0 && /sonda-nul/.test(r.salida)
        ? ok('un byte NUL ya no hace invisible el fichero entero')
        : mal(`el NUL sigue ocultando la llave (codigo ${r.codigo})`);
      rmSync(fuga, { force: true });
      enClon('git', ['rm', '--cached', '--quiet', '--force', 'sonda-nul.ts']);
    }

    // (c) LOS SECRETOS PROPIOS del proyecto · H-13-19, con su contraprueba.
    {
      const fuga = join(clon, 'sonda-propios.ts');
      // El valor se ARMA por trozos: escrito entero, el propio escáner
      // detectaría este fichero y el banco no podría ni arrancar. Es la misma
      // precaución que toman las sondas de Supabase más arriba.
      const material = `kJ8xQ2mVw9pL4nR7${'tY1zB6cF3hD5gS0a'}${'M8eU2iO4qW7v'}`;
      writeFileSync(fuga, `export const INGESTA_FIRMA_SECRETO = '${material}';\n`);
      enClon('git', ['add', '--intent-to-add', 'sonda-propios.ts']);
      const r = enClon('node', ['scripts/lib/escanear-secretos.mjs']);
      r.codigo !== 0 && /sonda-propios/.test(r.salida)
        ? ok('la llave que firma la ingesta se detecta')
        : mal(`INGESTA_FIRMA_SECRETO con valor real NO se detecta (codigo ${r.codigo})`);

      // Y la OTRA forma que toma una llave real: hexadecimal largo, sin una
      // sola mayúscula. La heurística la reconoce por su forma, no por su
      // nombre —era el ejemplo que destapó H-13-19—.
      writeFileSync(
        fuga,
        `export const BIOMETRIA_LLAVE = '${'a91f3c7e28b6d04a'}${'5f8c1e93b27d60a4'}${'f1e8c35b90d27a46'}';\n`,
      );
      enClon('node', ['scripts/lib/escanear-secretos.mjs']).codigo !== 0
        ? ok('y la llave hexadecimal también, aunque no lleve mayúsculas')
        : mal('una llave hexadecimal de 48 caracteres NO se detecta');

      // Contraprueba: el marcador legible que hay por todo el árbol NO puede
      // gritar, o el control se vuelve inservible a la semana.
      writeFileSync(
        fuga,
        "export const INGESTA_FIRMA_SECRETO = 'un-secreto-de-al-menos-treinta-y-dos';\n",
      );
      enClon('node', ['scripts/lib/escanear-secretos.mjs']).codigo === 0
        ? ok('y un marcador legible no produce ruido')
        : mal('el control marca un marcador de prueba: sería ruido en cada commit');

      rmSync(fuga, { force: true });
      enClon('git', ['rm', '--cached', '--quiet', '--force', 'sonda-propios.ts']);
    }

    // (c bis) MÁS DE VEINTE HALLAZGOS SE RECORTAN, Y SE DICE CUÁNTOS FALTAN.
    //         Un volcado de doscientas líneas en el gancho de pre-commit es
    //         ilegible, y un recorte que no avisa es peor que el volcado.
    {
      const muchas = join(clon, 'sonda-muchas.ts');
      const lineas = Array.from(
        { length: 25 },
        (_, i) => `export const k${i} = 'sb_secret_${'A1b2C3d4E5f6G7h'}${i}';`,
      );
      writeFileSync(muchas, `${lineas.join('\n')}\n`);
      enClon('git', ['add', '--intent-to-add', 'sonda-muchas.ts']);
      const r = enClon('node', ['scripts/lib/escanear-secretos.mjs']);
      r.codigo !== 0 && /y 5 más/.test(r.salida)
        ? ok('con 25 hallazgos se muestran 20 y se dice que faltan 5')
        : mal(`el recorte de la salida no avisa de cuántos faltan (codigo ${r.codigo})`);
      rmSync(muchas, { force: true });
      enClon('git', ['rm', '--cached', '--quiet', '--force', 'sonda-muchas.ts']);
    }

    // (c ter) LO QUE NO SE PUEDE LEER NO SE INVENTA: ni se cuelga, ni pasa por
    //         bueno en silencio. Dos caminos que el escáner tiene que sortear
    //         sin morirse — un enlace roto y un fichero desmedido —, y que
    //         existen de verdad en árboles reales.
    {
      const roto = join(clon, 'sonda-enlace-roto.ts');
      symlinkSync(join(clon, 'no-existe-en-ninguna-parte.ts'), roto);
      enClon('git', ['add', 'sonda-enlace-roto.ts']);

      const grande = join(clon, 'sonda-desmedida.bin');
      writeFileSync(grande, Buffer.alloc(6 * 1024 * 1024, 0x41));
      enClon('git', ['add', '--intent-to-add', 'sonda-desmedida.bin']);

      const r = enClon('node', ['scripts/lib/escanear-secretos.mjs']);
      r.codigo === 0
        ? ok('un enlace roto y un fichero de 6 MB no rompen el escaneo')
        : mal(
            `el escaneo se cae con un enlace roto o un fichero grande: ${r.salida.slice(0, 120)}`,
          );

      rmSync(roto, { force: true });
      rmSync(grande, { force: true });
      enClon('git', ['rm', '--cached', '--quiet', '--force', 'sonda-enlace-roto.ts']);
      enClon('git', ['rm', '--cached', '--quiet', '--force', 'sonda-desmedida.bin']);
    }

    // (d) LO QUE `.gitignore` PROHÍBE Y ESTÁ VERSIONADO · H-13-23.
    {
      const fuga = join(clon, 'sonda.pem');
      writeFileSync(fuga, 'no es una llave, pero la extensión está prohibida\n');
      enClon('git', ['add', '--force', 'sonda.pem']);
      const r = enClon('node', ['scripts/lib/escanear-secretos.mjs']);
      r.codigo !== 0 && /sonda\.pem/.test(r.salida)
        ? ok('un fichero ignorado por .gitignore y versionado se detecta')
        : mal(`un *.pem versionado con --force pasa inadvertido (codigo ${r.codigo})`);
      rmSync(fuga, { force: true });
      enClon('git', ['rm', '--cached', '--quiet', '--force', 'sonda.pem']);
    }

    // (e) EL HISTORIAL · H-13-17. Necesita clon PROFUNDO: el banco es --depth 1
    //     y en un solo commit no hay historia que revisar. Es justo el error que
    //     el propio control comete en CI si el checkout no trae `fetch-depth: 0`.
    {
      const profundo = join(banco, 'historia');
      correr('git', ['clone', '--quiet', '--no-hardlinks', raiz, profundo]);
      cpSync(
        join(raiz, 'scripts/lib/escanear-secretos.mjs'),
        join(profundo, 'scripts/lib/escanear-secretos.mjs'),
      );
      const enProfundo = (args) =>
        correr('node', ['scripts/lib/escanear-secretos.mjs', ...args], { cwd: profundo });

      enProfundo(['--historial']).codigo === 0
        ? ok('la línea base del historial está limpia')
        : mal('el historial del repositorio YA tiene un hallazgo real sin declarar');

      correr('git', ['config', 'user.email', 'sonda@ncr.invalid'], { cwd: profundo });
      correr('git', ['config', 'user.name', 'sonda'], { cwd: profundo });
      writeFileSync(
        join(profundo, 'sonda-historia.ts'),
        `export const k = 'sb_secret_${'H1i2S3t4O5r6I7a8'}';\n`,
      );
      correr('git', ['add', 'sonda-historia.ts'], { cwd: profundo });
      correr('git', ['commit', '--quiet', '-m', 'sonda'], { cwd: profundo });
      correr('git', ['rm', '--quiet', 'sonda-historia.ts'], { cwd: profundo });
      correr('git', ['commit', '--quiet', '-m', 'y se retira'], { cwd: profundo });

      const arbol = enProfundo([]);
      const historia = enProfundo(['--historial']);
      arbol.codigo === 0 && historia.codigo !== 0 && /sonda-historia/.test(historia.salida)
        ? ok('un secreto retirado del árbol SIGUE apareciendo en el historial')
        : mal(
            `el historial no lo ve (arbol ${arbol.codigo}, historial ${historia.codigo}): ` +
              'borrarlo en el commit siguiente no retira la llave',
          );
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
  // 15-S5 · DT-15S2-11 · exitCode y no exit: la salida llega entera al lector (patrón de metricas.mjs).
  process.exitCode = 1;
} else {
  console.log(
    '\nPRUEBAS NEGATIVAS: los 35 controles detectan su violación y aceptan el caso legítimo, ' +
      'sin tocar el árbol',
  );
}
