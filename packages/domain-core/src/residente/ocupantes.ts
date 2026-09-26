import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * OCUPANTES DE UNA VIVIENDA · ETAPA 15-I (D6, 3.3, ADR-025)
 *
 * El primer residente declara UNA VEZ cuántas personas viven en la vivienda, y
 * es DEFINITIVO: añadir o quitar lo hace sólo el superadministrador. Cada
 * ocupante tiene su PLAZA y cada plaza su CÓDIGO; con él, cada persona vincula
 * su propia cuenta. Sirve para dos cosas: contar ocupantes y que nadie de otra
 * vivienda se declare conviviente.
 *
 * El código no se guarda en ninguna parte (ADR-025): se deriva de la plaza y de
 * su generación con una llave de la copropiedad. Este fichero decide su FORMA
 * —alfabeto sin caracteres confundibles, longitud— y la infraestructura pone
 * los bytes.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export const OCUPANTES_MINIMO = 1;
export const OCUPANTES_MAXIMO = 20;

/** El texto que la app y la consola muestran ANTES de confirmar. Uno solo. */
export const AVISO_OCUPANTES_DEFINITIVO =
  'Este número es DEFINITIVO. Si más adelante necesita añadir o quitar ocupantes, deberá solicitarlo al superadministrador de su copropiedad.';

export type MotivoDeNoDeclarar =
  | 'YA_DECLARADA'
  | 'NO_ES_PRIMER_RESIDENTE'
  | 'SIN_CONFIRMACION'
  | 'NUMERO_INVALIDO';

export interface SolicitudDeDeclaracion {
  readonly numero: number;
  /** El residente confirmó explícitamente que el número es definitivo. */
  readonly confirmado: boolean;
  readonly esPrimerResidente: boolean;
  readonly yaDeclarada: boolean;
}

/**
 * Los dos primeros motivos son de PERMISO —cambiar el número no le toca— y los
 * dos últimos de FORMA. Se comprueban en ese orden: a quien no puede declarar
 * no se le explica cómo debería haber escrito el número.
 */
export const decidirDeclaracion = (
  s: SolicitudDeDeclaracion,
): Resultado<number, MotivoDeNoDeclarar> => {
  if (s.yaDeclarada) return fallo('YA_DECLARADA');
  if (!s.esPrimerResidente) return fallo('NO_ES_PRIMER_RESIDENTE');
  if (!s.confirmado) return fallo('SIN_CONFIRMACION');
  if (!Number.isInteger(s.numero) || s.numero < OCUPANTES_MINIMO || s.numero > OCUPANTES_MAXIMO) {
    return fallo('NUMERO_INVALIDO');
  }
  return exito(s.numero);
};

export const esMotivoDePermiso = (m: MotivoDeNoDeclarar): boolean =>
  m === 'YA_DECLARADA' || m === 'NO_ES_PRIMER_RESIDENTE';

/** Sin I, O, 0 ni 1: se dicta por teléfono y se copia de una pantalla. */
export const ALFABETO_DE_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LONGITUD_DE_CODIGO = 8;

/** Cinco bytes → ocho símbolos de cinco bits (40 bits: un billón de combinaciones). */
export const codigoDesdeBytes = (bytes: Uint8Array): string => {
  // 40 bits caben de sobra en un `number` (53 bits exactos): sin BigInt.
  let acumulado = 0;
  for (let i = 0; i < 5; i += 1) acumulado = acumulado * 256 + (bytes[i] ?? 0);
  let codigo = '';
  for (let i = LONGITUD_DE_CODIGO - 1; i >= 0; i -= 1) {
    codigo += ALFABETO_DE_CODIGO[Math.floor(acumulado / 2 ** (i * 5)) % 32] ?? '';
  }
  return codigo;
};

/** Lo que el residente escribe: sin espacios ni guiones y en mayúsculas. */
export const normalizarCodigoDeOcupante = (bruto: string): Resultado<string, string> => {
  const limpio = bruto.normalize('NFKC').replace(/[\s-]/g, '').toUpperCase();
  if (limpio.length !== LONGITUD_DE_CODIGO) {
    return fallo(`El código de ocupante tiene ${String(LONGITUD_DE_CODIGO)} caracteres`);
  }
  for (const c of limpio) {
    if (!ALFABETO_DE_CODIGO.includes(c))
      return fallo('El código de ocupante no admite ese carácter');
  }
  return exito(limpio);
};

/** «ABCD-EFGH»: se lee en dos golpes. */
export const formatearCodigoDeOcupante = (codigo: string): string =>
  `${codigo.slice(0, 4)}-${codigo.slice(4)}`;
