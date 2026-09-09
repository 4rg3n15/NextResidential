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
 *  3. Ninguna propiedad del esquema puede quedarse sin `type`. Es la regla que
 *     el propio contrato destapó: `@ApiProperty({ nullable: true })` sin `type:`
 *     genera un esquema sin tipo, que `openapi-typescript` traduce a
 *     `Record<string, never>`. El DTO parecía tipado y no lo estaba.
 *  4. Las exenciones se declaran AQUÍ, con su etapa, y **caducan solas**: si una
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

/**
 * ¿La propiedad declara un tipo escalar utilizable?
 *
 * ESTA es la comprobación que faltaba y que el propio contrato destapó al
 * generarse por primera vez: `@ApiProperty({ nullable: true })` sin `type:`
 * produce un esquema **sin `type`**, y `openapi-typescript` lo traduce a
 * `Record<string, never>`. El campo queda declarado, el DTO tiene propiedades y
 * la regla 2 daba verde — mientras la consola recibía un tipo tan inservible
 * como `unknown`. Veintiocho campos estaban así.
 */
const escalarUtil = (e) =>
  typeof e.type === 'string' ||
  typeof e.enum !== 'undefined' ||
  Array.isArray(e.oneOf) ||
  Array.isArray(e.allOf) ||
  Array.isArray(e.anyOf);

/** Un `$ref` que no resuelve dentro del documento rompe al generador. */
const refColgante = (esquema, profundidad = 0) => {
  if (esquema === undefined || esquema === null || profundidad > 6) return false;
  if (typeof esquema.$ref === 'string') {
    const destino = resolver(esquema);
    // No basta con que ESTE `$ref` resuelva: el colgante puede estar dentro de
    // lo que apunta. Sin descender, la sonda daba verde sobre un contrato que
    // hacía abortar al generador.
    return destino === undefined ? true : refColgante(destino, profundidad + 1);
  }
  const hijos = [
    esquema.items,
    ...Object.values(esquema.properties ?? {}),
    ...(esquema.oneOf ?? []),
    ...(esquema.allOf ?? []),
    ...(esquema.anyOf ?? []),
  ].filter((x) => x !== undefined && x !== null);
  return hijos.some((h) => refColgante(h, profundidad + 1));
};

/** ¿El esquema aporta forma, o es un `object` vacío que vuelve a ser `unknown`? */
const tieneForma = (esquema, profundidad = 0) => {
  const e = resolver(esquema);
  if (e === undefined || e === null || profundidad > 6) return false;
  if (e.type === 'array') return tieneForma(e.items, profundidad + 1);
  // Una composición vale por sus miembros, no por existir. Un `$ref` colgando
  // dentro de un `oneOf` daba verde aquí y hacía **abortar al generador**:
  // el contrato estaba roto y el control decía que no. Ahora se entra.
  const composicion = e.oneOf ?? e.allOf ?? e.anyOf;
  if (Array.isArray(composicion)) {
    return composicion.length > 0 && composicion.every((m) => tieneForma(m, profundidad + 1));
  }
  if (e.type === 'object' || e.properties !== undefined) {
    if (e.additionalProperties !== undefined && e.additionalProperties !== false) return true;
    const propiedades = Object.entries(e.properties ?? {});
    if (propiedades.length === 0) return false;
    // Regla 4: cada propiedad tiene que aportar forma ella misma. Recursión
    // acotada a 6 niveles (§2.4): estos esquemas anidan tres como mucho.
    return propiedades.every(([, v]) => {
      const p = resolver(v);
      if (p === undefined || p === null) return false;
      if (p.type === 'object' || p.properties !== undefined) return tieneForma(p, profundidad + 1);
      if (p.type === 'array') return tieneForma(p, profundidad + 1);
      return escalarUtil(p);
    });
  }
  return escalarUtil(e);
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

    for (const [codigo, r] of Object.entries(operacion.responses ?? {})) {
      for (const medio of Object.values(r.content ?? {})) {
        if (refColgante(medio.schema)) {
          problemas.push(`${clave} · respuesta ${codigo} con un $ref que no resuelve`);
        }
      }
    }

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
