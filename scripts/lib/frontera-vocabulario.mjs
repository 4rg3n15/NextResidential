#!/usr/bin/env node
/**
 * FRONTERA DEL VOCABULARIO: el tipo de copropiedad no entra en el dominio.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ SOSTIENE ESTE CONTROL, Y POR QUÉ NO ES PURISMO
 *
 * El usuario preguntó si el tipo de copropiedad —apartamentos, casas, fincas—
 * puede cambiarse después de configurado, y qué pasa entonces con las viviendas
 * ya creadas. La respuesta es «sí, y no les pasa nada», pero **solo es cierta
 * mientras nada del dominio ramifique por él**: el día que una política de
 * acceso, el motor de reglas o un agregado consulten `tipo`, cambiarlo dejaría
 * de ser seguro y nadie se enteraría hasta que un conjunto lo cambiara en
 * producción.
 *
 * Por eso la respuesta lleva control. Sin él, es una promesa; con él, es una
 * propiedad del código que el CI vuelve a comprobar en cada etapa.
 *
 * Lo mismo vale para las dos ETIQUETAS. Son palabras que se pintan al mostrar
 * («Casa 42»), y si el dominio las leyera pasarían a formar parte de la verdad
 * guardada — que es exactamente el defecto H-3 que el rediseño eliminó.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DÓNDE SÍ PUEDE APARECER
 *
 * En la aplicación y la presentación de la API: el formulario de generación
 * elige plantilla con él, y la configuración lo guarda. En la consola, que lo
 * pinta. Aquí se vigila el DOMINIO —`packages/domain-core`, compartido con el
 * Edge—, que es donde su presencia cambiaría las respuestas.
 *
 * Uso: node scripts/lib/frontera-vocabulario.mjs [raíz]
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const raizProyecto = process.argv[2] ?? process.cwd();
const DOMINIO = join(raizProyecto, 'packages', 'domain-core', 'src');

if (!existsSync(DOMINIO)) {
  console.log('OK frontera-vocabulario: no hay packages/domain-core/src que revisar');
  process.exit(0);
}

/**
 * Los nombres que delatan la fuga. No se busca la palabra «casas» suelta —el
 * dominio habla español y la usaría en un comentario— sino el identificador
 * concreto con el que viajaría el dato.
 */
const PALABRAS = [
  { patron: /\btipoDeCopropiedad\b/, que: 'el tipo de copropiedad' },
  { patron: /\bTipoDeCopropiedad\b/, que: 'el tipo de copropiedad' },
  { patron: /\btipo_copropiedad\b/, que: 'el tipo de copropiedad' },
  { patron: /\betiquetaVivienda\b/, que: 'la etiqueta de vivienda' },
  { patron: /\betiquetaAgrupacion\b/, que: 'la etiqueta de agrupación' },
  { patron: /\betiqueta_vivienda\b/, que: 'la etiqueta de vivienda' },
  { patron: /\betiqueta_agrupacion\b/, que: 'la etiqueta de agrupación' },
];

const ficheros = [];
const recorrer = (dir) => {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) recorrer(ruta);
    else if (ruta.endsWith('.ts')) ficheros.push(ruta);
  }
};
recorrer(DOMINIO);

const violaciones = [];
for (const fichero of ficheros) {
  const lineas = readFileSync(fichero, 'utf8').split('\n');
  for (const [indice, linea] of lineas.entries()) {
    // Los comentarios explican POR QUÉ no está, y tienen que poder nombrarlo.
    const limpia = linea.trim();
    if (limpia.startsWith('*') || limpia.startsWith('//') || limpia.startsWith('/*')) continue;
    for (const { patron, que } of PALABRAS) {
      if (patron.test(linea)) {
        violaciones.push(
          `${relative(raizProyecto, fichero)}:${String(indice + 1)} · ${que} llegó al dominio`,
        );
      }
    }
  }
}

if (violaciones.length > 0) {
  console.log('FALLO frontera-vocabulario: el vocabulario de la copropiedad entró en el dominio');
  for (const v of violaciones) console.log(`  ${v}`);
  console.log(
    '  Mientras esto exista, «el tipo se puede cambiar después» deja de ser cierto:\n' +
      '  alguna decisión ramificaría por él y las viviendas ya creadas sí se enterarían.',
  );
  process.exit(1);
}

console.log(
  `OK frontera-vocabulario: ${String(ficheros.length)} ficheros del dominio, ` +
    'sin tipo de copropiedad ni etiquetas (el tipo se puede cambiar sin consecuencias)',
);
