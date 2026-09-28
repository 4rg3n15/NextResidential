import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * BLOQUE I (15-L) · CERO TEXTO TÉCNICO EN LA INTERFAZ
 *
 * Ningún texto que pueda ver una persona —el de JSX y cualquier cadena de un
 * componente— lleva los códigos del proyecto: reglas (RN-xx), indicadores
 * (KPI-xx), decisiones (D-xx, ADR), criterios (CA-xx), historias (HU-xx), casos
 * de uso, supuestos, pendientes, contradicciones, extensiones, hallazgos de
 * sitio ni números de migración. Esos códigos viven en los COMENTARIOS, que el
 * árbol sintáctico no contiene: por eso se analiza el árbol y no el texto del
 * fichero, y un comentario nunca da positivo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const TEXTO_TECNICO =
  /\b(?:RN|KPI|KP1|CA|HU|CU|OE|D|P|S|C|E|H-SITIO|BE)-\d{1,3}\b|\bADR\b|\[SUPUESTO\]|\bmigraci[oó]n \d{4}\b/;

const RAIZ = resolve(process.cwd(), 'src');

const ficheros = (dir: string): string[] =>
  readdirSync(dir).flatMap((e) => {
    const ruta = join(dir, e);
    if (statSync(ruta).isDirectory()) return ficheros(ruta);
    return /\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e) && !/\.d\.ts$/.test(e) ? [ruta] : [];
  });

/** Cada texto que el árbol lleva: nodos JSX, cadenas y trozos de plantilla. */
export const textosDe = (fuente: string, nombre = 'x.tsx'): { texto: string; linea: number }[] => {
  const sf = ts.createSourceFile(nombre, fuente, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const salida: { texto: string; linea: number }[] = [];
  const visitar = (n: ts.Node): void => {
    // Una importación es una ruta, no un texto de la interfaz.
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (
      ts.isJsxText(n) ||
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) ||
      ts.isTemplateTail(n)
    ) {
      salida.push({
        texto: n.text,
        linea: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
      });
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
  return salida;
};

describe('cero texto técnico en la consola (Bloque I)', () => {
  it('el detector ve el texto visible y NO los comentarios', () => {
    const fuente = [
      '// RN-06 en un comentario de línea no cuenta',
      '/* KPI-33 en un bloque tampoco */',
      'export const A = () => (',
      '  <p title="Sin códigos">',
      '    {/* ADR-022 dentro de JSX, comentario */}',
      '    Texto limpio',
      '  </p>',
      ');',
    ].join('\n');
    expect(textosDe(fuente).filter((t) => TEXTO_TECNICO.test(t.texto))).toEqual([]);
    for (const malo of [
      '<p>Lo exige RN-20.</p>',
      '<Campo ayuda="Garantizado por la base (RN-04)." />',
      "const x = 'Ver ADR-027';",
      'const y = `mide ${a} (KPI-33)`;',
      "const z = 'decisión D-11';",
      "const w = '[SUPUESTO] algo';",
      "const v = 'fijado por la migración 0032';",
    ]) {
      expect(
        textosDe(malo).some((t) => TEXTO_TECNICO.test(t.texto)),
        malo,
      ).toBe(true);
    }
  });

  it('ningún componente de la consola enseña códigos del proyecto', () => {
    const hallazgos = ficheros(RAIZ).flatMap((f) =>
      textosDe(readFileSync(f, 'utf8'), f)
        .filter((t) => TEXTO_TECNICO.test(t.texto))
        .map(
          (t) =>
            `${relative(process.cwd(), f)}:${String(t.linea)} · ${t.texto.replace(/\s+/g, ' ').trim().slice(0, 90)}`,
        ),
    );
    expect(hallazgos, `texto técnico visible:\n${hallazgos.join('\n')}`).toEqual([]);
  });
});
