#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-06 · TODA CLASE QUE NEST CONSTRUYE INYECTA CON `@Inject()` EXPLÍCITO
 *
 * En sitio, el 26/09/2026, `pnpm --filter @ncr/api start:dev` cayó con
 * «Cannot read properties of undefined (reading 'get')». `start:dev` usa `tsx`,
 * que compila con esbuild, y esbuild NO emite `design:paramtypes`: Nest no
 * sabe qué inyectar en un parámetro sin `@Inject()` y pasa `undefined`. El
 * planificador cayó el primero porque usa su `ModuleRef` al arrancar; los
 * controladores con el mismo patrón —`BiometriaController` entre ellos— habrían
 * caído en la primera petición.
 *
 * `tsc` (`pnpm start`) y la suite (SWC con metadatos) sí emiten los metadatos,
 * así que ninguna prueba lo veía: es la misma familia que el falso verde de la
 * ETAPA 03, con otro compilador.
 *
 * QUÉ SE COMPRUEBA. Las clases que Nest construye por sí mismo —las de
 * `controllers: [...]`, las de `providers: [...]` escritas a pelo y las de
 * `useClass:`— declaran `@Inject(...)` en CADA parámetro del constructor. Las
 * que se construyen en un `useFactory` no cuentan: ahí el `new` lo escribe
 * alguien y los argumentos van explícitos.
 *
 *   node scripts/lib/inyeccion-explicita.mjs            # apps/api/src
 *   node scripts/lib/inyeccion-explicita.mjs <dir>      # otro árbol (sondas)
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Desde el propio guion y no desde el directorio de trabajo: la suite negativa
// lo ejecuta contra un árbol de sondas que no tiene `node_modules`.
const require = createRequire(import.meta.url);
const ts = require('typescript');

const raiz = process.argv[2] ?? 'apps/api/src';

const ficheros = [];
const recorrer = (dir) => {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) recorrer(ruta);
    else if (nombre.endsWith('.ts') && !nombre.endsWith('.test.ts')) ficheros.push(ruta);
  }
};
recorrer(raiz);

/** Clase → dónde está y qué parámetros llevan `@Inject`. */
const clases = new Map();
/** Nombres que Nest construye por su cuenta, con dónde se registran. */
const construidasPorNest = new Map();

const nombreDeDecorador = (d, sf) => {
  const e = d.expression;
  return ts.isCallExpression(e) ? e.expression.getText(sf) : e.getText(sf);
};

for (const fichero of ficheros) {
  const sf = ts.createSourceFile(
    fichero,
    readFileSync(fichero, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const visitar = (nodo) => {
    if (ts.isClassDeclaration(nodo) && nodo.name !== undefined) {
      const constructor = nodo.members.find((m) => ts.isConstructorDeclaration(m));
      const parametros = (constructor?.parameters ?? []).map((p) => ({
        nombre: p.name.getText(sf),
        tipo: p.type?.getText(sf) ?? '?',
        linea: sf.getLineAndCharacterOfPosition(p.getStart(sf)).line + 1,
        conInject: (ts.getDecorators(p) ?? []).some((d) => nombreDeDecorador(d, sf) === 'Inject'),
      }));
      clases.set(nodo.name.text, { fichero, parametros });
    }
    if (ts.isPropertyAssignment(nodo) && ts.isIdentifier(nodo.name)) {
      const clave = nodo.name.text;
      const donde = `${relative(process.cwd(), fichero)}:${sf.getLineAndCharacterOfPosition(nodo.getStart(sf)).line + 1}`;
      if (
        (clave === 'controllers' || clave === 'providers') &&
        ts.isArrayLiteralExpression(nodo.initializer)
      ) {
        for (const e of nodo.initializer.elements) {
          if (ts.isIdentifier(e)) construidasPorNest.set(e.text, donde);
        }
      }
      if (clave === 'useClass' && ts.isIdentifier(nodo.initializer)) {
        construidasPorNest.set(nodo.initializer.text, donde);
      }
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(sf);
}

const faltas = [];
let revisadas = 0;
for (const [nombre, registro] of construidasPorNest) {
  const clase = clases.get(nombre);
  // Una clase de otro paquete (`@ncr/providers`) o de Nest: no es de este árbol.
  if (clase === undefined) continue;
  revisadas += 1;
  for (const p of clase.parametros) {
    if (!p.conInject) {
      faltas.push(
        `${relative(process.cwd(), clase.fichero)}:${String(p.linea)} ${nombre}(${p.nombre}: ${p.tipo}) ` +
          `— registrada en ${registro}`,
      );
    }
  }
}

if (faltas.length > 0) {
  console.error(
    `FALLO ${String(faltas.length)} parámetro(s) de clases que Nest construye se inyectan POR TIPO, sin @Inject():`,
  );
  for (const f of faltas) console.error(`  ${f}`);
  console.error(
    '\n  Con `tsx` (start:dev) esos parámetros llegan como `undefined`: esbuild no emite\n' +
      '  `design:paramtypes`. Añada `@Inject(Clase)` o `@Inject(TOKEN)` en cada uno.',
  );
  process.exit(1);
}

console.log(
  `OK ${String(revisadas)} clases que Nest construye inyectan con @Inject() explícito en todos sus parámetros`,
);
