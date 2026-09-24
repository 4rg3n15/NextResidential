#!/usr/bin/env node
/**
 * FRONTERA DE EXTENSIBILIDAD · O2, ETAPA 15-D.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ CONDICIÓN VIGILA, Y POR QUÉ NO BASTA CON KPI-11
 *
 * KPI-11 impide que el VOCABULARIO del fabricante —«ISAPI», una IP— salga de
 * `packages/providers`. Con eso, el resto del sistema no nombra el protocolo.
 * Pero puede seguir acoplado a la MARCA por otras dos vías que KPI-11 no mira:
 *
 *   1. Importando el paquete de proveedores desde donde no debe: el dominio o
 *      la capa de aplicación. Ahí «cambiar de fabricante» deja de ser cambiar
 *      una variable de entorno.
 *   2. Nombrando un adaptador concreto —`HikvisionProvider`, `TerminalFacial`,
 *      la carpeta `hikvision/`— fuera del paquete o desde el adaptador de otra
 *      marca. Un adaptador ficticio que reutilizara el cliente de la marca real
 *      no probaría que el contrato está completo en el núcleo: probaría que dos
 *      carpetas se entienden entre sí.
 *
 * La prueba de fuego de O2 —«un adaptador ficticio de una marca inventada, con
 * capacidades reducidas, pasa la suite de contrato sin que se toque una línea
 * de dominio»— sólo demuestra algo si estas tres cosas se mantienen:
 *
 *   A. `packages/domain-core/` no importa `@ncr/providers` de ninguna forma, y
 *      todo `**\/aplicacion/**` de la API y del Edge no lo importa como VALOR:
 *      sólo `import type` de sus contratos neutrales (la ficha de un equipo, la
 *      publicación que el ingestor recibe). Un tipo no ejecuta nada del
 *      paquete; un valor sí, y ahí empieza el acoplamiento.
 *   B. Ningún fichero fuera de `packages/providers/src/` IMPORTA ni CONSTRUYE un
 *      adaptador de marca (`HikvisionProvider`, `TerminalFacial`, `Videoportero`,
 *      `IntercomDeEquipo`, `ControlDeBarreraVehicular`, o una subcarpeta de marca
 *      del paquete). Un rótulo de pantalla que diga «videoportero» no es un
 *      acoplamiento: un `new Videoportero(` fuera del paquete, sí.
 *   C. `packages/providers/src/ficticio/` importa SÓLO `@ncr/domain-core`,
 *      `../nucleo/` y `../fabrica` (para registrarse). Nada de `hikvision/`,
 *      `terminal/`, `videoportero/`, `barrera/`, `camara/`, `equipo/`,
 *      `simulacion/` ni `mock/`.
 *   D. El barril `packages/providers/src/index.ts` NO exporta `ficticio/`: una
 *      marca inventada no puede acabar en un despliegue.
 *
 * Uso: node scripts/lib/frontera-extensibilidad.mjs [raíz]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const raiz = (process.argv[2] ?? process.cwd()).replace(/\/$/, '');
const IGNORADOS = new Set(['node_modules', 'dist', 'coverage', '.turbo', '.git', 'build', '.next']);
const EXENCION = /kpi-11-exento|extensibilidad-exenta/i;

function* ficheros(dir, extension = /\.(ts|tsx|mjs|js)$/) {
  if (!existsSync(dir)) return;
  for (const entrada of readdirSync(dir)) {
    if (IGNORADOS.has(entrada)) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) yield* ficheros(ruta, extension);
    else if (extension.test(entrada)) yield ruta;
  }
}

const IMPORTA = /(?:^|\n)\s*((?:import|export)\s[^;]*?)from\s+['"]([^'"]+)['"]/g;
const importacionesDe = (texto) => [...texto.matchAll(IMPORTA)].map((m) => m[2]);
/** Importaciones que traen VALOR: `import { x }` o `import x`, no `import type`. */
const importacionesDeValor = (texto) =>
  [...texto.matchAll(IMPORTA)]
    .filter((m) => !/^(?:import|export)\s+type\b/.test(m[1]))
    .map((m) => m[2]);

const violaciones = [];
const anotar = (fichero, motivo) => violaciones.push(`${relative(raiz, fichero)} · ${motivo}`);

// ── A · dominio y aplicación no conocen el paquete de proveedores ────────────
const RAICES_A = [join(raiz, 'packages', 'domain-core', 'src')];
const apiSrc = join(raiz, 'apps', 'api', 'src');
for (const f of ficheros(apiSrc)) {
  if (relative(apiSrc, f).split(sep).includes('aplicacion')) RAICES_A.push(f);
}
const edgeSrc = join(raiz, 'apps', 'edge', 'src');
for (const f of ficheros(edgeSrc)) {
  const partes = relative(edgeSrc, f).split(sep);
  if (partes.includes('aplicacion') || partes.includes('dominio')) RAICES_A.push(f);
}
const candidatosA = RAICES_A.flatMap((r) => (statSync(r).isDirectory() ? [...ficheros(r)] : [r]));
const esProviders = (esp) =>
  esp === '@ncr/providers' || esp.startsWith('@ncr/providers/') || /packages\/providers/.test(esp);
