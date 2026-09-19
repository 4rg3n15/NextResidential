#!/usr/bin/env node
/**
 * EL CONTROL GENÉRICO · «un control que nadie ha visto fallar no es un control».
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ FAMILIA DE DEFECTOS CIERRA, Y POR QUÉ HACÍA FALTA
 *
 * Veinte defectos de este proyecto son el mismo defecto: **el control existe
 * pero no comprueba lo que uno cree**. D-79 decidía «suite en verde» leyendo
 * texto y no el código de salida. D-80 leía `false` justo cuando encontraba algo
 * —`echo | grep -q` devuelve 141 bajo `pipefail`—. D-81 aceptaba `^` y nunca lo
 * interpretaba, así que daba por buena cualquier versión. D-82 resolvía `dart`
 * desde el PATH en vez del SDK. Ninguno se descubrió por diseño: los cuatro
 * salieron por casualidad, al tocar otra cosa.
 *
 * Lo que tienen en común no es el tema. Es que **nadie los había visto fallar**.
 * Un control solo demuestra algo si se ha comprobado que se pone rojo cuando
 * debe, y eso es justo lo que hace `pruebas-negativas.mjs`: introduce la
 * violación y exige la detección.
 *
 * El hueco era que esa lista se mantenía A MANO. Un control nuevo podía nacer,
 * entrar en el verificador y ser reportado como «✓» sin que jamás se hubiera
 * comprobado que sabe decir «✗». Así nació D-81: la comprobación de versión era
 * nueva, no tenía prueba negativa, y su rama del acento circunflejo devolvía
 * verde para todo.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CÓMO SE COMPRUEBA — MECÁNICAMENTE, SIN TABLA QUE MANTENER
 *
 * No hay registro que rellenar a mano, porque un registro a mano tiene el mismo
 * problema que la lista que reemplaza. Se derivan los dos conjuntos del código:
 *
 *   A · los controles que EJECUTA el verificador  → `scripts/verificar-etapa.sh`
 *       y los `.sh` que este invoca a su vez.
 *   B · los controles que EJERCITA la suite negativa → `pruebas-negativas.mjs`.
 *
 * Y se exige A ⊆ B. Un control nuevo cableado al verificador sin prueba negativa
 * aparece en el instante en que se cablea.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * DOS LISTAS, Y LA DIFERENCIA ENTRE ELLAS IMPORTA
 *
 *   `EXENTOS` — no son controles: no emiten veredicto. Un envoltorio de tiempo
 *   límite no puede «fallar cuando debe» porque no juzga nada. Salir de aquí
 *   exige un motivo escrito.
 *
 *   `DEUDA` — sí son controles, y NO tienen prueba negativa. Es deuda real,
 *   declarada, con fecha y con la etapa que la cierra. **La lista solo puede
 *   encoger**: si crece, el paso se pone rojo; si una entrada ya no hace falta
 *   —porque alguien escribió su prueba— también se pone rojo, para que no queden
 *   exenciones zombis protegiendo a un control que ya no las necesita.
 *
 * Esto es un trinquete, no una absolución: el número sale en pantalla en cada
 * ejecución y no puede subir.
 *
 *   node scripts/lib/controles-sin-prueba-negativa.mjs
 */
import { readFileSync, existsSync } from 'node:fs';

const VERIFICADOR = 'scripts/verificar-etapa.sh';
const NEGATIVAS = 'scripts/lib/pruebas-negativas.mjs';

/** No emiten veredicto: no hay nada que pueda ponerse rojo. */
const EXENTOS = new Map([
  ['scripts/lib/con-limite.mjs', 'envoltorio de tiempo límite: no juzga, solo mata'],
  ['scripts/lib/pruebas-negativas.mjs', 'ES la suite negativa; probarse a sí misma no añade nada'],
]);

/**
 * Controles sin prueba negativa. Declarado el 2026-09-19, se cierra en 11-B.
 * SOLO PUEDE ENCOGER.
 */
