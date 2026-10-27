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
 * ═════════════════════════════════════════════════════════════════════════════
 * Y LAS DE npm QUE SE ACOTAN A PROPÓSITO · D-147
 *
 * Todo `package.json` del repositorio fija versiones exactas, pero una
 * dependencia NUEVA que toca algo delicado —credenciales, red hacia fuera— se
 * declara además aquí, con su motivo y su versión: `nodemailer` lleva la clave
 * SMTP y los ficheros de eventos. El control exige que la versión del manifiesto
 * sea EXACTAMENTE la declarada (sin `^` ni `~`) y que ningún otro manifiesto la
 * traiga sin pasar por aquí. Subirla es un cambio consciente en dos sitios.
 *
 *   node scripts/lib/dependencias-acotadas.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PUBSPEC = 'apps/mobile/pubspec.yaml';
const LOCK = 'apps/mobile/pubspec.lock';

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

/** paquete npm → { manifiesto, version, motivo } */
const NPM_ACOTADAS = new Map([
  [
    'nodemailer',
    {
      manifiesto: 'apps/api/package.json',
      version: '10.1.0',
      motivo:
        'D-147 · el correo del respaldo diario. Maneja la clave SMTP y envía el ' +
        'fichero de eventos: cero dependencias propias, tipos incluidos, y la ' +
        'versión con más de dos semanas publicada al adoptarla (10/10/2026). ' +
        'Subirla es leer su registro de cambios, no un `pnpm update`',
    },
  ],
]);

const problemas = [];
const hayMovil = existsSync(PUBSPEC);
const pubspec = hayMovil ? readFileSync(PUBSPEC, 'utf8') : '';
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

for (const [paquete, { version, prohibe, motivo }] of hayMovil ? PERMITIDAS : []) {
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

// npm · los manifiestos de las apps y los paquetes del espacio de trabajo.
const manifiestos = ['package.json'];
for (const raiz of ['apps', 'packages']) {
  if (!existsSync(raiz)) continue;
  for (const d of readdirSync(raiz, { withFileTypes: true })) {
    const m = join(raiz, d.name, 'package.json');
    if (d.isDirectory() && existsSync(m)) manifiestos.push(m);
  }
}
const versionEn = (manifiesto, paquete) => {
  if (!existsSync(manifiesto)) return undefined;
  const j = JSON.parse(readFileSync(manifiesto, 'utf8'));
  for (const campo of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    const v = j[campo]?.[paquete];
    if (v !== undefined) return v;
  }
  return undefined;
};
for (const [paquete, { manifiesto, version, motivo }] of NPM_ACOTADAS) {
  for (const m of manifiestos) {
    const v = versionEn(m, paquete);
    if (v === undefined) continue;
    if (m !== manifiesto) {
      problemas.push(
        `\`${paquete}\` aparece en ${m} y sólo está acotado en ${manifiesto}. Motivo: ${motivo}`,
      );
    } else if (v !== version) {
      problemas.push(
        `\`${paquete}\` está como «${v}» en ${m} y aquí se acota a «${version}» exacta ` +
          '(sin ^ ni ~). Motivo: ' +
          motivo,
      );
    }
  }
}
const npmAcotadas = [...NPM_ACOTADAS.keys()].filter((p) =>
  manifiestos.some((m) => versionEn(m, p) !== undefined),
);

if (problemas.length > 0) {
  console.error(`FALLO ${problemas.length} problema(s) con las dependencias acotadas:`);
  for (const p of problemas) console.error(`  ✗ ${p}`);
  process.exit(1);
}

const cuantas = hayMovil ? PERMITIDAS.size : 0;
console.log(
  `dependencias: ${cuantas} acotación(es) de Dart con motivo escrito · ` +
    (hayMovil ? 'objective_c fuera del grafo (lo arrastraba el plugin de Windows) · ' : '') +
    `${npmAcotadas.length} de npm a versión exacta con motivo (${npmAcotadas.join(', ') || 'ninguna'})`,
);
