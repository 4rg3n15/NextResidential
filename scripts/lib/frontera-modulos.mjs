#!/usr/bin/env node
/**
 * FRONTERA DE MÓDULO: a un módulo se entra por su barril, nunca por dentro.
 *
 * §2.2 lo exige —«cada módulo expone SOLO su API pública mediante un barril
 * `index.ts`»— y hasta la ETAPA 08 nadie lo comprobaba: el control de la ETAPA
 * 02 vigila que el DOMINIO no importe infraestructura, que es una frontera
 * distinta. Se destapó al cerrar la ETAPA 07 (D-34), cuando el módulo de zonas
 * alcanzó el interior del de autorizaciones y nada se puso rojo.
 *
 * QUÉ CUENTA COMO MÓDULO, y por qué así. Un directorio de `apps/api/src/` que
 * contenga alguna de las cuatro capas —`dominio`, `aplicacion`,
 * `infraestructura`, `presentacion`— es un módulo del monolito. La definición
 * se deriva de la estructura y no de una lista escrita a mano: un módulo nuevo
 * queda cubierto el día que se crea, sin que nadie tenga que acordarse. Lo que
 * NO es módulo —`comun`, `nucleo`, `configuracion`— es fontanería compartida
 * sin dominio propio, y §2.2 no le pone frontera.
 *
 * CONSECUENCIA QUE HAY QUE CONOCER, y que esta etapa pagó: **crear una carpeta
 * con nombre de capa dentro de la fontanería la convierte en módulo**. Al
 * añadir `comun/presentacion/` para un DTO compartido, `comun` pasó a contar
 * como módulo y aparecieron 32 violaciones de golpe —las mismas importaciones
 * de siempre, ahora ilegales—. El control tenía razón: o `comun` es fontanería
 * y no lleva capas, o es un módulo y se entra por su barril. Se eligió lo
 * primero, y el DTO vive en `comun/respuestas.ts`.
 *
 * POR QUÉ IMPORTA, más allá del purismo: una importación profunda ata dos
 * módulos por un detalle interno. El día que ese detalle se mueve, rompe a
 * distancia; y el barril deja de significar «esto es lo que expongo».
 *
 * Uso: node scripts/lib/frontera-modulos.mjs [raíz]
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';

const raizProyecto = process.argv[2] ?? process.cwd();
const raiz = join(raizProyecto, 'apps', 'api', 'src');
const CAPAS = ['dominio', 'aplicacion', 'infraestructura', 'presentacion'];

if (!existsSync(raiz)) {
  console.log('OK frontera-modulos: no hay apps/api/src que revisar');
  process.exit(0);
}

const esModulo = (dir) =>
  CAPAS.some((capa) => {
    const p = join(raiz, dir, capa);
    return existsSync(p) && statSync(p).isDirectory();
  });

const modulos = readdirSync(raiz, { withFileTypes: true })
  .filter((e) => e.isDirectory() && esModulo(e.name))
  .map((e) => e.name);

if (modulos.length === 0) {
  console.log('FALLO frontera-modulos: no se reconoció ningún módulo. ¿Cambió la estructura?');
  process.exit(1);
}

const ficheros = [];
const recorrer = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) recorrer(ruta);
    else if (e.name.endsWith('.ts')) ficheros.push(ruta);
  }
};
recorrer(raiz);

const IMPORTA = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/g;
const violaciones = [];

for (const fichero of ficheros) {
  const propio = relative(raiz, fichero).split(/[\\/]/)[0];
  const texto = readFileSync(fichero, 'utf8');
  for (const [, especificador] of texto.matchAll(IMPORTA)) {
    if (!especificador.startsWith('.')) continue;
    const destino = resolve(dirname(fichero), especificador);
    const relativo = relative(raiz, destino);
    if (relativo.startsWith('..')) continue;
    const [modulo, ...resto] = relativo.split(/[\\/]/);
    if (!modulos.includes(modulo) || modulo === propio) continue;
    // Entrar por el barril es lo permitido: `../otro` o `../otro/index`.
    if (resto.length === 0 || (resto.length === 1 && resto[0].replace(/\.ts$/, '') === 'index'))
      continue;
    violaciones.push({
      fichero: relative(raizProyecto, fichero),
      especificador,
      modulo,
    });
  }
}

if (violaciones.length > 0) {
  console.log(
    `FALLO frontera-modulos: ${violaciones.length} importación(es) alcanzan el interior de otro módulo en vez de su barril (§2.2)`,
  );
  for (const v of violaciones) {
    console.log(`   ${v.fichero}: '${v.especificador}' entra en '${v.modulo}' por dentro`);
  }
  process.exit(1);
}

console.log(
  `OK frontera-modulos: ${modulos.length} módulos (${modulos.join(', ')}) y ninguna importación entra por dentro`,
);
