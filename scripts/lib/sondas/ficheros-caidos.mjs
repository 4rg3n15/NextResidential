/**
 * ═════════════════════════════════════════════════════════════════════════════
 * SONDA 7 bis · 15-S5 · DT-15S2-10 · EL FICHERO QUE CAE FUERA DE SUS ASERCIONES
 * SALE NOMBRADO
 *
 * Tres pasadas de una suite falsa con DIEZ ficheros; en la segunda pasa algo
 * que vitest no cuenta como aserción roja, y la consola calla:
 *
 *  (a) `test/b` cae —su `beforeAll` lanza— y `test/d` no carga sin motivo;
 *  (b) nueve ficheros desaparecen del informe con el mismo código de salida;
 *  (c) el informe de un paquete entero no se escribe: vitest murió.
 *
 * Y (d): los informes de las tres pasadas quedan, cada uno en la suya; (e): un
 * informe suelto de otra corrida no entra en la primera.
 *
 * Vive en `sondas/` y no en `pruebas-negativas.mjs`, que pasa de 300 líneas y
 * no puede crecer; y como ella, no se mide en `ramas-de-los-controles.mjs`: sus
 * `mal(...)` no corren cuando todo va bien. `control` llega como literal desde
 * la suite, que es donde `controles-sin-prueba-negativa.mjs` lo busca.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LETRAS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
const verde = (nombre) => [{ status: 'passed', fullName: `${nombre} > uno`, title: 'uno' }];

/** Un fichero del informe: el `c` va siempre omitido, como un `describe.skipIf`. */
const fichero = (raiz, letra, extra = {}) => ({
  name: join(raiz, `test/${letra}.test.ts`),
  status: letra === 'c' ? 'skipped' : 'passed',
  assertionResults:
    letra === 'c' ? [{ status: 'skipped', fullName: 'c > uno', title: 'uno' }] : verde(letra),
  ...extra,
});

const informe = (ficheros) =>
  JSON.stringify({ numTotalTests: ficheros.length, testResults: ficheros });
const sano = (raiz) => informe(LETRAS.map((l) => fichero(raiz, l)));

/**
 * La suite falsa: en la pasada 2 escribe `segunda` (pares fichero → texto) y la
 * consola dice `consola`; en las demás, el informe sano. Código 0 si `codigo`.
 */
const suite = ({ raiz, banco, informes, nombre, segunda, consola, codigo }) => {
  const contador = join(banco, `contador-caidos-${nombre}`);
  const guion = join(banco, `suite-caidos-${nombre}.sh`);
  const escribir = (pares) =>
    pares.flatMap(([destino, texto]) => [
      `cat > "${join(informes, destino)}" <<'JSON'`,
      texto,
      'JSON',
    ]);
  writeFileSync(
    guion,
    [
      '#!/usr/bin/env bash',
      `n=$(cat "${contador}" 2>/dev/null || echo 0)`,
      `echo $((n + 1)) > "${contador}"`,
      `mkdir -p "${informes}"`,
      'if [ "$n" -eq 1 ]; then',
      ...escribir(segunda),
      `  echo "${consola}"; exit ${String(codigo)}`,
      'else',
      ...escribir([['sonda.json', sano(raiz)]]),
      '  echo "   Tests  9 passed | 1 skipped (10)"; exit 0',
      'fi',
    ].join('\n'),
  );
  chmodSync(guion, 0o755);
  return guion;
};

