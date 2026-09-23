#!/usr/bin/env node
/**
 * Control de INTERMITENCIA: ejecuta la suite varias veces y exige que el
 * resultado sea IDÉNTICO.
 *
 * POR QUÉ EXISTE (2026-09-08). Al cerrar la ETAPA 07, la primera ejecución del
 * usuario falló en una prueba HTTP con `socket hang up` y la segunda pasó sin
 * tocar nada. Una prueba intermitente es peor que una rota: la rota se arregla,
 * y la intermitente **enseña a reejecutar hasta el verde**. Ese hábito, una vez
 * adquirido, tapa defectos reales — precisamente lo que este guion existe para
 * impedir. Los seis controles anteriores atrapan familias concretas de falso
 * verde; este atrapa la familia entera de «depende de la corrida».
 *
 * QUÉ COMPARA. No solo «pasó / no pasó»: la firma de cada corrida lleva el
 * recuento por paquete, el de ficheros, los títulos de lo que falló y **los
 * errores no manejados**. Un `Unhandled Error` cuenta como fallo aunque las
 * pruebas salgan verdes: es la propia advertencia de Vitest —«This might cause
 * false positive tests»— y llegó a haber uno oculto en la suite, tapado porque
 * `supertest` cerraba el servidor antes de que aflorara.
 *
 * EL CACHÉ DE TURBO ES LA TRAMPA DE ESTE CONTROL, y está comprobada: sin
 * `TURBO_FORCE`, la segunda corrida informa `cache hit, replaying logs` y
 * reimprime los números de la primera **sin ejecutar una sola prueba**. Tres
 * corridas idénticas, ninguna ejecutada: el control se convertiría en el falso
 * verde más redondo del repositorio. Por eso fuerza la ejecución y lo declara.
 *
 * Uso:
 *   node scripts/lib/estabilidad.mjs [--repeticiones N] [--comando "<orden>"]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { ESCAPES_ANSI } from './sin-colores.mjs';
import { DIRECTORIO_DE_INFORMES } from './reporteros-de-prueba.mjs';

const argv = process.argv.slice(2);
const valorDe = (bandera, porDefecto) => {
  const i = argv.indexOf(bandera);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : porDefecto;
};

const repeticiones = Number(valorDe('--repeticiones', '3'));
const comando = valorDe('--comando', 'pnpm test');

if (!Number.isInteger(repeticiones) || repeticiones < 2) {
  console.error('FALLO estabilidad: se necesitan al menos 2 repeticiones para comparar');
  process.exit(1);
}

/**
 * Firma de una corrida: lo que debe ser idéntico entre repeticiones.
 *
 * Se normalizan los espacios porque Vitest alinea las columnas según el número
 * de dígitos, y una diferencia de formato no es una diferencia de resultado.
 */
// D-108 · y el patrón compartido, que además borra movimientos de cursor y
// borrados de línea. Aquí solo se quitaban los colores; turbo emite los otros.
const SIN_COLOR = ESCAPES_ANSI;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NOMBRAR LA ROJA · D-113, un escalón más abajo
 *
 * Antes, las rojas se recogían RASPANDO LA CONSOLA: las líneas que empiezan por
 * `× `, por `FAIL ` o por `→ `. Y ahí estaba el defecto que la ETAPA 15 dejó al
 * descubierto: este paso ejecuta la suite con `CI: '1'`, **y con `CI` puesto
 * Vitest cambia de reportero**. El resultado medido fue literal: «la corrida 1
 * terminó en rojo» y, debajo, la confesión de este mismo control —«sin nombre
 * de prueba en la salida: el reportero no lo emitió. Es un defecto de ESTE
 * control»—. Un diagnóstico que se apaga al cambiar una variable de entorno no
 * es un diagnóstico.
 *
 * La salida fiable no es el texto, es **el informe JSON**: tiene la misma forma
 * con cualquier reportero, y desde `scripts/lib/reporteros-de-prueba.mjs` cada
 * paquete lo emite SIEMPRE. Es exactamente lo que el paso 7 ya hacía con
 * `metricas.mjs`; aquí solo se deja de hacer a mano lo que ya estaba resuelto.
 *
 * Los informes se borran ANTES de cada corrida. Si no se borraran, una corrida
 * que muriera antes de escribir el suyo heredaría las rojas de la anterior:
 * dos firmas idénticas por un residuo en disco, que es justo el falso verde
 * que este guion persigue.
 * ═══════════════════════════════════════════════════════════════════════════
 */
// La raíz se deriva de donde viven los informes, no del directorio de
// trabajo: así los nombres de fichero salen relativos al repositorio
// aunque el guion se invoque desde otro sitio.
const RAIZ = dirname(DIRECTORIO_DE_INFORMES);

const limpiarInformes = () => {
  rmSync(DIRECTORIO_DE_INFORMES, { recursive: true, force: true });
  mkdirSync(DIRECTORIO_DE_INFORMES, { recursive: true });
};

