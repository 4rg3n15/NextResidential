#!/usr/bin/env node
/**
 * Ninguna aplicación compila contra el `dist/` de un paquete interno sin
 * reconstruirlo antes.
 *
 * POR QUÉ EXISTE (D-65). `pnpm --filter @ncr/api build` fallaba con
 * `TS2339: Property 'rehidratar' does not exist on type 'typeof Autorizacion'`
 * sobre un método que **sí** existe en el dominio y **sí** se exporta: los dos
 * llegaron en el mismo commit. La causa era de resolución —`@ncr/domain-core`
 * publica sus tipos como `./dist/index.d.ts`, así que la API compila contra el
 * ARTEFACTO— y con `tsc -p` un build por paquete usa el `dist/` que haya,
 * tenga la edad que tenga.
 *
 * `dist/` está en `.gitignore`: cada checkout tiene el suyo y envejece por su
 * cuenta. Es la misma familia que el falso verde de la ETAPA 04, y la regla que
 * §2.8.0 derivó entonces —«las pruebas resuelven los paquetes internos a su
 * código fuente, nunca a su `dist/`»— se había aplicado a las PRUEBAS y nunca
 * al BUILD.
 *
 * La invariante que cierra la clase, y que esto comprueba:
 *
 *  1. Todo paquete interno que alguien consuma es `composite`.
 *  2. Toda aplicación que lo consuma lo declara en `references`.
 *  3. Sus scripts `build` y `typecheck` usan `tsc -b`, que recorre esas
 *     referencias y reconstruye lo desfasado antes de compilar.
 *
 * Se comprueba la CONFIGURACIÓN y no una compilación porque este control tiene
 * que poder correr también en el banco de las pruebas negativas, que es una
 * copia de los ficheros versionados sin `node_modules`. La comprobación de
 * extremo a extremo es el paso 3 del verificador, que construye cada
 * aplicación por separado partiendo de cero `dist/`.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const raiz = process.argv[2] ?? resolve(import.meta.dirname, '..', '..');
const leer = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));

/** Quita comentarios de un tsconfig: TypeScript los admite, `JSON.parse` no. */
const leerTsconfig = (p) =>
  JSON.parse(
    readFileSync(p, 'utf8')
      .replace(/^\uFEFF/, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      .replace(/,(\s*[}\]])/g, '$1'),
  );

const problemas = [];

/** Dónde vive cada paquete `@ncr/*` del espacio de trabajo. */
const ubicacion = new Map();
for (const carpeta of ['apps', 'packages']) {
  const base = join(raiz, carpeta);
  if (!existsSync(base)) continue;
  for (const entrada of readdirSync(base, { withFileTypes: true })) {
    if (!entrada.isDirectory()) continue;
    const pkg = join(base, entrada.name, 'package.json');
    if (existsSync(pkg)) ubicacion.set(leer(pkg).name, join(base, entrada.name));
  }
}

for (const [nombre, dir] of ubicacion) {
  const pkg = leer(join(dir, 'package.json'));
  const rutaTsconfig = join(dir, 'tsconfig.json');
  if (!existsSync(rutaTsconfig)) continue;

  // Dependencias internas de este paquete.
  const internas = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((d) =>
    ubicacion.has(d),
  );
  if (internas.length === 0) continue;

  // La consola no usa `tsc` para construir: Next transpila los paquetes
  // internos desde el FUENTE (`transpilePackages`), así que no puede quedarse
  // con un `dist/` viejo. La invariante no le aplica, y exigírsela sería pedir
  // una configuración que no usa.
  const construyeConTsc = (pkg.scripts?.build ?? '').includes('tsc');
  if (!construyeConTsc) continue;

  const tsconfig = leerTsconfig(rutaTsconfig);
  const referencias = (tsconfig.references ?? []).map((r) =>
    resolve(dir, r.path).replace(/\/tsconfig\.json$/, ''),
  );

  for (const interna of internas) {
    const dirInterna = ubicacion.get(interna);
    const tsconfigInterna = join(dirInterna, 'tsconfig.json');
    if (!existsSync(tsconfigInterna)) continue;

    if (!referencias.includes(dirInterna)) {
      problemas.push(
        `${nombre}: depende de ${interna} y NO lo declara en "references" de su tsconfig — ` +
          'compilará contra el dist/ que haya, tenga la edad que tenga',
      );
    }
    if (leerTsconfig(tsconfigInterna).compilerOptions?.composite !== true) {
      problemas.push(
        `${interna}: lo consume ${nombre} pero no es "composite" — ` +
          '`tsc -b` no puede reconstruirlo',
      );
    }
  }

  for (const guion of ['build', 'typecheck']) {
    const orden = pkg.scripts?.[guion];
    if (orden && orden.includes('tsc') && !/\btsc\s+-b\b/.test(orden)) {
      problemas.push(
        `${nombre}: el script "${guion}" usa \`${orden}\` — con \`tsc -p\` la ` +
          'dependencia NO se reconstruye; debe ser `tsc -b`',
      );
    }
  }
}

if (problemas.length > 0) {
  console.error('Una aplicación puede compilar contra un `dist/` desfasado (D-65):\n');
  for (const p of problemas) console.error(`  · ${p}`);
  console.error(
    '\nReferencias de proyecto + `tsc -b`: la dependencia se reconstruye antes de compilar.',
  );
  process.exit(1);
}

console.log(
  'OK ninguna aplicación compila contra un dist/ desfasado ' +
    `(${ubicacion.size} paquetes del espacio de trabajo, D-65)`,
);
