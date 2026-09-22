#!/usr/bin/env node
/**
 * GRANULARIDAD DE RAMA · la mitad que faltaba del control genérico.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ CIERRA, Y POR QUÉ NO BASTABA LO ANTERIOR
 *
 * `controles-sin-prueba-negativa.mjs` exige que todo control que el verificador
 * ejecuta tenga **alguna** prueba negativa. Eso atrapa al control que nace sin
 * ninguna. **No atrapa a D-81**, que es el caso más caro de esta familia:
 * `verificar-entorno.mjs` tenía su prueba desde la ETAPA 02, y la rama del
 * acento circunflejo —añadida dos rondas antes— no la ejercía nadie. Devolvía
 * verde para cualquier versión durante todo ese tiempo.
 *
 * Para ese caso hace falta bajar un nivel: **no «¿tiene prueba este fichero?»
 * sino «¿se ha ejecutado alguna vez este trozo de código?»**.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CÓMO SE MIDE — CON LO QUE NODE YA TRAE
 *
 * La suite negativa corre con `NODE_V8_COVERAGE`, que hace que **cada proceso
 * de Node** —incluidos los que la suite lanza para ejercitar cada control—
 * escriba su cobertura de V8. Aquí se funden todos y, por cada control, se
 * cuentan los **bloques que ningún proceso llegó a ejecutar**. Un bloque a cero
 * es literalmente una rama que nadie ha visto correr: la forma exacta de D-81.
 *
 * No se usa un umbral de porcentaje, que invita a regatear. Se usa un
 * **trinquete**: `ramas-de-los-controles.json` guarda cuántos bloques sin
 * ejecutar tiene hoy cada control, y **ese número no puede subir**. Añadir una
 * rama sin ejercerla rompe la verificación en el mismo empujón que la añade.
 * Bajarlo es libre; subirlo exige `--actualizar`, que deja el cambio escrito en
 * el diff para que alguien lo lea.
 *
 *   node scripts/lib/ramas-de-los-controles.mjs            → compara
 *   node scripts/lib/ramas-de-los-controles.mjs --actualizar
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'scripts/lib/ramas-de-los-controles.json';
const directorio = process.env.NCR_COBERTURA_CONTROLES;

if (directorio === undefined || !existsSync(directorio)) {
  console.error(
    'FALLO no hay cobertura de los controles. El paso 9 debe correr\n' +
      '  `pruebas-negativas.mjs` con NCR_COBERTURA_CONTROLES=<dir> y NODE_V8_COVERAGE=<dir>.',
  );
  process.exit(1);
}

/**
 * Fundir la cobertura de varios procesos NO es comparar rangos por igualdad.
 *
 * Lo fue en la primera versión, y era un defecto de la misma familia que este
 * control persigue: **decía «nadie ejecutó esto» de código que se acababa de
 * ver correr**. La razón es cómo codifica V8 la cobertura: los rangos están
 * ANIDADOS y cada proceso los parte donde le hace falta. El proceso que sí
 * entró en un bloque no emite un rango con esos mismos extremos y cuenta > 0;
 * emite uno más ancho, sin partir. Al comparar por `inicio:fin`, el rango a
 * cero de otro proceso no encontraba pareja y sobrevivía como «sin ejecutar».
 *
 * Lo correcto es la regla de V8: **la cuenta de un punto es la del rango MÁS
 * INTERNO que lo contiene**. Así que un bloque está sin ejercer solo si, en
 * TODOS los procesos, el rango más interno que lo contiene vale cero.
 */
const porFichero = new Map();

