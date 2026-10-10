/**
 * ═════════════════════════════════════════════════════════════════════════════
 * SONDA 7 · UNA SUITE INTERMITENTE NO PASA POR ESTABLE
 *
 * Movida tal cual desde `pruebas-negativas.mjs` en la 15-S5, sin cambiar una
 * aserción: ese fichero pasa de 300 líneas y no puede crecer, y la 15-S5 añade
 * sondas a este control (`ficheros-caidos.mjs`). Vive en `sondas/` y, como la
 * suite negativa, no se mide en `ramas-de-los-controles.mjs`: sus `mal(...)` no
 * corren cuando todo va bien. `control` llega como literal desde la suite, que
 * es donde `controles-sin-prueba-negativa.mjs` lo busca.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { chmodSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const sondasDeEstabilidad = ({ raiz, banco, correr, ok, mal, control }) => {
  /**
   * Sonda de la ETAPA 07. El control de estabilidad ejecuta una orden varias
   * veces y compara; aquí la orden es un guion que **alterna** su resultado,
   * que es la forma exacta de la prueba intermitente que motivó el control.
   *
   * Se sustituye la suite por un guion en vez de invocar Vitest tres veces:
   * lo que se pone a prueba es la comparación de firmas, y hacerlo contra la
   * suite real costaría minutos en cada verificación sin comprobar nada más.
   *
   * DESDE D-113 (ETAPA 15-B) el guion falso además **escribe un informe JSON**
   * en `.informes-de-prueba/`, porque es de ahí —y ya no de la consola— de
   * donde el control saca el nombre de la roja. Escribirlo es justo lo que
   * hace Vitest en cada paquete.
   */
  const informes = join(raiz, '.informes-de-prueba');
  const informeSonda = join(informes, 'sonda.json');

  /** Línea de bash que deja un informe JSON con una roja nombrada. */
  const escribeInformeRojo = [
    `mkdir -p "${informes}"`,
    `cat > "${informeSonda}" <<'JSON'`,
    JSON.stringify(
      {
        numTotalTests: 85,
        numFailedTests: 1,
        testResults: [
          {
            name: join(raiz, 'test/zonas.e2e.test.ts'),
            assertionResults: [
              {
                status: 'failed',
                fullName: 'zonas > lista las zonas',
                title: 'lista las zonas',
                failureMessages: ['expected 200 to be 403'],
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
    'JSON',
  ];
  const escribeInformeVerde = [
    `mkdir -p "${informes}"`,
    `cat > "${informeSonda}" <<'JSON'`,
    JSON.stringify({ numTotalTests: 85, numFailedTests: 0, testResults: [] }, null, 2),
    'JSON',
  ];

  const contador = join(banco, 'contador');
  const inestable = join(banco, 'suite-inestable.sh');
  writeFileSync(
    inestable,
    [
      '#!/usr/bin/env bash',
      `n=$(cat "${contador}" 2>/dev/null || echo 0)`,
      `echo $((n + 1)) > "${contador}"`,
      'if [ $((n % 2)) -eq 0 ]; then',
      ...escribeInformeVerde,
      '  echo "   Tests  85 passed (85)"; exit 0',
      'else',
      ...escribeInformeRojo,
      // LA CONSOLA NO DICE QUÉ FALLÓ: ni `×` ni `FAIL`. Es exactamente la
      // situación de la ETAPA 13 —Vitest cambia de reportero cuando `CI`
      // está puesto, y este paso siempre pone `CI=1`— en la que el control
      // informaba «en rojo» y debajo no había nada. Si el nombre sale de
      // todas formas, sale del informe.
      '  echo "   Tests  1 failed | 84 passed (85)"; exit 1',
      'fi',
    ].join('\n'),
  );
  chmodSync(inestable, 0o755);

  const r = correr('node', [control, '--repeticiones', '2', '--comando', inestable]);
  r.codigo !== 0 && /NO coincide|terminó en rojo/.test(r.salida)
    ? ok('detectada: dos corridas con resultado distinto son un fallo')
    : mal(`NO detectada (codigo ${r.codigo})`);

  /**
   * D-113 · EL NOMBRE SALE DEL INFORME, NO DE LA CONSOLA.
   *
   * La consola de la sonda no contiene ni `×` ni `FAIL`: el raspado antiguo
   * no habría podido sacar nada. Que el nombre completo aparezca demuestra
   * que se leyó el JSON.
   */
  /zonas > lista las zonas/.test(r.salida) && /sonda ›/.test(r.salida)
    ? ok('y la roja se nombra desde el informe JSON, con la consola muda')
    : mal('la roja no se nombra: el control informa «en rojo» y deja a oscuras');

  /**
   * EL CASO INCÓMODO, AHORA CON DIAGNÓSTICO ÚTIL. Antes, una roja sin nombre
   * obligaba al control a confesar «es un defecto de ESTE control». Ya no lo
   * es: si no hay informe, la suite **no llegó a ejecutarse**, y eso es un
   * fallo de arranque, no una prueba roja. El control tiene que decir eso.
   */
  const contador2 = join(banco, 'contador-sin-informe');
  const sinInforme = join(banco, 'suite-sin-informe.sh');
  writeFileSync(
    sinInforme,
    [
      '#!/usr/bin/env bash',
      `n=$(cat "${contador2}" 2>/dev/null || echo 0)`,
      `echo $((n + 1)) > "${contador2}"`,
      'if [ $((n % 2)) -eq 0 ]; then',
      ...escribeInformeVerde,
      '  echo "   Tests  85 passed (85)"; exit 0',
      'else',
      '  echo "   Tests  1 failed | 84 passed (85)"; exit 1',
      'fi',
    ].join('\n'),
  );
  chmodSync(sinInforme, 0o755);
  const rsin = correr('node', [control, '--repeticiones', '2', '--comando', sinInforme]);
  rsin.codigo !== 0 && /no llegó a ejecutarse/.test(rsin.salida)
    ? ok('y sin informe lo llama por su nombre: fallo de arranque, no roja anónima')
    : mal(`una corrida sin informe se informa en silencio (codigo ${rsin.codigo})`);

  /**
   * Y el tercero: informe escrito, ninguna aserción en rojo, código ≠ 0. El
   * fallo está FUERA de las pruebas —umbral de cobertura, error sin manejar,
   * un paso posterior de turbo— y mandar a mirar las pruebas sería mandar al
   * sitio equivocado.
   */
  const contador3 = join(banco, 'contador-fuera');
  const fuera = join(banco, 'suite-roja-fuera-de-las-pruebas.sh');
  writeFileSync(
    fuera,
    [
      '#!/usr/bin/env bash',
      `n=$(cat "${contador3}" 2>/dev/null || echo 0)`,
      `echo $((n + 1)) > "${contador3}"`,
      ...escribeInformeVerde,
      'if [ $((n % 2)) -eq 0 ]; then',
      '  echo "   Tests  85 passed (85)"; exit 0',
      'else',
      '  echo "   Tests  85 passed (85)"',
      '  echo "ERROR: coverage threshold not met"; exit 1',
      'fi',
    ].join('\n'),
  );
  chmodSync(fuera, 0o755);
  const rfuera = correr('node', [control, '--repeticiones', '2', '--comando', fuera]);
  rfuera.codigo !== 0 && /fuera de las pruebas/.test(rfuera.salida)
    ? ok('y un rojo sin aserciones rojas se atribuye a donde viene, no a las pruebas')
    : mal(`un fallo externo se confunde con una roja (codigo ${rfuera.codigo})`);

  /**
   * Y el informe ILEGIBLE, que es la cuarta situación y no una variante de
   * las otras tres: el fichero existe, la suite lo escribió, y no se puede
   * leer —truncado por un proceso que murió a mitad, disco lleno—. Callarlo
   * dejaría al control diciendo «ninguna aserción en rojo» sobre un informe
   * que nadie pudo abrir.
   */
  const contador4 = join(banco, 'contador-ilegible');
  const ilegible = join(banco, 'suite-informe-ilegible.sh');
  writeFileSync(
    ilegible,
    [
      '#!/usr/bin/env bash',
      `n=$(cat "${contador4}" 2>/dev/null || echo 0)`,
      `echo $((n + 1)) > "${contador4}"`,
      `mkdir -p "${informes}"`,
      `printf '{ \"testResults\": [' > "${informeSonda}"`,
      'if [ $((n % 2)) -eq 0 ]; then',
      '  echo "   Tests  85 passed (85)"; exit 0',
      'else',
      '  echo "   Tests  1 failed | 84 passed (85)"; exit 1',
      'fi',
    ].join('\n'),
  );
  chmodSync(ilegible, 0o755);
  const rilegible = correr('node', [control, '--repeticiones', '2', '--comando', ilegible]);
  rilegible.codigo !== 0 && /informe JSON ilegible/.test(rilegible.salida)
    ? ok('y un informe JSON que no se puede leer se NOMBRA, no se descarta')
    : mal(`un informe ilegible pasa por «sin rojas» (codigo ${rilegible.codigo})`);

  /**
   * Y con MUCHAS rojas: se enseñan las primeras y se dice cuántas faltan. Un
   * volcado de doscientos nombres no se lee, y cortar sin decirlo hace creer
   * que eran ocho. Es la misma disciplina que el escaneo de secretos ya
   * aplica con sus veinte hallazgos.
   *
   * La misma sonda cubre el informe cuyo `name` falta: ahí el control dice
   * «(fichero desconocido)» en vez de dejar el nombre a medias.
   */
  const contador5 = join(banco, 'contador-muchas');
  const muchas = join(banco, 'suite-muchas-rojas.sh');
  const informeConMuchas = JSON.stringify(
    {
      numTotalTests: 100,
      numFailedTests: 9,
      testResults: [
        {
          // Sin `name` a propósito.
          assertionResults: Array.from({ length: 9 }, (_, i) => ({
            status: 'failed',
            fullName: `sonda > roja numero ${String(i + 1)}`,
            title: `roja numero ${String(i + 1)}`,
            failureMessages: [],
          })),
        },
      ],
    },
    null,
    2,
  );
  writeFileSync(
    muchas,
    [
      '#!/usr/bin/env bash',
      `n=$(cat "${contador5}" 2>/dev/null || echo 0)`,
      `echo $((n + 1)) > "${contador5}"`,
      `mkdir -p "${informes}"`,
      'if [ $((n % 2)) -eq 0 ]; then',
      ...escribeInformeVerde,
      '  echo "   Tests  100 passed (100)"; exit 0',
      'else',
      `cat > "${informeSonda}" <<'JSON'`,
      informeConMuchas,
      'JSON',
      '  echo "   Tests  9 failed | 91 passed (100)"; exit 1',
      'fi',
    ].join('\n'),
  );
  chmodSync(muchas, 0o755);
  const rmuchas = correr('node', [control, '--repeticiones', '2', '--comando', muchas]);
  rmuchas.codigo !== 0 && /y 1 más/.test(rmuchas.salida)
    ? ok('con nueve rojas se muestran ocho y se dice que falta una')
    : mal(`un listado largo de rojas se corta sin decirlo (codigo ${rmuchas.codigo})`);
  /fichero desconocido/.test(rmuchas.salida)
    ? ok('y un informe sin fichero lo dice, en vez de dejar el nombre a medias')
    : mal('un informe sin `name` produce un nombre incompleto');

  // Y el reverso: un control que fallara siempre tampoco serviría de nada.
  const estable = join(banco, 'suite-estable.sh');
  writeFileSync(
    estable,
    [
      '#!/usr/bin/env bash',
      ...escribeInformeVerde,
      'echo "   Tests  85 passed (85)"',
      'exit 0',
    ].join('\n'),
  );
  chmodSync(estable, 0o755);
  correr('node', [control, '--repeticiones', '2', '--comando', estable]).codigo === 0
    ? ok('una suite reproducible sí pasa')
    : mal('el control rechaza una suite que es estable');

  // El banco no deja residuos: el informe de la sonda se retira. Está en
  // `.gitignore`, así que no alteraría el árbol, pero dejarlo confundiría la
  // siguiente lectura de `.informes-de-prueba/`.
  rmSync(informeSonda, { force: true });
  // 15-S5 · y el archivo de las pasadas que deja el control desde DT-15S2-10.
  rmSync(join(raiz, '.informes-de-prueba', 'estabilidad'), { recursive: true, force: true });
};
