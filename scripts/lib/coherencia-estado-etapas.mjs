#!/usr/bin/env node
/**
 * CONTROL · `docs/ESTADO_ETAPAS.md` no puede contradecirse a sí mismo.
 *
 * POR QUÉ EXISTE. La cabecera del documento se congeló **dos veces**. La
 * primera, en el estado de la ETAPA 00 durante seis etapas: decía «2 de 17
 * cerradas» con cuatro fichas marcadas `CERRADA` unos párrafos más abajo. El
 * usuario añadió entonces (2026-09-08) una regla al DoD de toda etapa: el
 * cierre actualiza **la cabecera y el mapa**, no solo la ficha. La segunda vez
 * fue el 2026-09-18: dos fusiones después —el adaptador de barrera y el alta de
 * viviendas—, la cabecera seguía en «9 de 17», el mapa marcaba la 09 *EN CURSO*
 * y la 10 *PENDIENTE*, y la ficha de la 10 decía **CONSTRUIDA**, un estado que
 * el propio documento no declara entre los posibles.
 *
 * Es la decimoctava aparición del patrón que persigue este repositorio: **el
 * control existe pero no comprueba lo que crees**. La regla estaba escrita, en
 * prosa, dentro del documento que debía gobernar — y nada la ejecutaba. Una
 * regla que solo se comprueba a ojo no es un control: es una intención.
 *
 * QUÉ COMPRUEBA, todo contra el propio documento y nunca contra una lista
 * escondida aquí:
 *
 *   1. El vocabulario de estados sale de `**Estados posibles:**`. Un estado
 *      inventado —`CONSTRUIDA`— es un fallo, porque un lector no sabe si está
 *      antes o después de `CERRADA`.
 *   2. Mapa y ficha de detalle dicen lo mismo para cada etapa.
 *   3. El recuento de la cabecera cuadra con las filas `CERRADA` del mapa, y el
 *      total con el número de filas.
 *   4. El rango «(ETAPAS 00 a NN)» de la cabecera cubre exactamente las etapas
 *      cerradas: ni una fuera, ni una dentro que no lo esté.
 *   5. La «etapa siguiente habilitada» no puede ser una etapa ya cerrada.
 *   6. Toda etapa cerrada tiene ficha y enlace a su informe. Cerrar sin
 *      informe rompe §2.8.
 *   7. La fecha de «Última actualización» no es anterior a la fecha más
 *      reciente que aparezca en el documento. Es la forma mecánica de detectar
 *      la cabecera congelada: si una ficha registra el 16 y la cabecera dice
 *      el 15, la cabecera es de otro día que el documento.
 *
 *   node scripts/lib/coherencia-estado-etapas.mjs [ruta-del-documento]
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ruta = process.argv[2] ?? 'docs/ESTADO_ETAPAS.md';
const texto = readFileSync(ruta, 'utf8');
const lineas = texto.split('\n');

const problemas = [];
const mal = (mensaje) => problemas.push(mensaje);

// ─── 1 · el vocabulario, tomado del documento ────────────────────────────────
const lineaVocabulario = lineas.find((l) => /^\*\*Estados posibles:\*\*/.test(l));
if (lineaVocabulario === undefined) {
  console.error(`FALLO ${ruta} no declara «**Estados posibles:**»; sin vocabulario no hay control`);
  process.exit(1);
}
const VOCABULARIO = [...lineaVocabulario.matchAll(/`([A-ZÁÉÍÓÚÑ ]+)`/g)].map((m) => m[1].trim());
if (VOCABULARIO.length === 0) {
  console.error(`FALLO el vocabulario de estados de ${ruta} está vacío`);
  process.exit(1);
}
// Del más largo al más corto: «EN CURSO» antes que cualquier prefijo suyo.
const ordenados = [...VOCABULARIO].sort((a, b) => b.length - a.length);

