import { BadRequestException } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SANEAMIENTO DE ENTRADA · §2.7.4, que exigía esto desde la ETAPA 01
 *
 * El contrato lo dice sin ambigüedad: «Toda entrada de texto se **sanea y
 * normaliza antes de persistirse**: recorte, normalización Unicode NFC,
 * remoción de caracteres de control y bytes nulos, longitud máxima por campo».
 *
 * NUNCA SE CONSTRUYÓ. La auditoría de la ETAPA 13 lo midió por ejecución:
 *
 *   POST /…/ordenes  {"motivo":"Apertura\u0000autorizada\u0007por\u001bportería"}
 *     → 201, y al releer: ¿persiste \u0000? true  ¿\u0007? true  ¿\u001b? true
 *
 * Es H-13-06. Y no es cosmético:
 *
 *  · **El byte NUL** no cabe en un `text` de PostgreSQL. El valor viaja hasta
 *    el adaptador y revienta allí, lejos de donde entró — o peor, se guarda en
 *    un `jsonb` y rompe a quien lo lea después.
 *  · **Los caracteres de control** llegan a los registros. Un `\u001b` es el
 *    comienzo de una secuencia de escape ANSI: un motivo de apertura puede
 *    pintar texto falso en el terminal de quien lee la bitácora, o borrar la
 *    línea anterior. Es inyección en el visor de registros, y la bitácora es
 *    prueba de auditoría (RN-03).
 *  · **Sin NFC**, dos cadenas que se ven iguales no lo son, y una comparación
 *    de identidad —una placa, un documento— falla o duplica.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Y LA SEGUNDA MITAD · H-13-05, la lista blanca que no ve lo que hereda
 *
 * `forbidNonWhitelisted` rechaza `{"colado":"x"}` con 400 y ACEPTA, con 201,
 * `__proto__`, `constructor`, `toString`, `valueOf` y `hasOwnProperty`. Medido:
 *
 *   [A.1] clave colado      -> 400 RECHAZADA
 *   [A.1] clave __proto__   -> 201 ACEPTADA (whitelist no la ve)
 *   [A.1] clave constructor -> 201 ACEPTADA (whitelist no la ve)
 *
 * No hubo contaminación de prototipo —se comprobó: `Object.prototype.pol1..4`
 * quedaron `undefined`— porque Express protege ahí. Pero una lista blanca que
 * no ve cinco claves NO es una lista blanca, y la defensa en profundidad de
 * §2.7.3 depende de que lo sea. Se rechazan antes de llegar al pipe.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Claves que heredan de `Object.prototype` y que la lista blanca no ve. */
const CLAVES_PROHIBIDAS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

/**
 * Longitud máxima por campo de texto. No sustituye a la validación por DTO
 * —que es más estricta y específica— sino que pone un techo absoluto a lo que
 * puede entrar, incluido lo que ningún DTO declara.
 */
export const LONGITUD_MAXIMA_TEXTO = 4096;

/** Profundidad máxima del cuerpo. Más allá, es un intento de agotar la pila. */
const PROFUNDIDAD_MAXIMA = 32;

/**
 * Caracteres de control C0 y C1, salvo los tres que un texto legítimo puede
 * llevar: tabulador, salto de línea y retorno de carro. El byte NUL entra aquí.
 */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** Sanea una cadena: control fuera, NFC, recorte y techo de longitud. */
export const sanearTexto = (valor: string): string =>
  valor.replace(CONTROL, '').normalize('NFC').trim().slice(0, LONGITUD_MAXIMA_TEXTO);

/**
 * Recorre el valor saneando cadenas y rechazando claves heredadas. Devuelve un
 * objeto nuevo con prototipo nulo en cada nivel: aunque una clave se colara,
 * no habría prototipo que contaminar.
 */
export const sanear = (valor: unknown, profundidad = 0): unknown => {
  if (profundidad > PROFUNDIDAD_MAXIMA) {
    throw new BadRequestException(
      `El cuerpo excede la profundidad máxima de ${PROFUNDIDAD_MAXIMA} niveles`,
    );
  }
  if (typeof valor === 'string') return sanearTexto(valor);
  if (Array.isArray(valor)) return valor.map((v) => sanear(v, profundidad + 1));
  if (valor === null || typeof valor !== 'object') return valor;

  const limpio: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [clave, v] of Object.entries(valor)) {
    if (CLAVES_PROHIBIDAS.has(clave)) {
      throw new BadRequestException(`property ${clave} should not exist`);
    }
    limpio[sanearTexto(clave)] = sanear(v, profundidad + 1);
  }
  return limpio;
};

/**
 * Middleware, no pipe, y el motivo importa: un pipe solo ve lo que un DTO
 * declara, y estas tres garantías tienen que valer también en las rutas sin
 * DTO. Corre antes que `ValidationPipe`, así que lo que llega a validarse ya
 * está limpio.
 */
export class SaneamientoMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (req.body !== undefined && req.body !== null) {
      req.body = sanear(req.body) as Request['body'];
    }
    if (req.query !== undefined) {
      const limpio = sanear(req.query) as Record<string, unknown>;
      // `req.query` es de solo lectura en Express 5: se reemplaza su contenido.
      for (const k of Object.keys(req.query)) delete (req.query as Record<string, unknown>)[k];
      Object.assign(req.query as Record<string, unknown>, limpio);
    }
    next();
  }
}
