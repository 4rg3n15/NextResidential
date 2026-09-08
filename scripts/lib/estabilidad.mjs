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
// eslint-disable-next-line no-control-regex
const SIN_COLOR = /\u001B\[[0-9;]*m/g;

const firmaDe = (salida, codigo) => {
  const lineas = salida
    .split('\n')
    .map((l) => l.replace(SIN_COLOR, '').replace(/\s+/g, ' ').trim());
  const recuentos = lineas.filter((l) => /(Tests|Test Files) \d|Tests \d+ failed/.test(l)).sort();
  const rojas = lineas.filter((l) => l.startsWith('× ')).sort();
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
  const r = spawnSync(comando, {
    shell: true,
    encoding: 'utf8',
    // Sin esto, de la segunda corrida en adelante turbo replica el registro de
    // la primera y no ejecuta nada. Comprobado.
    env: { ...process.env, TURBO_FORCE: 'true', CI: '1' },
    maxBuffer: 64 * 1024 * 1024,
  });
  const firma = firmaDe(`${r.stdout ?? ''}${r.stderr ?? ''}`, r.status ?? 1);
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
    for (const r of c.rojas.slice(0, 5)) console.log(`     ${r}`);
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
