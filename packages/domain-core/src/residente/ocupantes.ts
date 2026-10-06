import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * OCUPANTES DE UNA VIVIENDA · ETAPA 15-I (D6, 3.3, ADR-025) · RONDA 15-W
 *
 * Cada ocupante tiene su PLAZA y cada plaza su CÓDIGO; con él, cada adulto crea
 * su propia cuenta («Crear cuenta», D-W1) o cambia de vivienda (3.5). Un menor
 * ocupa la suya sin cuenta (D-W2). Sirve para dos cosas: contar ocupantes y que
 * nadie de otra vivienda se declare conviviente.
 *
 * Desde la 15-W la declaración ya NO es definitiva (D-W10): el TITULAR gestiona
 * las plazas de su vivienda —añade y retira las libres— hasta un tope de 4 en
 * total, contándose a sí mismo ([SUPUESTO] S-15W-03). Más plazas las autoriza el
 * superadministrador, subiendo el tope de ESA vivienda. La decisión final del
 * tope es de la base (`tg_tope_de_plazas`, 0056): aquí se decide para explicar.
 *
 * El código no se guarda en ninguna parte (ADR-025): se deriva de la plaza y de
 * su generación con una llave de la copropiedad. Este fichero decide su FORMA
 * —alfabeto sin caracteres confundibles, longitud, el prefijo del conjunto— y
 * la infraestructura pone los bytes.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export const OCUPANTES_MINIMO = 1;
/** Cota absoluta de la plataforma: ningún tope la supera. */
export const OCUPANTES_MAXIMO = 20;
/** D-W10 · S-15W-03 · el tope de una vivienda que nadie amplió, contando al titular. */
export const PLAZAS_POR_DEFECTO = 4;

/** El texto que la app y la consola muestran en Ocupantes. Uno solo. */
export const avisoDeOcupantes = (tope: number): string =>
  `Usted gestiona las plazas de su vivienda: hasta ${String(tope)} en total, contándose usted. ` +
  'Puede añadir plazas y retirar las libres; para más, pídalo a la administración.';

export type MotivoDeNoDeclarar =
  | 'YA_DECLARADA'
  | 'NO_ES_PRIMER_RESIDENTE'
  | 'NUMERO_INVALIDO'
  | 'SUPERA_EL_TOPE';

export interface SolicitudDeDeclaracion {
  readonly numero: number;
  readonly esPrimerResidente: boolean;
  readonly yaDeclarada: boolean;
  /** El tope vigente de la vivienda (el suyo, o el de su copropiedad). */
  readonly tope: number;
}

/**
 * Los dos primeros motivos son de PERMISO —declarar no le toca— y los dos
 * últimos de FORMA. Se comprueban en ese orden: a quien no puede declarar no se
 * le explica cómo debería haber escrito el número.
 */
export const decidirDeclaracion = (
  s: SolicitudDeDeclaracion,
): Resultado<number, MotivoDeNoDeclarar> => {
  if (s.yaDeclarada) return fallo('YA_DECLARADA');
  if (!s.esPrimerResidente) return fallo('NO_ES_PRIMER_RESIDENTE');
  if (!Number.isInteger(s.numero) || s.numero < OCUPANTES_MINIMO || s.numero > OCUPANTES_MAXIMO) {
    return fallo('NUMERO_INVALIDO');
  }
  if (s.numero > s.tope) return fallo('SUPERA_EL_TOPE');
  return exito(s.numero);
};

export const esMotivoDePermiso = (m: MotivoDeNoDeclarar): boolean =>
  m === 'YA_DECLARADA' || m === 'NO_ES_PRIMER_RESIDENTE';

/**
 * D4 bis · ¿cabe una plaza más? `activas` cuenta todas las vivas, la del
 * titular incluida. Devuelve cuántas habrá después; el motivo, si no cabe.
 */
export const decidirNuevaPlaza = (p: {
  readonly activas: number;
  readonly tope: number;
}): Resultado<number, 'TOPE_ALCANZADO'> =>
  p.activas < Math.min(p.tope, OCUPANTES_MAXIMO) ? exito(p.activas + 1) : fallo('TOPE_ALCANZADO');

export const explicacionDelTope = (tope: number): string =>
  `Su vivienda tiene el máximo de ${String(tope)} plazas. Para más, pídalo a la administración.`;

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

/** El código corto del conjunto (0038): de 3 a 8 letras o cifras. */
const PREFIJO = /^[A-Z0-9]{3,8}$/;

/** Un código de invitación, ya separado: el prefijo del conjunto y los 8 símbolos. */
export interface CodigoDeInvitacion {
  /** `null` si se escribió sin prefijo (vale dentro de la ruta de su copropiedad). */
  readonly prefijo: string | null;
  readonly codigo: string;
}

/**
 * Lo que el residente escribe, con o sin el prefijo del conjunto y con los
 * guiones y espacios que quiera: `MIRA-K7PQ-2XWZ`, `mira k7pq2xwz`, `K7PQ-2XWZ`.
 * Los 8 últimos símbolos son el código; lo que va delante, el prefijo.
 */
export const normalizarCodigoDeOcupante = (
  bruto: string,
): Resultado<CodigoDeInvitacion, string> => {
  const limpio = bruto.normalize('NFKC').replace(/[\s-]/g, '').toUpperCase();
  if (limpio.length < LONGITUD_DE_CODIGO) {
    return fallo(`El código de ocupante tiene ${String(LONGITUD_DE_CODIGO)} caracteres`);
  }
  const codigo = limpio.slice(-LONGITUD_DE_CODIGO);
  const prefijo = limpio.slice(0, -LONGITUD_DE_CODIGO);
  for (const c of codigo) {
    if (!ALFABETO_DE_CODIGO.includes(c))
      return fallo('El código de ocupante no admite ese carácter');
  }
  if (prefijo !== '' && !PREFIJO.test(prefijo)) {
    return fallo('El código de invitación empieza por el código de su conjunto');
  }
  return exito({ prefijo: prefijo === '' ? null : prefijo, codigo });
};

/** «MIRA-ABCD-EFGH» (o «ABCD-EFGH» si el conjunto aún no tiene código corto). */
export const formatearCodigoDeOcupante = (codigo: string, prefijo: string | null): string =>
  `${prefijo === null ? '' : `${prefijo}-`}${codigo.slice(0, 4)}-${codigo.slice(4)}`;
