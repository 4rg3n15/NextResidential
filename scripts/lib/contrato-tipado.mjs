#!/usr/bin/env node
/**
 * CONTROL · toda ruta declara el tipo de su respuesta en el contrato OpenAPI.
 *
 * POR QUÉ EXISTE. Hasta la ETAPA 09 ningún controlador declaraba
 * `@ApiOkResponse`, así que `openapi.json` describía cada respuesta como un
 * objeto sin esquema y `openapi-typescript` producía `unknown`. El efecto no era
 * un error: era un **verde falso**. La consola compilaba accediendo a campos
 * inexistentes, porque sobre `unknown` no hay nada que comprobar — la séptima
 * repetición de la misma familia de defecto que arrastra este proyecto: un
 * control que existe y no comprueba lo que uno cree.
 *
 * QUÉ EXIGE, en tres reglas:
 *
 *  1. Toda operación tiene al menos una respuesta 2xx **con `content`**, es
 *     decir con esquema. Una respuesta 2xx declarada y vacía no cuenta.
 *  2. El esquema no puede resolver a un objeto sin propiedades: un DTO sin
 *     `@ApiProperty` genera `{ type: 'object' }`, que en TypeScript vuelve a ser
 *     tan inútil como `unknown`.
 *  3. Las exenciones se declaran AQUÍ, con su etapa, y **caducan solas**: si una
 *     ruta exenta deja de existir o pasa a estar tipada, el control falla y
 *     obliga a quitarla de la lista. Una lista de excepciones que nadie poda es
 *     una lista que acaba tapando lo que debía vigilar.
 *
 * Una ruta NUEVA sin tipo y sin exención falla el control el día que se añade,
 * que es el único momento en que arreglarlo es barato.
 *
 *   node scripts/lib/contrato-tipado.mjs [ruta/al/openapi.json]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Rutas que todavía no declaran su respuesta, con la etapa que las tipará.
 * La ETAPA 09-A tipó las que consume la consola de administración; el resto
 * entra con la pantalla que lo consume.
 */
const EXENTAS = new Map([
  ['POST /padron/vehiculos', 'ETAPA 09-B · pantalla de vehículos'],
  ['POST /padron/vehiculos/{id}/desactivacion', 'ETAPA 09-B · pantalla de vehículos'],
  ['POST /padron/viviendas/{id}/desactivacion', 'ETAPA 09-B · pantalla de viviendas'],
  ['POST /padron/carga', 'ETAPA 09-B · carga de padrón (HU-03)'],
  ['GET /copropiedades/{id}/zonas', 'ETAPA 09-B · pantalla de zonas comunes'],
  ['POST /copropiedades/{id}/zonas/{zonaId}/configuracion', 'ETAPA 09-B · pantalla de zonas'],
  ['POST /copropiedades/{id}/zonas/{zonaId}/ingresos', 'ETAPA 10 · consola operativa'],
  ['POST /copropiedades/{id}/zonas/{zonaId}/salidas', 'ETAPA 10 · consola operativa'],
  ['POST /copropiedades/{id}/zonas/{zonaId}/autorizaciones', 'ETAPA 09-B · pantalla de visitantes'],
  ['POST /copropiedades/{id}/biometria/capturas', 'ETAPA 11 · captura desde la app'],
  ['GET /copropiedades/{id}/biometria/consentimientos/{consentimientoId}', 'ETAPA 11'],
  ['POST /copropiedades/{id}/biometria/consentimientos/{consentimientoId}/respuesta', 'ETAPA 11'],
  ['POST /copropiedades/{id}/biometria/consentimientos/{consentimientoId}/revocacion', 'ETAPA 11'],
  ['POST /copropiedades/{id}/biometria/plantillas/{plantillaId}/sincronizacion', 'ETAPA 15'],
  ['POST /copropiedades/{id}/biometria/barrido', 'ETAPA 15 · sin consumidor de interfaz'],
  ['POST /ingesta/eventos', 'ETAPA 15 · lo consume la cámara, no una interfaz'],
  ['POST /ingesta/latidos', 'ETAPA 15 · lo consume el dispositivo, no una interfaz'],
]);

const destino = resolve(process.argv[2] ?? 'packages/contracts/openapi.json');
let documento;
try {
  documento = JSON.parse(readFileSync(destino, 'utf8'));
} catch {
  console.log(`FALLO no se pudo leer el contrato en ${destino}: ¿corrió \`pnpm contrato\`?`);
  process.exit(1);
}

/** Resuelve `$ref` dentro del propio documento; sin recursión sobre datos externos. */
const resolver = (esquema, profundidad = 0) => {
  if (esquema === undefined || esquema === null || profundidad > 8) return esquema;
  if (typeof esquema.$ref === 'string') {
    const partes = esquema.$ref.replace(/^#\//, '').split('/');
    let nodo = documento;
    for (const parte of partes) nodo = nodo?.[parte];
    return resolver(nodo, profundidad + 1);
  }
  return esquema;
};

/** ¿El esquema aporta forma, o es un `object` vacío que vuelve a ser `unknown`? */
const tieneForma = (esquema) => {
  const e = resolver(esquema);
  if (e === undefined || e === null) return false;
  if (e.type === 'array') return tieneForma(e.items);
  if (Array.isArray(e.oneOf) || Array.isArray(e.allOf) || Array.isArray(e.anyOf)) return true;
  if (typeof e.format === 'string' || typeof e.enum !== 'undefined') return true;
  if (e.type === 'object' || e.properties !== undefined) {
    if (e.additionalProperties !== undefined && e.additionalProperties !== false) return true;
    return Object.keys(e.properties ?? {}).length > 0;
  }
  return typeof e.type === 'string';
};

const problemas = [];
const vistas = new Set();
const METODOS = new Set(['get', 'post', 'put', 'patch', 'delete']);

for (const [ruta, operaciones] of Object.entries(documento.paths ?? {})) {
  for (const [metodo, operacion] of Object.entries(operaciones)) {
    if (!METODOS.has(metodo)) continue;
    const clave = `${metodo.toUpperCase()} ${ruta}`;
    vistas.add(clave);

    const respuestas = Object.entries(operacion.responses ?? {}).filter(([c]) => c.startsWith('2'));
    const tipada = respuestas.some(([, r]) =>
      Object.values(r.content ?? {}).some((medio) => tieneForma(medio.schema)),
    );

    if (tipada && EXENTAS.has(clave)) {
      problemas.push(
        `${clave} · ya declara su respuesta: sobra la exención «${EXENTAS.get(clave)}»`,
      );
    }
    if (!tipada && !EXENTAS.has(clave)) {
      problemas.push(
        `${clave} · sin respuesta tipada. Añade @ApiOkResponse({ type: ... }) con un DTO ` +
          'decorado, o declara la exención con su etapa en scripts/lib/contrato-tipado.mjs',
      );
    }
  }
}

for (const [clave, etapa] of EXENTAS) {
  if (!vistas.has(clave)) {
    problemas.push(`${clave} · exenta («${etapa}») pero ya no existe en el contrato: quítala`);
  }
}

if (problemas.length > 0) {
  console.log('FALLO el contrato OpenAPI tiene respuestas sin tipo:');
  for (const p of problemas) console.log(`  · ${p}`);
  process.exit(1);
}

const tipadas = vistas.size - EXENTAS.size;
console.log(
  `OK ${tipadas} de ${vistas.size} operaciones con respuesta tipada; ` +
    `${EXENTAS.size} exentas con etapa declarada`,
);