const DEUDA = new Map([
  ['scripts/lib/cliente-dart-desfasado.mjs', 'aquí vivió D-82; se prueba en 11-B'],
  ['scripts/lib/flutter-sin-secretos.mjs', 'inyectar un secreto en un .dart y exigir detección'],
  ['scripts/lib/cobertura-flutter.mjs', 'bajar un umbral y exigir que lo note'],
  [
    'scripts/lib/verificar-escritura.mjs',
    'ejercido a mano como usuario sin permisos, no en la suite',
  ],
  ['scripts/lib/verificar-base-de-pruebas.mjs', 'apuntar a un puerto muerto y exigir detección'],
  ['apps/mobile/e2e/recorrido-web.mjs', 'romper una pantalla y exigir que el recorrido lo vea'],
  ['scripts/lib/dependencias-acotadas.mjs', 'nacido hoy con este mismo control; se prueba en 11-B'],
  [
    'scripts/lib/metricas.mjs',
    'es un control —el paso 7 mira su código de salida— y estaba mal exento; su prueba\n     negativa exige correr la suite entera, así que va con la granularidad de rama de 11-B',
  ],
]);

const RUTA = /(?:scripts\/lib|e2e|apps\/mobile\/e2e)\/[a-z0-9-]+\.mjs/g;

/** Todo lo que el verificador ejecuta, incluidos los `.sh` que invoca. */
const invocados = () => {
  const vistos = new Set();
  const porVer = [VERIFICADOR];
  const hechos = new Set();
  while (porVer.length > 0) {
    const fichero = porVer.pop();
    if (hechos.has(fichero) || !existsSync(fichero)) continue;
    hechos.add(fichero);
    const texto = readFileSync(fichero, 'utf8');
    for (const m of texto.matchAll(RUTA)) vistos.add(m[0]);
    // Un `.sh` que el verificador llama ejecuta controles igual que él. Sin
    // esto, `escanear-secretos.mjs` —que vive tras `verificar-frontera.sh`—
    // quedaba fuera del recuento y el control se mentía a sí mismo.
    for (const m of texto.matchAll(/scripts\/[a-z0-9-]+\.sh/g)) porVer.push(m[0]);
  }
  return vistos;
};

/**
 * Un control cuenta como EJERCIDO solo si la suite lo INVOCA: la ruta aparece
 * como literal exacto entre comillas, que es la forma de `correr('node', [...])`.
 * Nombrarlo dentro de una frase más larga no es ejercerlo — y esa distinción no
 * es teórica: al escribir el caso 16 de la suite, mencionar la ruta dentro de
 * otra cadena bastó para que este control diera por probado un control que
 * nadie había probado. El control genérico de la familia estuvo a punto de
 * nacer con el defecto de la familia.
 */
const INVOCADO = /'((?:scripts\/lib|e2e|apps\/mobile\/e2e)\/[a-z0-9-]+\.mjs)'/g;
const ejercidos = new Set([...readFileSync(NEGATIVAS, 'utf8').matchAll(INVOCADO)].map((m) => m[1]));

const usados = invocados();
const sinPrueba = [...usados].filter((c) => !ejercidos.has(c) && !EXENTOS.has(c)).sort();

const nuevos = sinPrueba.filter((c) => !DEUDA.has(c));
// Una exención que ya no hace falta es tan peligrosa como la que falta: protege
// a un control que SÍ tiene prueba y calla si mañana se la quitan.
const zombis = [...DEUDA.keys()].filter((c) => !usados.has(c) || ejercidos.has(c));

if (nuevos.length > 0 || zombis.length > 0) {
  console.error('FALLO la deuda de pruebas negativas no puede crecer:');
  for (const c of nuevos) {
    console.error(`  ✗ ${c} lo ejecuta el verificador y NADIE lo ha visto fallar.`);
  }
  for (const c of zombis) {
    console.error(
      `  ✗ ${c} sigue en la lista DEUDA y ya no le corresponde ` +
        `(${ejercidos.has(c) ? 'ya tiene prueba negativa: quítelo de la lista' : 'el verificador ya no lo ejecuta'}).`,
    );
  }
  console.error(
    '\n  Veinte defectos de este proyecto son el mismo: el control existe y no\n' +
      '  comprueba lo que usted cree. La única defensa genérica es haberlo visto\n' +
      '  fallar. Escriba el caso en scripts/lib/pruebas-negativas.mjs.',
  );
  process.exit(1);
}

const cubiertos = [...usados].filter((c) => ejercidos.has(c)).length;
console.log(
  `controles: ${cubiertos} de ${usados.size - EXENTOS.size} con prueba negativa · ` +
    `${sinPrueba.length} en deuda declarada (no puede crecer)`,
);
