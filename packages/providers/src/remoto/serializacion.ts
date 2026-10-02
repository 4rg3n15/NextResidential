/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · LO QUE VIAJA POR EL TÚNEL, Y CÓMO VUELVE A SER LO QUE ERA
 *
 * Las llamadas del puerto llevan cosas que JSON no sabe decir: los BYTES de una
 * foto o de una plantilla, FECHAS, la `Vigencia` del dominio, `undefined` en
 * medio de una lista de argumentos y los ERRORES tipados. Cada uno va marcado
 * con una clave que no puede chocar con un campo del dominio (`$b`, `$d`…) y
 * vuelve a ser del mismo tipo al otro lado. Lo que no se sabe transportar —una
 * función, un símbolo— no se aproxima: se rechaza.
 *
 * La recursión es la del dato: el árbol de salidas de un videoportero es un
 * árbol (equipo → módulo → salida), y sus listas y objetos se recorren. Va
 * ACOTADA (`PROFUNDIDAD_MAXIMA`): un dato más hondo no es de este dominio, es un
 * mensaje hostil o roto, y se rechaza como fuera de protocolo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { Vigencia, esExito } from '@ncr/domain-core';
import { ProtocoloInvalido, reconstruirError } from './errores-remotos';

export const PROFUNDIDAD_MAXIMA = 24;

/** Lo que ya puede ir en `JSON.stringify` sin perder nada. */
export type Transportable =
  | null
  | boolean
  | number
  | string
  | readonly Transportable[]
  | { readonly [clave: string]: Transportable };

const esObjetoPlano = (v: object): boolean => {
  const prototipo: unknown = Object.getPrototypeOf(v);
  return prototipo === Object.prototype || prototipo === null;
};

/** Los campos propios de un error, sin la pila: la pila es de la otra máquina. */
const camposDeError = (error: Error, nivel: number): Record<string, Transportable> => {
  const campos: Record<string, Transportable> = {};
  for (const [clave, valor] of Object.entries(error)) {
    if (clave === 'stack' || clave === 'message' || clave === 'name' || clave === 'cause') continue;
    if (typeof valor === 'function') continue;
    campos[clave] = codificarEn(valor, nivel + 1);
  }
  return campos;
};

const codificarEn = (valor: unknown, nivel: number): Transportable => {
  if (nivel > PROFUNDIDAD_MAXIMA) throw new ProtocoloInvalido('dato demasiado hondo');
  if (valor === undefined) return { $u: 1 };
  if (valor === null || typeof valor === 'boolean' || typeof valor === 'string') return valor;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) throw new ProtocoloInvalido('número no finito');
    return valor;
  }
  if (typeof valor !== 'object') throw new ProtocoloInvalido(`no se transporta un ${typeof valor}`);
  if (valor instanceof Uint8Array) return { $b: Buffer.from(valor).toString('base64') };
  if (valor instanceof Date) return { $d: valor.toISOString() };
  if (valor instanceof Vigencia) {
    return { $v: { desde: valor.desde.toISOString(), hasta: valor.hasta.toISOString() } };
  }
  if (valor instanceof Error) {
    return {
      $e: { nombre: valor.name, mensaje: valor.message, campos: camposDeError(valor, nivel) },
    };
  }
  if (Array.isArray(valor)) return valor.map((v: unknown) => codificarEn(v, nivel + 1));
  if (!esObjetoPlano(valor)) {
    // Una instancia de otra clase viaja por sus campos propios: el otro lado la
    // recibe como objeto plano. Las del dominio que importan tienen marca propia.
    if (Object.values(valor).some((v) => typeof v === 'function')) {
      throw new ProtocoloInvalido('un objeto con funciones no se transporta');
    }
  }
  const salida: Record<string, Transportable> = {};
  for (const [clave, v] of Object.entries(valor)) {
    if (clave.startsWith('$')) throw new ProtocoloInvalido(`clave reservada «${clave}»`);
    if (v === undefined) continue;
    salida[clave] = codificarEn(v, nivel + 1);
  }
  return salida;
};

/** Valor del dominio → valor que JSON transporta sin perder el tipo. */
export const codificar = (valor: unknown): Transportable => codificarEn(valor, 0);

const texto = (v: unknown, que: string): string => {
  if (typeof v !== 'string') throw new ProtocoloInvalido(`${que} no es texto`);
  return v;
};

const decodificarEn = (valor: unknown, nivel: number): unknown => {
  if (nivel > PROFUNDIDAD_MAXIMA) throw new ProtocoloInvalido('dato demasiado hondo');
  if (valor === null || typeof valor !== 'object') return valor;
  if (Array.isArray(valor)) return valor.map((v: unknown) => decodificarEn(v, nivel + 1));
  const o = valor as Record<string, unknown>;
  if ('$u' in o) return undefined;
  if ('$b' in o) return Buffer.from(texto(o['$b'], 'bytes'), 'base64');
  if ('$d' in o) {
    const fecha = new Date(texto(o['$d'], 'fecha'));
    if (Number.isNaN(fecha.getTime())) throw new ProtocoloInvalido('fecha ilegible');
    return fecha;
  }
  if ('$v' in o) {
    const v = (o['$v'] ?? {}) as Record<string, unknown>;
    const r = Vigencia.crear(
      new Date(texto(v['desde'], 'desde')),
      new Date(texto(v['hasta'], 'hasta')),
    );
    if (!esExito(r)) throw new ProtocoloInvalido('vigencia inválida');
    return r.valor;
  }
  if ('$e' in o) {
    const e = (o['$e'] ?? {}) as Record<string, unknown>;
    const campos = decodificarEn(e['campos'] ?? {}, nivel + 1) as Record<string, unknown>;
    return reconstruirError(texto(e['nombre'], 'nombre'), texto(e['mensaje'], 'mensaje'), campos);
  }
  const salida: Record<string, unknown> = {};
  for (const [clave, v] of Object.entries(o)) {
    if (clave.startsWith('$')) throw new ProtocoloInvalido(`clave reservada «${clave}»`);
    salida[clave] = decodificarEn(v, nivel + 1);
  }
  return salida;
};

/** Lo que llegó por el túnel → el valor del dominio que el otro lado envió. */
export const decodificar = (valor: unknown): unknown => decodificarEn(valor, 0);