/** Rojas nombradas por el informe JSON: `paquete › nombre completo (fichero)`. */
const rojasDelInforme = () => {
  if (!existsSync(DIRECTORIO_DE_INFORMES)) return { rojas: [], informes: 0 };
  const ficheros = readdirSync(DIRECTORIO_DE_INFORMES).filter((f) => f.endsWith('.json'));
  const rojas = [];
  for (const fichero of ficheros) {
    const paquete = basename(fichero, '.json');
    let informe;
    try {
      informe = JSON.parse(readFileSync(join(DIRECTORIO_DE_INFORMES, fichero), 'utf8'));
    } catch {
      // Un informe ilegible es en sí un dato: se nombra y se compara como
      // cualquier otra roja, en vez de desaparecer en un `catch` vacío.
      rojas.push(`${paquete} › informe JSON ilegible`);
      continue;
    }
    for (const suite of informe?.testResults ?? []) {
      for (const a of suite.assertionResults ?? []) {
        if (a.status !== 'failed') continue;
        const relativo = suite.name ? relative(RAIZ, suite.name) : '(fichero desconocido)';
        rojas.push(`${paquete} › ${a.fullName ?? a.title} (${relativo})`);
      }
    }
  }
  return { rojas: rojas.sort(), informes: ficheros.length };
};

const firmaDe = (salida, codigo, rojas) => {
  const lineas = salida
    .split('\n')
    .map((l) => l.replace(SIN_COLOR, '').replace(/\s+/g, ' ').trim());
  const recuentos = lineas.filter((l) => /(Tests|Test Files) \d|Tests \d+ failed/.test(l)).sort();
  const noManejados = lineas.filter((l) => /Unhandled Error|Uncaught Exception/.test(l)).length;
  return {
    codigo,
    recuentos,
    rojas,
    noManejados,
    texto: [`codigo=${codigo}`, `noManejados=${noManejados}`, ...recuentos, ...rojas].join('\n'),
  };
};

const corridas = [];
for (let i = 1; i <= repeticiones; i += 1) {
  limpiarInformes();
  const r = spawnSync(comando, {
    shell: true,
    encoding: 'utf8',
    // Sin esto, de la segunda corrida en adelante turbo replica el registro de
    // la primera y no ejecuta nada. Comprobado.
    env: { ...process.env, TURBO_FORCE: 'true', CI: '1' },
    maxBuffer: 64 * 1024 * 1024,
  });
  const { rojas, informes } = rojasDelInforme();
  const firma = firmaDe(`${r.stdout ?? ''}${r.stderr ?? ''}`, r.status ?? 1, rojas);
  firma.informes = informes;
  corridas.push(firma);
  const resumen =
    firma.recuentos.filter((l) => l.includes('Tests ')).join(' · ') || '(sin recuento)';
  console.log(`   corrida ${i}/${repeticiones}: codigo ${firma.codigo} · ${resumen}`);
}

const [primera] = corridas;
let fallos = 0;

/**
 * Un control que no encuentra nada y pasa igual es exactamente el fallo que
 * este guion persigue. Ocurrió en su primera versión: los códigos de color de
 * Vitest partían `Tests` de su número, no casaba una sola línea, y comparar dos
 * firmas vacías daba «idéntico». Sin recuentos no hay comparación posible.
 */
if (primera.recuentos.length === 0) {
  console.log(
    '   ✗ no se reconoció ningún recuento de pruebas en la salida: no hay nada que comparar',
  );
  fallos += 1;
}

for (const [i, c] of corridas.entries()) {
  if (c.codigo !== 0) {
    console.log(`   ✗ la corrida ${i + 1} terminó en rojo (codigo ${c.codigo})`);
    if (c.rojas.length > 0) {
      c.rojas.slice(0, 8).forEach((r) => console.log(`     ${r}`));
      if (c.rojas.length > 8) console.log(`     … y ${c.rojas.length - 8} más`);
    } else if (c.informes === 0) {
      // Ninguna prueba falló Y no hay un solo informe: la suite ni llegó a
      // ejecutarse. Es un fallo de arranque —configuración, dependencia,
      // compilación—, y decirlo así ahorra buscar una roja que no existe.
      console.log(
        `     (ninguna prueba falló y no se escribió un solo informe en ${relative(RAIZ, DIRECTORIO_DE_INFORMES)}: ` +
          'la suite no llegó a ejecutarse. Mire el error de arranque, no las pruebas)',
      );
    } else {
      // Informes escritos, ninguna aserción en rojo, y aun así código ≠ 0:
      // el fallo está FUERA de las pruebas (umbral de cobertura, error sin
      // manejar, un paso posterior de turbo).
      console.log(
        `     (${c.informes} informe(s) escritos y ninguna aserción en rojo: ` +
          'el código de salida viene de fuera de las pruebas — cobertura, error sin manejar o un paso posterior)',
      );
    }
    fallos += 1;
  }
  if (c.noManejados > 0) {
    console.log(
      `   ✗ la corrida ${i + 1} dejó ${c.noManejados} error(es) sin manejar: Vitest advierte que pueden producir falsos positivos`,
    );
    fallos += 1;
  }
}

for (const [i, c] of corridas.entries()) {
  if (i === 0 || c.texto === primera.texto) continue;
  console.log(`   ✗ la corrida ${i + 1} NO coincide con la primera. Diferencias:`);
  const a = new Set(primera.texto.split('\n'));
  const b = new Set(c.texto.split('\n'));
  for (const l of primera.texto.split('\n')) if (!b.has(l)) console.log(`     solo en la 1: ${l}`);
  for (const l of c.texto.split('\n')) if (!a.has(l)) console.log(`     solo en la ${i + 1}: ${l}`);
  fallos += 1;
}

if (fallos > 0) {
  console.log(
    'FALLO estabilidad: la suite no es reproducible. Una prueba intermitente enseña a reejecutar hasta el verde.',
  );
  process.exit(1);
}

console.log(
  `OK estabilidad: ${repeticiones} corridas forzadas (sin caché de turbo) con resultado idéntico y ningún error sin manejar`,
);
