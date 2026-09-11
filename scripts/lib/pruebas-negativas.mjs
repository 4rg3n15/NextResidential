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
  rmSync,
  readFileSync,
  cpSync,
  chmodSync,
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

  console.log('\n▸ 4c · un `dist/` VIEJO de un paquete interno no puede compilar una app (D-65)');
  {
    /**
     * El defecto exacto que reportó el usuario: `pnpm --filter @ncr/api build`
     * daba `TS2339: Property 'rehidratar' does not exist`, sobre un método que
     * SÍ existía en el dominio. El `dist/` de `@ncr/domain-core` era de antes
     * de la etapa que lo añadió, y la API compila contra ese `dist/`, no contra
     * el fuente.
     *
     * Aquí se construye el dominio, se le AÑADE un método al fuente **sin
     * reconstruirlo** —es decir, se envejece el `dist/` a propósito— y se exige
     * que la app que lo usa siga compilando: con `tsc -b` y referencias de
     * proyecto, la dependencia se reconstruye sola. Si alguien volviera a
     * `tsc -p`, esto falla.
     *
     * La distinción con el paso 3 del verificador importa: aquél parte de CERO
     * `dist/` y detecta el caso «no arrastra dependencias»; éste detecta el
     * caso «hay dist, pero es viejo», que es el que da un error incomprensible
     * en vez de un «módulo no encontrado».
     */
    const dominio = join(clon, 'packages', 'domain-core');
    const marcador = join(dominio, 'src', 'sonda-envejecida.ts');
    const barril = join(dominio, 'src', 'index.ts');

    // 1 · dist construido SIN el símbolo nuevo.
    const previo = enClon('pnpm', ['--filter', '@ncr/domain-core', 'build']);
    if (previo.codigo !== 0) {
      mal('no se pudo preparar el banco (build del dominio)');
    } else {
      // 2 · se añade el símbolo al FUENTE y se exporta, sin reconstruir.
      writeFileSync(marcador, 'export const sondaEnvejecida = (): number => 42;\n');
      const barrilOriginal = readFileSync(barril, 'utf8');
      writeFileSync(barril, `${barrilOriginal}export * from './sonda-envejecida';\n`);

      // 3 · una app que lo usa debe compilar igual: `tsc -b` reconstruye.
      const consumidor = join(clon, 'apps', 'api', 'src', 'sonda-envejecida-uso.ts');
      writeFileSync(
        consumidor,
        "import { sondaEnvejecida } from '@ncr/domain-core';\nexport const x = sondaEnvejecida();\n",
      );
      const r = enClon('pnpm', ['--filter', '@ncr/api', 'build']);
      if (r.codigo === 0) {
        ok('la app reconstruye la dependencia envejecida y compila');
      } else {
        mal('un dist/ viejo rompe el build por paquete (¿se volvió a `tsc -p`?)');
        console.log(
          `     ${(r.salida || '').split('\n').filter((l) => /error TS/.test(l))[0] ?? ''}`,
        );
      }
      rmSync(consumidor, { force: true });
      rmSync(marcador, { force: true });
      writeFileSync(barril, barrilOriginal);
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
  '\nPRUEBAS NEGATIVAS: los 15 controles detectan su violación y aceptan el caso legítimo, ' +
    'sin tocar el árbol',
);