for (const f of candidatosA) {
  const texto = readFileSync(f, 'utf8');
  const enDominio = f.startsWith(join(raiz, 'packages', 'domain-core'));
  const sospechosas = enDominio ? importacionesDe(texto) : importacionesDeValor(texto);
  for (const esp of sospechosas) {
    if (esProviders(esp)) {
      anotar(
        f,
        enDominio
          ? `el dominio importa «${esp}» (A): el dominio no conoce el paquete de proveedores`
          : `la capa de aplicación importa «${esp}» como VALOR (A): sólo se admite \`import type\``,
      );
    }
  }
}

// ── B · nadie fuera del paquete nombra un adaptador de marca ─────────────────
const ADAPTADORES =
  /\b(?:HikvisionProvider|TerminalFacial|Videoportero|IntercomDeEquipo|ControlDeBarreraVehicular)\b/;
const MARCAS = [
  // Construir uno fuera del paquete.
  new RegExp(`new\\s+${ADAPTADORES.source.replace(/^\\b|\\b$/g, '')}\\s*\\(`),
  // Importarlo por nombre desde el paquete.
  new RegExp(`import[^;]*${ADAPTADORES.source}[^;]*from\\s+['"]@ncr\\/providers`),
  // O entrar a una subcarpeta de marca del paquete.
  /from\s+['"]@ncr\/providers\/(?:src\/)?(?:hikvision|terminal|videoportero|barrera|camara)\b/,
  /from\s+['"][^'"]*packages\/providers\/src\/(?:hikvision|terminal|videoportero|barrera|camara)\b/,
];
const paquete = join(raiz, 'packages', 'providers');
for (const carpeta of ['apps', 'packages', 'scripts']) {
  for (const f of ficheros(join(raiz, carpeta))) {
    if (f.startsWith(paquete + sep)) continue;
    const lineas = readFileSync(f, 'utf8').split('\n');
    lineas.forEach((linea, i) => {
      if (EXENCION.test(linea)) return;
      // Un comentario que explica el diseño no es un acoplamiento.
      if (/^\s*(\/\/|\*|\/\*)/.test(linea)) return;
      for (const marca of MARCAS) {
        if (marca.test(linea)) {
          anotar(
            f,
            `línea ${i + 1} importa o construye un adaptador de marca (B): ${linea.trim().slice(0, 80)}`,
          );
        }
      }
    });
  }
}

// ── C · el ficticio sólo toca el núcleo ──────────────────────────────────────
const ficticio = join(paquete, 'src', 'ficticio');
const PERMITIDAS_C = [/^@ncr\/domain-core$/, /^\.\.\/nucleo\//, /^\.\.\/fabrica$/, /^\.\//];
if (!existsSync(ficticio)) {
  violaciones.push(
    'packages/providers/src/ficticio/ no existe: la prueba de fuego de O2 desapareció',
  );
} else {
  for (const f of ficheros(ficticio)) {
    for (const esp of importacionesDe(readFileSync(f, 'utf8'))) {
      if (esp === 'vitest') continue;
      if (!PERMITIDAS_C.some((p) => p.test(esp))) {
        anotar(f, `el adaptador ficticio importa «${esp}»: sólo puede tocar el núcleo (C)`);
      }
    }
  }
}

// ── D · el barril no exporta la marca inventada ──────────────────────────────
const barril = join(paquete, 'src', 'index.ts');
if (existsSync(barril)) {
  for (const esp of importacionesDe(readFileSync(barril, 'utf8'))) {
    if (/ficticio/.test(esp))
      anotar(barril, `exporta «${esp}»: la marca inventada saldría a producción (D)`);
  }
}

if (violaciones.length > 0) {
  console.error(
    'FALLO frontera-extensibilidad: el sistema se acopló a una marca o el ficticio a otra:',
  );
  for (const v of violaciones) console.error(`  ✗ ${v}`);
  console.error(
    '\n  O2 (ETAPA 15-D): el hardware se elige por CAPACIDADES, nunca por marca. El dominio y la\n' +
      '  aplicación no importan @ncr/providers; fuera del paquete nadie nombra un adaptador; y el\n' +
      '  adaptador ficticio sólo conoce el núcleo. Si necesita algo que no está en nucleo/, súbalo.',
  );
  process.exit(1);
}
console.log(
  `OK frontera-extensibilidad: ${candidatosA.length} fichero(s) de dominio/aplicación sin ` +
    '@ncr/providers, ningún adaptador nombrado fuera del paquete, y el ficticio sólo toca el núcleo',
);
