#!/usr/bin/env node
/**
 * CONTROL · dos DTO no pueden llamarse igual (D-92).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ, Y CÓMO APARECIÓ
 *
 * En OpenAPI **el nombre de la clase ES el nombre del esquema**. Dos clases
 * distintas que se llaman igual se pisan: solo una sobrevive en el contrato, y
 * el generador de clientes —TypeScript y Dart— produce la forma equivocada para
 * la otra. Sin un error, sin un aviso, sin una línea en rojo.
 *
 * Estaba pasando desde la ETAPA 05, con tres nombres:
 *
 *   · `FranjaDto` lo declaraban TRES clases (zonas dos veces, residente una).
 *     `MiZonaDto.franjasDeHoy` decía llevar `{desde, hasta}` y el contrato
 *     publicaba `{dia, minutoInicio, minutoFin, continuaDelDiaAnterior}`.
 *   · `PatronDto`, dos.
 *   · `CrearAutorizacionDto`, dos — y una era código muerto que nadie
 *     importaba: una copia envejecida con el nombre de la viva.
 *
 * Lo encontró el compilador de Dart al usar el cliente generado, no ningún
 * control. Es la familia de siempre en el contrato: **existe, y no describe lo
 * que uno cree**.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * SE MIRA EL CÓDIGO, NO EL CONTRATO
 *
 * Mirar el JSON no serviría: ahí la colisión ya ocurrió y solo queda una. La
 * única forma de verla es contar las declaraciones en el fuente, que es donde
 * las dos existen.
 *
 *   node scripts/lib/esquemas-unicos.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = 'apps/api/src';
const DECLARACION = /^export class ([A-Za-z0-9_]+Dto)\b/gm;

const ficheros = [];
const recorrer = (dir) => {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) recorrer(ruta);
    else if (ruta.endsWith('.ts') && !ruta.endsWith('.test.ts')) ficheros.push(ruta);
  }
};
recorrer(RAIZ);

/** nombre → ficheros que lo declaran. */
const porNombre = new Map();
for (const fichero of ficheros) {
  for (const m of readFileSync(fichero, 'utf8').matchAll(DECLARACION)) {
    porNombre.set(m[1], [...(porNombre.get(m[1]) ?? []), fichero]);
  }
}

const chocan = [...porNombre].filter(([, donde]) => donde.length > 1).sort();

if (chocan.length > 0) {
  console.error(`FALLO ${chocan.length} nombre(s) de esquema declarados más de una vez:`);
  for (const [nombre, donde] of chocan) {
    console.error(`  ✗ ${nombre}`);
    for (const f of donde) console.error(`      ${f}`);
  }
  console.error(
    '\n  En OpenAPI el nombre de la clase ES el nombre del esquema: la segunda pisa a la\n' +
      '  primera y el cliente generado describe la forma equivocada, sin dar ningún error.\n' +
      '  Renombre una, o borre la que esté muerta.',
  );
  process.exit(1);
}

console.log(`esquemas: ${porNombre.size} DTO con nombre único en ${RAIZ}`);
