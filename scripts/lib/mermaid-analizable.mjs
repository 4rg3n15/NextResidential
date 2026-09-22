#!/usr/bin/env node
/**
 * TODO BLOQUE ```mermaid DEL REPOSITORIO TIENE QUE ANALIZAR.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE
 *
 * La DoD de la ETAPA 16 exige «que los diagramas Mermaid rendericen» y hasta
 * hoy nada lo comprobaba. Los cinco diagramas de `modelo-datos.md` llevaban en
 * el repositorio desde la ETAPA 01 sin que ninguna máquina los hubiera leído:
 * si uno estuviera roto, GitHub mostraría un recuadro de error y el informe
 * seguiría diciendo «diagrama entidad-relación en Mermaid», que es exactamente
 * la familia de defecto que este proyecto persigue —el control que existe pero
 * no comprueba lo que crees, aquí en su forma extrema: el control que no
 * existe y la documentación que afirma como si existiera—.
 *
 * QUÉ ANALIZA, Y CON QUÉ. Con **Mermaid de verdad** (`mermaid.parse`), no con
 * una expresión regular que se parezca. Un analizador escrito a mano daría
 * exactamente la falsa confianza que el control viene a quitar: aceptaría lo
 * que GitHub rechaza y rechazaría lo que GitHub admite, y nadie lo sabría
 * hasta ver el recuadro rojo. Mermaid corre bajo `jsdom` porque su ruta de
 * saneamiento (`DOMPurify.addHook`) exige un `window`; el analizador en sí no
 * toca el DOM, pero el módulo no se carga sin él.
 *
 * LO QUE NO COMPRUEBA, y hay que decirlo: que el diagrama sea CORRECTO. Un
 * `flowchart` que analiza puede dibujar la flecha al revés. Esto verifica que
 * se renderice, no que diga la verdad; eso lo sostienen las tablas que lo
 * acompañan y la revisión humana.
 *
 * REGLA DE ESTILO QUE SÍ SE IMPONE. Ningún color fijado a mano: ni `style`,
 * ni `classDef` con `fill:`/`stroke:`, ni `linkStyle` con color. Los temas
 * claro y oscuro de GitHub cambian el fondo, y un color literal que se lee
 * perfecto en uno desaparece en el otro. Es la misma regla que
 * `frontera-tema.mjs` impone en la consola, por el mismo motivo.
 *
 * Uso:
 *   node scripts/lib/mermaid-analizable.mjs [raíz]
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const raiz = resolve(process.argv[2] ?? process.cwd());

/** Nada de esto es documentación del proyecto. */
const EXCLUIDOS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.turbo', '.next']);

const marcados = [];
const recorrer = (dir) => {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUIDOS.has(entrada.name)) continue;
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) recorrer(ruta);
    else if (entrada.name.endsWith('.md')) marcados.push(ruta);
  }
};
recorrer(raiz);

/**
 * Extrae los bloques con su LÍNEA DE INICIO. El número de línea no es adorno:
 * un fallo de análisis sin él obliga a buscar a ojo en un fichero de mil
 * líneas con cinco diagramas.
 *
 * La valla se reconoce con tres acentos graves o más —CommonMark lo admite— y
 * el cierre exige al menos tantos como la apertura, que es como se anida un
 * bloque de código dentro de otro.
 */
const extraerBloques = (texto) => {
  const lineas = texto.split('\n');
  const bloques = [];
  let dentro = null;
  for (let i = 0; i < lineas.length; i += 1) {
    const linea = lineas[i] ?? '';
    const valla = /^\s*(`{3,})\s*([A-Za-z0-9_-]*)\s*$/.exec(linea);
    if (dentro === null) {
      if (valla && valla[2]?.toLowerCase() === 'mermaid') {
        dentro = { valla: valla[1]?.length ?? 3, inicio: i + 1, cuerpo: [] };
      }
      continue;
    }
    if (valla && (valla[1]?.length ?? 0) >= dentro.valla && (valla[2] ?? '') === '') {
      bloques.push({ linea: dentro.inicio, texto: dentro.cuerpo.join('\n') });
      dentro = null;
      continue;
    }
    dentro.cuerpo.push(linea);
  }
  // Un bloque sin cerrar NO se descarta en silencio: es un fallo por sí mismo.
  if (dentro !== null)
    bloques.push({ linea: dentro.inicio, texto: dentro.cuerpo.join('\n'), sinCerrar: true });
  return bloques;
};

/** Color literal dentro del propio diagrama (§ regla de estilo de arriba). */
const COLOR_LITERAL =
  /(^|[\s,;])(fill|stroke|color|background|bgcolor)\s*:\s*(#[0-9a-fA-F]{3,8}|rgb|hsl|[a-z]{3,})/;

const bloques = [];
for (const fichero of marcados) {
  for (const bloque of extraerBloques(readFileSync(fichero, 'utf8'))) {
    bloques.push({ ...bloque, fichero: relative(raiz, fichero) });
  }
}

if (bloques.length === 0) {
  console.log('OK mermaid: no hay ningún bloque ```mermaid en el repositorio');
  process.exit(0);
}

// ── El analizador de verdad ──────────────────────────────────────────────────
const { JSDOM } = await import('jsdom');
const ventana = new JSDOM('<!doctype html><html><body></body></html>').window;
globalThis.window = ventana;
globalThis.document = ventana.document;
globalThis.Node = ventana.Node;
globalThis.Element = ventana.Element;
globalThis.DocumentFragment = ventana.DocumentFragment;
globalThis.NodeFilter = ventana.NodeFilter;
globalThis.HTMLElement = ventana.HTMLElement;

const mermaid = (await import('mermaid')).default;
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });

const fallos = [];
for (const bloque of bloques) {
  const donde = `${bloque.fichero}:${bloque.linea}`;
  if (bloque.sinCerrar) {
    fallos.push(`${donde} · el bloque \`\`\`mermaid no se cierra`);
    continue;
  }
  if (bloque.texto.trim() === '') {
    fallos.push(`${donde} · el bloque está vacío`);
    continue;
  }
  const conColor = bloque.texto
    .split('\n')
    .map((l, i) => [i, l])
    .filter(([, l]) => /^\s*(style|classDef|linkStyle)\b/.test(l) && COLOR_LITERAL.test(l));
  for (const [i] of conColor) {
    fallos.push(
      `${donde} (línea ${bloque.linea + i + 1}) · color fijado a mano: no se lee en los dos temas de GitHub`,
    );
  }
  try {
    await mermaid.parse(bloque.texto);
  } catch (error) {
    const motivo = String(error?.message ?? error)
      .split('\n')
      .slice(0, 3)
      .join(' ⏎ ');
    fallos.push(`${donde} · NO ANALIZA: ${motivo}`);
  }
}

if (fallos.length > 0) {
  console.error(`FALLO mermaid: ${fallos.length} problema(s) en ${bloques.length} bloque(s)\n`);
  for (const f of fallos) console.error(`  ✗ ${f}`);
  console.error(
    '\nGitHub renderiza estos bloques de forma nativa: uno que no analiza sale como un recuadro de error.',
  );
  process.exit(1);
}

const ficheros = new Set(bloques.map((b) => b.fichero));
console.log(
  `OK mermaid: ${bloques.length} diagrama(s) en ${ficheros.size} fichero(s) analizan con Mermaid ${
    // La versión importa en el veredicto: GitHub fija la suya, y una diferencia
    // de mayor entre ambas es una causa legítima de discrepancia.
    JSON.parse(readFileSync(join(raiz, 'node_modules', 'mermaid', 'package.json'), 'utf8')).version
  }`,
);
