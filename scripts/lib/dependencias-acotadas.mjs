#!/usr/bin/env node
/**
 * CONTROL · ninguna dependencia queda acotada A CIEGAS.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * EL CASO QUE LO ORIGINA · `objective_c`, y de dónde venía de verdad
 *
 * Cinco rondas del usuario murieron en `flutter test`, en macOS, dentro de un
 * paquete que este proyecto no declara ni usa: `objective_c`. La cadena, medida
 * con `flutter pub deps`, no es la que parecía:
 *
 *   flutter_secure_storage
 *     └─ flutter_secure_storage_WINDOWS      ← sí, el de Windows
 *          └─ path_provider                   (federado: arrastra las 5 plataformas)
 *               └─ path_provider_foundation
 *                    └─ objective_c 9.5.0
 *
 * Es decir: **la implementación para Windows de un paquete de almacenamiento
 * arrastraba una dependencia de Apple**, cuyo `hook/build.dart` compila fuentes
 * `.m` con `clang` —y solo en iOS y macOS; en Linux devuelve sin hacer nada, que
 * es por lo que este contenedor jamás lo reprodujo—. Compilar eso exige el SDK
 * de macOS, y el fallo salía a cuatro capas de distancia de su causa.
 *
 * `path_provider_foundation` 2.5.1 es la última versión sin `objective_c` (2.5.0
 * lo adoptó, 2.5.1 lo revirtió, 2.6.0 lo volvió a meter). Acotarlo ahí lo saca
 * del grafo entero.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ ESTE CONTROL, Y NO SOLO LA ACOTACIÓN
 *
 * Un `dependency_overrides` es una pistola cargada: fija una versión POR ENCIMA
 * de lo que pida quien sea, en silencio, para siempre, y no vuelve a mirarse.
 * Dejarlo suelto sería la vigésima aparición del patrón que perseguimos —algo
 * que parece estar bajo control y que nadie comprueba—. Así que:
 *
 *   1 · cada acotación tiene que estar en `PERMITIDAS`, con su motivo. Añadir
 *       una sin tocar este fichero pone el paso en rojo.
 *   2 · se comprueba el RESULTADO, no el mecanismo: `objective_c` no aparece en
 *       `pubspec.lock`. Si mañana la cadena de arriba cambia sola, la acotación
 *       sobra y se quita sin que nada se rompa.
 *   3 · quitar la acotación sin quitarla de aquí también pone el paso en rojo.
 *
 *   node scripts/lib/dependencias-acotadas.mjs
 */
import { readFileSync, existsSync } from 'node:fs';

const PUBSPEC = 'apps/mobile/pubspec.yaml';
const LOCK = 'apps/mobile/pubspec.lock';

if (!existsSync(PUBSPEC)) {
  console.log('dependencias: no hay app móvil que acotar');
  process.exit(0);
}

/** paquete → { version, motivo, prohibe } */
const PERMITIDAS = new Map([
  [
    'path_provider_foundation',
    {
      version: '2.5.1',
      prohibe: 'objective_c',
      motivo:
        'la implementación para WINDOWS de flutter_secure_storage arrastra ' +
        'path_provider, que arrastra path_provider_foundation, que desde 2.6.0 ' +
        'arrastra objective_c; su hook compila .m con clang y exige el SDK de ' +
        'macOS. 2.5.1 es la última sin él',
    },
  ],
]);

const problemas = [];
const pubspec = readFileSync(PUBSPEC, 'utf8');
const lock = existsSync(LOCK) ? readFileSync(LOCK, 'utf8') : '';

// Las acotaciones declaradas en el pubspec, leídas del bloque, no de una lista.
const declaradas = new Map();
{
  let dentro = false;
  for (const linea of pubspec.split('\n')) {
    if (/^dependency_overrides:\s*$/.test(linea)) {
      dentro = true;
      continue;
    }
    if (!dentro) continue;
    if (/^\S/.test(linea)) break; // se acabó el bloque: otra clave de primer nivel
    const m = /^\s+([a-z0-9_]+):\s*(\S+)\s*$/.exec(linea);
    if (m !== null) declaradas.set(m[1], m[2]);
  }
}

for (const [paquete, version] of declaradas) {
  const esperada = PERMITIDAS.get(paquete);
  if (esperada === undefined) {
    problemas.push(
      `\`${paquete}\` está acotado en ${PUBSPEC} y no figura en este control. ` +
        'Una acotación sin motivo escrito es una versión congelada que nadie volverá a mirar',
    );
  } else if (version !== esperada.version) {
    problemas.push(
      `\`${paquete}\` está acotado a ${version} y aquí se declara ${esperada.version}`,
    );
  }
}

for (const [paquete, { version, prohibe, motivo }] of PERMITIDAS) {
  if (!declaradas.has(paquete)) {
    problemas.push(
      `falta la acotación \`${paquete}: ${version}\` en ${PUBSPEC}. Motivo por el ` +
        `que existe: ${motivo}`,
    );
  }
  // El RESULTADO. Es lo único que de verdad importa y lo único que sobrevive a
  // que la cadena de dependencias cambie de forma.
  if (prohibe !== undefined && new RegExp(`^\\s{2}${prohibe}:`, 'm').test(lock)) {
    problemas.push(
      `\`${prohibe}\` ha vuelto a ${LOCK} pese a la acotación de \`${paquete}\`. ` +
        'Vuelva a mirar `flutter pub deps --style=compact` y quién lo arrastra ahora',
    );
  }
}

if (problemas.length > 0) {
  console.error(`FALLO ${problemas.length} problema(s) con las dependencias acotadas:`);
  for (const p of problemas) console.error(`  ✗ ${p}`);
  process.exit(1);
}

const cuantas = PERMITIDAS.size;
console.log(
  `dependencias: ${cuantas} acotación(es) con motivo escrito · ` +
    `objective_c fuera del grafo (lo arrastraba el plugin de Windows)`,
);