/** Estados del vocabulario presentes en un texto, en mayúsculas y como palabra. */
const estadosEn = (celda) => {
  const hallados = [];
  for (const estado of ordenados) {
    if (new RegExp(`(?<![A-ZÁÉÍÓÚÑ])${estado}(?![A-ZÁÉÍÓÚÑ])`).test(celda)) hallados.push(estado);
  }
  return hallados;
};

/**
 * Palabras en mayúsculas sostenidas que PARECEN un estado y no están en el
 * vocabulario. Es lo que cazó `CONSTRUIDA`. Se exigen ≥ 5 letras para no
 * confundirse con siglas (`RN`, `KPI`, `DoD`) ni con `ETAPA`.
 */
const INTRUSOS_EXENTOS = new Set(['ETAPA', 'ETAPAS', 'CIERRE', 'ABIERTO', 'CERRADO']);
const intrusosEn = (celda) =>
  [...celda.matchAll(/\b([A-ZÁÉÍÓÚÑ]{5,})\b/g)]
    .map((m) => m[1])
    .filter((p) => !VOCABULARIO.includes(p) && !INTRUSOS_EXENTOS.has(p));

// ─── 2 · el mapa de etapas ───────────────────────────────────────────────────
/** @type {Map<string, {estado: string, informe: string, linea: number}>} */
const mapa = new Map();
for (const [indice, linea] of lineas.entries()) {
  const fila = /^\|\s*\*{0,2}(\d{2})\*{0,2}\s*\|/.exec(linea);
  if (fila === null) continue;
  const celdas = linea
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());
  if (celdas.length < 6) continue; // no es una fila del mapa de etapas
  const etapa = fila[1];
  const celdaEstado = celdas[4] ?? '';
  const hallados = estadosEn(celdaEstado);
  if (hallados.length === 0) {
    const intrusos = intrusosEn(celdaEstado);
    mal(
      `mapa · ETAPA ${etapa} (línea ${indice + 1}): «${celdaEstado}» no declara ningún estado del ` +
        `vocabulario${intrusos.length > 0 ? ` (¿«${intrusos[0]}»?)` : ''}`,
    );
    continue;
  }
  if (hallados.length > 1) {
    mal(
      `mapa · ETAPA ${etapa} (línea ${indice + 1}): dos estados a la vez, ${hallados.join(' y ')}`,
    );
  }
  mapa.set(etapa, { estado: hallados[0], informe: celdas[5] ?? '', linea: indice + 1 });
}

if (mapa.size === 0) {
  console.error(`FALLO no se encontró el mapa de etapas en ${ruta}`);
  process.exit(1);
}

// ─── 3 · las fichas de detalle ───────────────────────────────────────────────
/** @type {Map<string, {estado: string, linea: number}>} */
const fichas = new Map();
for (const [indice, linea] of lineas.entries()) {
  const encabezado = /^##\s+ETAPA\s+(\d{2})\b(.*)$/.exec(linea);
  if (encabezado === null) continue;
  const etapa = encabezado[1];
  const resto = encabezado[2];
  const hallados = estadosEn(resto);
  if (hallados.length === 0) {
    const intrusos = intrusosEn(resto);
    mal(
      `ficha · ETAPA ${etapa} (línea ${indice + 1}): el encabezado no declara un estado del ` +
        `vocabulario${intrusos.length > 0 ? `; «${intrusos[0]}» no es uno de ellos` : ''}`,
    );
    continue;
  }
  // La primera ficha de una etapa manda: las rondas posteriores se anotan
  // debajo, no en otro encabezado de nivel 2.
  if (!fichas.has(etapa)) fichas.set(etapa, { estado: hallados[0], linea: indice + 1 });
}