for (const fichero of readdirSync(directorio)) {
  if (!fichero.endsWith('.json')) continue;
  let datos;
  try {
    datos = JSON.parse(readFileSync(`${directorio}/${fichero}`, 'utf8'));
  } catch {
    continue; // un volcado a medias de un proceso que murió: no es una rama
  }
  for (const guion of datos.result ?? []) {
    if (!guion.url.startsWith('file:')) continue;
    /**
     * Se identifica el control por su ruta DENTRO del repositorio, no por la
     * absoluta: la suite negativa ejecuta la mitad de los controles en un clon
     * temporal, y medirlos por separado habría dejado fuera justo a los que más
     * se ejercitan. Son el mismo fichero; lo que se funde es su ejecución.
     */
    const coincide = /(?:^|\/)(scripts\/lib\/[a-z0-9-]+\.mjs)$/.exec(fileURLToPath(guion.url));
    if (coincide === null) continue;
    const ruta = coincide[1];
    /**
     * La suite negativa no se mide a sí misma. No es un control: es el banco
     * que los ejercita, y sus ramas de fallo —cada `mal(...)`— **no se ejecutan
     * precisamente cuando todo va bien**. Medirla haría que su número creciera
     * con cada caso nuevo, es decir, que **escribir una prueba negativa rompiera
     * el trinquete que existe para exigir pruebas negativas**. Sería un control
     * castigando aquello que pide.
     */
    if (ruta === 'scripts/lib/pruebas-negativas.mjs') continue;

    const rangos = [];
    for (const funcion of guion.functions ?? []) {
      for (const rango of funcion.ranges ?? []) rangos.push(rango);
    }
    const previos = porFichero.get(ruta) ?? [];
    previos.push(rangos);
    porFichero.set(ruta, previos);
  }
}

/** Cuenta de un punto en un proceso: la del rango más interno que lo contiene. */
const cuentaEn = (rangos, punto) => {
  let mejor = null;
  for (const r of rangos) {
    if (r.startOffset > punto || r.endOffset <= punto) continue;
    if (mejor === null || r.endOffset - r.startOffset < mejor.endOffset - mejor.startOffset) {
      mejor = r;
    }
  }
  return mejor === null ? 0 : mejor.count;
};

const medido = new Map(
  [...porFichero]
    .map(([ruta, procesos]) => {
      // Candidatos: todo rango que ALGÚN proceso da a cero.
      const candidatos = new Map();
      for (const rangos of procesos) {
        for (const r of rangos) {
          if (r.count === 0) candidatos.set(`${r.startOffset}:${r.endOffset}`, r);
        }
      }
      let sin = 0;
      for (const r of candidatos.values()) {
        const punto = r.startOffset;
        if (!procesos.some((rangos) => cuentaEn(rangos, punto) > 0)) sin += 1;
      }
      return [ruta, sin];
    })
    .sort(),
);

/**
 * CONTROLES CUYO NÚMERO DEPENDE DEL HOST · D-96
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ PASÓ
 *
 * Este trinquete nació en 11-B y falló en 11-C de dos formas que parecían
 * defectos y no lo eran:
 *
 *   · `verificar-entorno.mjs` daba **26** bloques sin ejercer en una corrida y
 *     **33** en la siguiente, con el mismo código.
 *   · `con-limite.mjs` aparecía medido en una corrida y ausente en la otra.
 *
 * La causa no es aleatoriedad: es que la suite negativa **toma caminos
 * distintos según la máquina**, y eso es exactamente su trabajo. Tiene una
 * sonda para «faltar Flutter NO es lo mismo que tenerlo mal»; con el SDK en el
 * PATH recorre una rama y sin él, otra. Lo mismo con `xcrun`, que existe en
 * macOS y no en Linux. Y `con-limite.mjs` solo se carga si alguna sonda lo
 * invoca, que depende de cuáles se ejecutaron.
 *
 * Así que **un solo número no puede ser correcto en macOS y en Linux a la vez**.
 * El entorno de desarrollo objetivo es macOS y el CI corre en Linux (§2.8.0):
 * un trinquete con una cifra fija estaría en rojo en uno de los dos siempre, y
 * un rojo que aparece por la máquina y no por el código es peor que no tener
 * control, porque enseña a ignorarlo.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ SE HACE EN SU LUGAR
 *
 * Para estos ficheros la cifra se informa pero **no se exige**, y su ausencia
 * en una corrida tampoco rompe. Lo que sí se sigue exigiendo es lo que no
 * depende del host: que tengan prueba negativa, que lo comprueba
 * `controles-sin-prueba-negativa.mjs`, y ese control sí es determinista porque
 * lee ficheros, no cobertura.
 *
 * La lista es cerrada y cada entrada lleva su motivo. Añadir una sin motivo es
 * desactivar el trinquete por la puerta de atrás.
 */
