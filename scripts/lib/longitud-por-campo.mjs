#!/usr/bin/env node
/**
 * CONTROL · «longitud máxima POR CAMPO» (§2.7.4), donde de verdad puede estar.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE — nace de un hallazgo de la propia ETAPA 13 (H-13-09)
 *
 * El saneamiento de entrada de §2.7.4 se construyó con un techo global de 4096
 * caracteres aplicado con `.slice()`. Parecía prudente. Medido:
 *
 *   base64 entrada: 10672 -> salida: 4096
 *   bytes antes: 8004 -> despues: 3072 | firma PK conservada: 504b0304
 *
 * Es decir: el XLSX del padrón, el CSV y el vector biométrico llegaban
 * MUTILADOS, con la firma `PK\x03\x04` intacta —así que la validación de tipo
 * real los daba por buenos— y sin un solo error de validación, porque 4096 cabe
 * dentro del `@Length(1, 340_000)` que el DTO declara. Un 2xx sobre un ZIP roto.
 *
 * La lección, que es la de `Placa`: **lo que queda fuera debe FALLAR, no
 * desaparecer.** Un recorte silencioso convierte un dato inválido en un dato
 * válido y equivocado, que es estrictamente peor.
 *
 * Retirado el techo global, §2.7.4 sigue exigiendo una longitud máxima POR
 * CAMPO. Ese es su sitio natural: el DTO, que sabe si el campo es un motivo de
 * apertura (512) o un libro de Excel en base64 (340 000). Este control impide
 * que esa cota se olvide en el campo siguiente.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ EXIGE
 *
 * Toda propiedad decorada con `@IsString()` en `apps/api/src` debe declarar
 * además `@MaxLength(...)` o `@Length(...)`. Sin cota, un campo de texto acepta
 * lo que quepa en el límite de payload —256 kB por omisión— y lo persiste.
 *
 *   node scripts/lib/longitud-por-campo.mjs
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const RAIZ = process.argv[2] ?? 'apps/api/src';

const ficheros = execFileSync('git', ['ls-files', RAIZ], { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

const sinCota = [];
let total = 0;

for (const fichero of ficheros) {
  const lineas = readFileSync(fichero, 'utf8').split('\n');
  for (let i = 0; i < lineas.length; i += 1) {
    if (!/@IsString\(\)/.test(lineas[i])) continue;
    /**
     * UN COMENTARIO QUE NOMBRA EL DECORADOR NO ES EL DECORADOR.
     *
     * La primera versión de este control contaba como campo la línea de un
     * bloque de documentación que decía «rompe el build si un `@IsString()`
     * nace sin cota» — la del fichero que explica por qué existe este control.
     * Lo destapó su propia prueba negativa, que es exactamente para lo que
     * está: el control existía y no comprobaba lo que uno creía.
     */
    const limpio = lineas[i].trim();
    if (limpio.startsWith('*') || limpio.startsWith('//') || limpio.startsWith('/*')) continue;
    total += 1;

    // El bloque de decoradores de una propiedad no está todo por encima de
    // `@IsString()`: `class-validator` se escribe en cualquier orden. Se recoge
    // hacia arriba mientras haya decoradores, y hacia abajo hasta la
    // declaración de la propiedad, que es lo que cierra el bloque.
    const bloque = [];
    let j = i;
    while (j < lineas.length && !/^\s*(readonly|[a-zA-Z_]+[?!]?\s*:)/.test(lineas[j])) {
      bloque.push(lineas[j]);
      j += 1;
    }
    const declaracion = (lineas[j] ?? '').trim();
    // Sin declaración de propiedad no hay campo que acotar: es otra cosa.
    if (declaracion.length === 0) continue;
    let k = i - 1;
    while (k >= 0 && /^\s*@/.test(lineas[k])) {
      bloque.push(lineas[k]);
      k -= 1;
    }

    if (!/@(MaxLength|Length)\(/.test(bloque.join('\n'))) {
      sinCota.push(`${fichero}:${i + 1}  ${declaracion.slice(0, 70)}`);
    }
  }
}

if (sinCota.length > 0) {
  console.error(`FALLO ${sinCota.length} campo(s) @IsString() sin longitud máxima declarada:`);
  for (const s of sinCota) console.error(`  · ${s}`);
  console.error(
    '\n  §2.7.4 exige «longitud máxima POR CAMPO». Sin cota, el campo acepta lo\n' +
      '  que quepa en el límite de payload y lo persiste. Declare @MaxLength(n)\n' +
      '  o @Length(min, n) junto al @IsString().',
  );
  process.exit(1);
}

console.log(`longitud por campo: ${total} campo(s) @IsString(), todos con cota declarada`);