// ─── 4 · mapa contra ficha ───────────────────────────────────────────────────
for (const [etapa, ficha] of fichas) {
  const enMapa = mapa.get(etapa);
  if (enMapa === undefined) {
    mal(`ETAPA ${etapa} tiene ficha (línea ${ficha.linea}) y no figura en el mapa de etapas`);
    continue;
  }
  if (enMapa.estado !== ficha.estado) {
    mal(
      `ETAPA ${etapa}: el mapa dice ${enMapa.estado} (línea ${enMapa.linea}) y su ficha dice ` +
        `${ficha.estado} (línea ${ficha.linea})`,
    );
  }
}

const cerradas = [...mapa.entries()]
  .filter(([, v]) => v.estado === 'CERRADA')
  .map(([k]) => k)
  .sort();

// ─── 5 · toda etapa cerrada, con ficha y con informe ─────────────────────────
for (const etapa of cerradas) {
  if (!fichas.has(etapa)) mal(`ETAPA ${etapa} está CERRADA en el mapa y no tiene ficha de detalle`);
  const informe = mapa.get(etapa)?.informe ?? '';
  if (!/\[[^\]]+\]\([^)]+\)/.test(informe)) {
    mal(`ETAPA ${etapa} está CERRADA y su columna de informe no enlaza nada («${informe}»)`);
  }
}

// ─── 6 · el recuento de la cabecera ──────────────────────────────────────────
const filaRecuento = lineas.find((l) => /\*\*Etapas cerradas\*\*/.test(l));
if (filaRecuento === undefined) {
  mal('la cabecera no tiene la fila «**Etapas cerradas**»');
} else {
  const cifras = /\*\*(\d+)\s+de\s+(\d+)\*\*/.exec(filaRecuento);
  if (cifras === null) {
    mal(`la fila «Etapas cerradas» no lleva el recuento en la forma «**N de M**»: ${filaRecuento}`);
  } else {
    const [, declaradas, total] = cifras;
    if (Number(declaradas) !== cerradas.length) {
      mal(
        `la cabecera declara ${declaradas} etapas cerradas y el mapa marca ${cerradas.length} ` +
          `(${cerradas.join(', ')})`,
      );
    }
    if (Number(total) !== mapa.size) {
      mal(`la cabecera declara un total de ${total} etapas y el mapa tiene ${mapa.size} filas`);
    }
  }

  // El rango «(ETAPAS 00 a 09)» tiene que cubrir exactamente las cerradas.
  const rango = /ETAPAS?\s+(\d{2})\s+a\s+(\d{2})/.exec(filaRecuento);
  if (rango !== null) {
    const dentro = [...mapa.keys()].filter((e) => e >= rango[1] && e <= rango[2]).sort();
    const sobran = dentro.filter((e) => !cerradas.includes(e));
    const faltan = cerradas.filter((e) => !dentro.includes(e));
    if (sobran.length > 0) {
      mal(
        `el rango «ETAPAS ${rango[1]} a ${rango[2]}» de la cabecera incluye etapas que NO están ` +
          `cerradas: ${sobran.join(', ')}`,
      );
    }
    if (faltan.length > 0) {
      mal(
        `hay etapas CERRADAS fuera del rango «ETAPAS ${rango[1]} a ${rango[2]}» de la cabecera: ` +
          `${faltan.join(', ')}`,
      );
    }
  }
}

// ─── 7 · la etapa siguiente habilitada no puede estar cerrada ────────────────
const filaSiguiente = lineas.find((l) => /\*\*Etapa siguiente habilitada\*\*/.test(l));
if (filaSiguiente !== undefined) {
  const nombradas = [...filaSiguiente.matchAll(/ETAPA\s+(\d{2})/g)].map((m) => m[1]);
  if (nombradas.length === 0) {
    mal('la fila «Etapa siguiente habilitada» no nombra ninguna ETAPA NN');
  }
  for (const etapa of nombradas) {
    if (cerradas.includes(etapa)) {
      mal(`la cabecera ofrece la ETAPA ${etapa} como siguiente habilitada y ya está CERRADA`);
    }
  }
}

