#!/usr/bin/env node
/**
 * GENERA LA PALETA DE LA APP FLUTTER DESDE EL PRESET · cierre de **D-78**.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * QUÉ ESTABA MAL, Y POR QUÉ LA PRUEBA NO BASTABA
 *
 * El tema de la app copiaba a mano los colores de `packages/config/src/temas.ts`
 * porque Dart no puede leer TypeScript. La deuda se declaró con su salida
 * escrita —«la salida limpia es generar este fichero desde el preset, como se
 * genera el cliente de API»— y mientras tanto una prueba de Dart leía el `.ts`
 * como TEXTO y comprobaba que cada color copiado siguiera apareciendo allí.
 *
 * Esa prueba protegía de la mitad del problema y no de la otra. Detectaba que
 * un color copiado dejara de existir en el preset; **no** detectaba que el
 * preset ganara un token que la app nunca copió, ni que un color siguiera
 * existiendo en el preset con otro papel —`#E63946` es a la vez `marca` y
 * `peligro`, así que buscar la cadena da verde aunque la app lo use para lo que
 * no es—. Y, sobre todo, no detectaba que el tema OSCURO divergiera: el preset
 * tiene dos paletas completas y la app solo había copiado cuatro colores de la
 * segunda.
 *
 * Generar quita las tres. Lo generado no se edita (§2.6, igual que el cliente
 * de Dart y el de la consola), y `paleta-desfasada` rompe el build si alguien
 * lo edita o si el preset cambia y nadie regenera.
 *
 *   node scripts/lib/generar-paleta-dart.mjs            → escribe el fichero
 *   node scripts/lib/generar-paleta-dart.mjs --comprobar → 1 si está desfasado
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Las banderas NO son la raíz. Sin este filtro, `--comprobar` se tomaba como
// directorio y el control informaba «falta dist/temas.js» sobre un fichero que
// estaba delante — el propio control mintiendo sobre lo que miraba.
const argumentos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const raiz = resolve(argumentos[0] ?? process.cwd());
const DESTINO = join(raiz, 'apps', 'mobile', 'lib', 'configuracion', 'paleta.g.dart');
const COMPILADO = join(raiz, 'packages', 'config', 'dist', 'temas.js');

if (!existsSync(COMPILADO)) {
  console.error(
    'FALLO paleta: falta packages/config/dist/temas.js. Ejecute `pnpm build` antes: ' +
      'la paleta se genera desde el preset COMPILADO, no desde una lectura del .ts',
  );
  process.exit(1);
}

const require = createRequire(import.meta.url);
/** @type {{ TEMA_CLARO: Record<string, unknown>, TEMA_OSCURO: Record<string, unknown> }} */
const { TEMA_CLARO, TEMA_OSCURO } = require(COMPILADO);

/** `marca.DEFAULT` → `marca`; `texto.apagado` → `textoApagado`. */
const nombreDart = (ruta) =>
  ruta
    .filter((s) => s !== 'DEFAULT')
    .map((s, i) => (i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)))
    .join('')
    .replace(/[^A-Za-z0-9]/g, '');

const aplanar = (objeto, prefijo = []) =>
  Object.entries(objeto).flatMap(([clave, valor]) =>
    typeof valor === 'string'
      ? [[nombreDart([...prefijo, clave]), valor]]
      : aplanar(valor, [...prefijo, clave]),
  );

const claras = aplanar(TEMA_CLARO);
const oscuras = aplanar(TEMA_OSCURO);

const nombresClaros = claras.map(([n]) => n);
const nombresOscuros = new Set(oscuras.map(([n]) => n));
const faltantes = nombresClaros.filter((n) => !nombresOscuros.has(n));
if (faltantes.length > 0) {
  console.error(
    `FALLO paleta: el tema oscuro no declara ${faltantes.join(', ')}. ` +
      'Los dos temas tienen que declarar los MISMOS tokens: uno a medias produce ' +
      'un color que solo existe en claro y desaparece en oscuro',
  );
  process.exit(1);
}

/** `#E63946` → `0xFFE63946`. Dart exige el canal alfa explícito. */
const aDart = (hex) => `0xFF${hex.replace('#', '').toUpperCase()}`;

const constantes = (pares, sangria = '  ') =>
  pares
    .map(([nombre, hex]) => `${sangria}static const ${nombre} = Color(${aDart(hex)});`)
    .join('\n');

const mapa = (pares, sangria = '    ') =>
  pares.map(([nombre]) => `${sangria}'${nombre}': ${nombre},`).join('\n');

const contenido = `// GENERADO POR scripts/lib/generar-paleta-dart.mjs — NO EDITAR A MANO.
//
// Fuente: packages/config/src/temas.ts (el mismo preset que usa la consola).
// Regenerar: pnpm paleta   ·   Comprobar: pnpm paleta:desfasada
//
// Cierre de D-78. Antes estos colores se copiaban a mano y una prueba de Dart
// leía el .ts como texto para comprobar que siguieran existiendo allí. Eso no
// veía tres cosas: un token nuevo del preset que la app nunca copió, un color
// que existe en el preset con OTRO papel —#E63946 es marca y peligro a la vez,
// así que buscar la cadena da verde aunque la app lo use para lo que no es— y
// la divergencia del tema OSCURO, del que solo se habían copiado cuatro tonos.
//
// ignore_for_file: prefer_single_quotes
library;

import 'package:flutter/material.dart';

/// Tokens del tema CLARO. Un token por color del preset, sin excepciones.
class PaletaClara {
${constantes(claras)}

  /// Por nombre de token, para las comprobaciones y para el depurador.
  static const Map<String, Color> porNombre = <String, Color>{
${mapa(claras)}
  };
}

/// Tokens del tema OSCURO. Declara EXACTAMENTE los mismos nombres que el claro:
/// el generador falla si uno de los dos se queda corto, porque un token que
/// solo existe en claro es un color que desaparece al cambiar de tema.
class PaletaOscura {
${constantes(oscuras)}

  static const Map<String, Color> porNombre = <String, Color>{
${mapa(oscuras)}
  };
}

/// Los nombres de token, en el orden del preset.
const List<String> tokensDePaleta = <String>[
${nombresClaros.map((n) => `  '${n}',`).join('\n')}
];
`;

if (process.argv.includes('--comprobar')) {
  const actual = existsSync(DESTINO) ? readFileSync(DESTINO, 'utf8') : '';
  if (actual === contenido) {
    console.log(
      `OK paleta: paleta.g.dart al día con el preset (${nombresClaros.length} tokens por tema)`,
    );
    process.exit(0);
  }
  console.error(
    'FALLO paleta: `apps/mobile/lib/configuracion/paleta.g.dart` no coincide con el preset.\n' +
      '  · Si cambió `packages/config/src/temas.ts`, ejecute `pnpm paleta`.\n' +
      '  · Si editó el fichero generado a mano, no lo haga: se sobrescribe (§2.6).',
  );
  process.exit(1);
}

writeFileSync(DESTINO, contenido);
console.log(
  `paleta generada: ${nombresClaros.length} tokens por tema en apps/mobile/lib/configuracion/paleta.g.dart`,
);