export const sondasDeFicherosCaidos = ({ raiz, banco, correr, ok, mal, control }) => {
  const informes = join(raiz, '.informes-de-prueba');
  const archivo = join(informes, 'estabilidad');
  const tres = (guion) => correr('node', [control, '--repeticiones', '3', '--comando', guion]);

  // (a) b cae con su motivo y d cae sin él; ninguna aserción roja, y la consola calla.
  const caido = informe([
    ...LETRAS.filter((l) => l !== 'b' && l !== 'd').map((l) => fichero(raiz, l)),
    fichero(raiz, 'b', {
      status: 'failed',
      message: 'Error: beforeAll a propósito\n    at test/b.test.ts:2',
      assertionResults: [{ status: 'skipped', fullName: 'b > uno', title: 'uno' }],
    }),
    { name: join(raiz, 'test/d.test.ts'), status: 'failed' },
  ]);
  const ra = tres(
    suite({
      raiz,
      banco,
      informes,
      nombre: 'caido',
      segunda: [['sonda.json', caido]],
      consola: '   Tests  8 passed | 2 skipped (10)',
      codigo: 1,
    }),
  );
  ra.codigo !== 0 &&
  /pasada 2 · caído: sonda › test\/b\.test\.ts → Error: beforeAll a propósito/.test(ra.salida)
    ? ok('un fichero cuyo beforeAll lanza sale nombrado, con el motivo de vitest')
    : mal(`el fichero caído no se nombra (codigo ${String(ra.codigo)})`);
  /pasada 2 · caído: sonda › test\/d\.test\.ts → \(vitest no dio motivo\)/.test(ra.salida)
    ? ok('y uno caído sin motivo lo dice, en vez de dejar la flecha vacía')
    : mal('un fichero caído sin motivo sale a medias');
  /pasada 1: 10 ficheros recogidos · 9 ejecutados · 1 omitidos · 0 caídos/.test(ra.salida) &&
  /pasada 2: 10 ficheros recogidos · 7 ejecutados · 1 omitidos · 2 caídos/.test(ra.salida)
    ? ok('por pasada: recogidos, ejecutados, omitidos y caídos')
    : mal('el recuento por pasada falta o no cuadra');

  // (d) cada pasada conserva SUS informes: la siguiente no los pisa.
  const leer = (n) => {
    const ruta = join(archivo, `pasada-${String(n)}`, 'sonda.json');
    return existsSync(ruta) ? readFileSync(ruta, 'utf8') : '';
  };
  leer(2).includes('beforeAll a propósito') && leer(1) !== '' && !leer(3).includes('beforeAll')
    ? ok('y los informes de las tres pasadas quedan, cada uno en la suya')
    : mal('el informe de una pasada se pierde o lo pisa la siguiente');

  // (b) nueve ficheros desaparecen del informe con el MISMO código y la misma consola.
  const ra2 = tres(
    suite({
      raiz,
      banco,
      informes,
      nombre: 'desaparecen',
      segunda: [['sonda.json', informe([fichero(raiz, 'a')])]],
      consola: '   Tests  9 passed | 1 skipped (10)',
      codigo: 0,
    }),
  );
  ra2.codigo !== 0 &&
  /pasada 2 · falta: sonda › test\/b\.test\.ts/.test(ra2.salida) &&
  /… y 1 más/.test(ra2.salida)
    ? ok('los ficheros que faltan en una pasada salen nombrados, ocho y «… y 1 más»')
    : mal(
        `un fichero que desaparece de una pasada pasa en silencio (codigo ${String(ra2.codigo)})`,
      );

  // (c) vitest muere en un paquete: su informe no se escribe; el otro sí, sin `testResults`.
  const ra3 = tres(
    suite({
      raiz,
      banco,
      informes,
      nombre: 'sin-informe',
      segunda: [['otro.json', JSON.stringify({ numTotalTests: 0 })]],
      consola: 'Error: Channel closed',
      codigo: 1,
    }),
  );
  ra3.codigo !== 0 &&
  /pasada 2 · sin informe: sonda — vitest murió antes de escribirlo → Error: Channel closed/.test(
    ra3.salida,
  )
    ? ok('el paquete sin informe sale nombrado, con el motivo de la consola')
    : mal(`un paquete que muere sin informe no se nombra (codigo ${String(ra3.codigo)})`);

  // (e) un informe suelto de otra corrida —el del paso 7, uno a medias— no entra en la pasada 1.
  writeFileSync(
    join(informes, 'viejo.json'),
    informe([{ name: join(raiz, 'test/x.test.ts'), status: 'failed' }]),
  );
  const ra4 = tres(
    suite({
      raiz,
      banco,
      informes,
      nombre: 'estable',
      segunda: [['sonda.json', sano(raiz)]],
      consola: '   Tests  9 passed | 1 skipped (10)',
      codigo: 0,
    }),
  );
  ra4.codigo === 0 && !/viejo|x\.test\.ts/.test(ra4.salida)
    ? ok('un informe suelto de antes no entra en la primera pasada, y tres pasadas sanas pasan')
    : mal(`un informe de otra corrida se cuela en la pasada 1 (codigo ${String(ra4.codigo)})`);

  rmSync(archivo, { recursive: true, force: true });
  for (const f of ['sonda.json', 'otro.json']) rmSync(join(informes, f), { force: true });
};