// ─── 8 · la fecha de la cabecera no puede ser la más vieja del documento ─────
const filaFecha = /\*\*Última actualización:\*\*\s*(\d{4}-\d{2}-\d{2})/.exec(texto);
if (filaFecha === null) {
  mal('la cabecera no lleva «**Última actualización:** AAAA-MM-DD»');
} else {
  const fechas = [...texto.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map((m) => m[1]);
  const masReciente = fechas.sort().at(-1);
  if (masReciente !== undefined && filaFecha[1] < masReciente) {
    mal(
      `la cabecera dice «Última actualización: ${filaFecha[1]}» y el documento registra hechos ` +
        `del ${masReciente}: la cabecera se quedó atrás`,
    );
  }
}

// ─── 9 · una rama «en curso» que ya está fusionada ───────────────────────────
/**
 * AÑADIDO EN LA ETAPA 13, a petición del usuario, y por un caso real: al abrir
 * la etapa, la cabecera seguía diciendo «en curso la rama `correccion-macos`» y
 * su ficha presentaba el PR #22 como abierto. Estaba fusionado en develop desde
 * hacía horas. El control no lo veía porque solo miraba el documento contra sí
 * mismo, y esto es el documento contra **el repositorio**.
 *
 * Se pregunta a git, no a GitHub: una rama cuyo commit de punta ya es ancestro
 * de la rama actual está fusionada, y eso es exactamente lo que significa un PR
 * cerrado con merge. No hace falta red, ni credenciales, ni que el control se
 * crea lo que le cuenten.
 *
 * Las ramas que git no puede resolver —un clon sin sus referencias, como el
 * banco de pruebas negativas— NO se dan por buenas en silencio: el recuento de
 * comprobadas sale en la línea de veredicto, y si es cero se ve.
 */
const enCurso = new Set();
for (const linea of lineas) {
  if (!/en curso/i.test(linea)) continue;
  for (const m of linea.matchAll(/`([a-z0-9][a-z0-9._\/-]{3,})`/g)) {
    const nombre = m[1];
    // Solo lo que parece una RAMA. Se descartan rutas de fichero, comandos y
    // —esto costó un falso positivo al escribirlo— las SHA abreviadas, que en
    // este documento aparecen en la misma frase que la rama que las produjo.
    if (/\.[a-z]{2,4}$/.test(nombre) || nombre.includes(' ')) continue;
    if (/^[0-9a-f]{7,40}$/.test(nombre)) continue;
    enCurso.add(nombre);
  }
}
let comprobadas = 0;
for (const rama of enCurso) {
  let punta;
  try {
    punta = execFileSync('git', ['rev-parse', '--verify', '--quiet', `${rama}^{commit}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    continue; // no resoluble aquí; se refleja en el recuento final
  }
  if (punta === '') continue;
  comprobadas += 1;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', punta, 'HEAD'], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    mal(
      `la rama \`${rama}\` se describe como «en curso» y ya está FUSIONADA ` +
        `(su punta ${punta.slice(0, 7)} es ancestro de HEAD): un PR cerrado no es trabajo en curso`,
    );
  } catch {
    /* no fusionada: en curso de verdad */
  }
}

// ─── veredicto ───────────────────────────────────────────────────────────────
if (problemas.length > 0) {
  console.error(`FALLO ${ruta} se contradice en ${problemas.length} punto(s):`);
  for (const p of problemas) console.error(`  · ${p}`);
  console.error(
    '\nUna etapa no se cierra dejando la cabecera o el mapa atrás (regla del DoD, 2026-09-08).',
  );
  process.exit(1);
}

console.log(
  `coherente: ${mapa.size} etapas en el mapa, ${cerradas.length} cerradas con ficha e informe, ` +
    `cabecera al día · ${comprobadas} de ${enCurso.size} rama(s) «en curso» comprobadas contra git`,
);