const SENSIBLES_AL_ENTORNO = new Map([
  [
    'scripts/lib/verificar-entorno.mjs',
    'sus ramas SON el entorno: Flutter presente o no, macOS o Linux, `xcrun` o no',
  ],
  [
    'scripts/lib/con-limite.mjs',
    'solo se carga si alguna sonda lo invoca, y qué sondas corren depende del host',
  ],
  /**
   * AÑADIDO EN LA ETAPA 13, con la medición delante.
   *
   * `verificar-escritura.mjs` ejercita la caché del SDK de Flutter sólo si
   * encuentra el SDK. Con él presente entra en esa rama y deja sin ejercer el
   * `catch` de «no hay Flutter en el PATH»; sin él, al revés. Medido sobre el
   * MISMO commit, cambiando únicamente la variable del entorno:
   *
   *   sin NCR_FLUTTER -> 8 bloques sin ejercer
   *   con NCR_FLUTTER -> 9 bloques sin ejercer
   *
   * Es literalmente D-96: una cifra fija estaría en rojo en una de las dos
   * máquinas siempre, y un rojo que aparece por la máquina y no por el código
   * enseña a ignorar el control. Lo que NO se relaja es que tenga prueba
   * negativa —la tiene, sonda 26(e)—, y eso lo comprueba
   * `controles-sin-prueba-negativa.mjs`, que lee ficheros y es determinista.
   */
  [
    'scripts/lib/verificar-escritura.mjs',
    'ejercita la caché del SDK de Flutter sólo si el SDK está: 8 bloques sin él, 9 con él',
  ],
]);

if (process.argv.includes('--actualizar')) {
  // Los sensibles al entorno NO se guardan: guardar una cifra que no se exige
  // invita a leerla como si se exigiera.
  const guardable = [...medido].filter(([r]) => !SENSIBLES_AL_ENTORNO.has(r));
  writeFileSync(BASE, `${JSON.stringify(Object.fromEntries(guardable), null, 2)}\n`);
  console.log(`base actualizada: ${medido.size} controles medidos`);
  process.exit(0);
}

const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : {};
const crecidos = [];
for (const [ruta, cuantos] of medido) {
  if (SENSIBLES_AL_ENTORNO.has(ruta)) continue;
  const antes = base[ruta];
  if (antes === undefined) {
    crecidos.push(`${ruta} no está en la base: mídalo con --actualizar (${cuantos} sin ejecutar)`);
  } else if (cuantos > antes) {
    crecidos.push(
      `${ruta} pasa de ${antes} a ${cuantos} bloques que NADIE ejecuta: ` +
        'la rama que acaba de añadir no la ejercita ninguna prueba negativa',
    );
  }
}

// Una entrada que ya no se mide es una cifra que protege a un fichero que
// nadie vigila: se quita, y quitarla es un diff que alguien lee.
for (const ruta of Object.keys(base)) {
  if (SENSIBLES_AL_ENTORNO.has(ruta)) continue;
  if (!medido.has(ruta)) {
    crecidos.push(`${ruta} sigue en la base y ya no se mide: quítelo con --actualizar`);
  }
}

// La otra mitad del trinquete de la lista: una exención que ya no corresponde
// —el fichero desapareció— se queda protegiendo a nadie.
for (const [ruta, motivo] of SENSIBLES_AL_ENTORNO) {
  if (!existsSync(ruta)) {
    crecidos.push(`${ruta} está declarado sensible al entorno y ya no existe (${motivo})`);
  }
}

if (crecidos.length > 0) {
  console.error('FALLO hay ramas de control que nadie ha visto correr:');
  for (const c of crecidos) console.error(`  ✗ ${c}`);
  console.error(
    '\n  Es la forma exacta de D-81: el fichero tenía prueba negativa y la rama nueva\n' +
      '  no. Ejercítela en scripts/lib/pruebas-negativas.mjs, o justifique la subida\n' +
      '  con --actualizar para que quede escrita en el diff.',
  );
  process.exit(1);
}

const mejoras = [...medido].filter(
  ([r, c]) => !SENSIBLES_AL_ENTORNO.has(r) && base[r] !== undefined && c < base[r],
).length;
const totalSin = [...medido]
  .filter(([r]) => !SENSIBLES_AL_ENTORNO.has(r))
  .reduce((a, [, c]) => a + c, 0);
console.log(
  `ramas: ${medido.size} controles medidos · ${totalSin} bloques sin ejercer ` +
    `(no puede subir${mejoras > 0 ? `; ${mejoras} bajaron` : ''})`,
);
