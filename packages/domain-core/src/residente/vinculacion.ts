/**
 * ═════════════════════════════════════════════════════════════════════════════
 * VINCULACIÓN DEL RESIDENTE CON SU VIVIENDA · ETAPA 15-I (D6, 3.2) · RONDA 15-W
 *
 * Desde la 15-W (D-W9, ADR-037) NINGUNA cuenta llega a una vivienda declarando
 * que está vacía: la PRIMERA cuenta de cada vivienda —su titular— la crea la
 * administración ya asignada a ella, y las demás entran con un código de plaza
 * que el titular comparte. Antes, «no lo tengo» convertía a quien llegara
 * primero en el titular de CUALQUIER vivienda sin cuentas: con las credenciales
 * que daba la administración, se tomaba la casa de otro (problema 1 de la 15-W).
 *
 * Esta regla decide el vínculo POR CÓDIGO (el cambio de vivienda desde el
 * perfil, 3.5), y vive aquí para que la app y la consola digan lo mismo:
 *
 *  · El TITULAR no se muda desde la app (`TITULAR_NO_SE_MUDA`): su vivienda se
 *    quedaría sin nadie que gestione sus plazas, y la titularidad sólo la da la
 *    administración. PENDIENTE DE DEFINICIÓN P-38 (cambio de titular): mientras
 *    tanto, denegar por defecto (§2.1.4).
 *  · Una vivienda sin ninguna cuenta no admite a nadie: la administración
 *    entrega primero la del titular (`VIVIENDA_SIN_TITULAR`).
 *  · Una vivienda con cuentas exige el CÓDIGO de una plaza libre.
 *  · Los códigos equivocados cuentan: al quinto en quince minutos se bloquea el
 *    intento, antes incluso de mirar la vivienda —así el bloqueo no se esquiva
 *    probando viviendas distintas—.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export const INTENTOS_DE_VINCULACION = 5;
export const VENTANA_DE_INTENTOS_MINUTOS = 15;

export type MotivoDeNoVincular =
  | 'DEMASIADOS_INTENTOS'
  | 'VIVIENDA_INEXISTENTE'
  | 'AGRUPACION_REQUERIDA'
  | 'VIVIENDA_INACTIVA'
  | 'CODIGO_REQUERIDO'
  | 'CODIGO_INCORRECTO'
  | 'DOCUMENTO_EN_USO'
  | 'YA_VINCULADA'
  | 'VIVIENDA_SIN_TITULAR'
  | 'TITULAR_NO_SE_MUDA';

export interface HechosDeVinculacion {
  /** La cuenta es la titular de la vivienda en la que vive hoy. */
  readonly esTitular: boolean;
  readonly intentosFallidosRecientes: number;
  readonly viviendaExiste: boolean;
  readonly viviendaActiva: boolean;
  /** Alguna cuenta activa ya está vinculada a esa vivienda (su titular, al menos). */
  readonly viviendaTieneCuenta: boolean;
  /** El residente escribió un código de plaza. */
  readonly traeCodigo: boolean;
}

export type DecisionDeVinculacion =
  | { readonly vincular: 'con_codigo' }
  | { readonly vincular: false; readonly motivo: MotivoDeNoVincular };

/** El orden de los `if` ES la regla; hay una prueba por cada pareja en conflicto. */
export const decidirVinculacion = (h: HechosDeVinculacion): DecisionDeVinculacion => {
  // Primero: no depende de qué vivienda ni de qué código se intente.
  if (h.esTitular) return { vincular: false, motivo: 'TITULAR_NO_SE_MUDA' };
  if (h.intentosFallidosRecientes >= INTENTOS_DE_VINCULACION) {
    return { vincular: false, motivo: 'DEMASIADOS_INTENTOS' };
  }
  if (!h.viviendaExiste) return { vincular: false, motivo: 'VIVIENDA_INEXISTENTE' };
  if (!h.viviendaActiva) return { vincular: false, motivo: 'VIVIENDA_INACTIVA' };
  // Ni con código: sin titular no hay plazas que una persona pueda reclamar.
  if (!h.viviendaTieneCuenta) return { vincular: false, motivo: 'VIVIENDA_SIN_TITULAR' };
  if (!h.traeCodigo) return { vincular: false, motivo: 'CODIGO_REQUERIDO' };
  return { vincular: 'con_codigo' };
};

/** Lo que lee el residente. Ninguno nombra a nadie de la vivienda. */
export const explicacionDeVinculacion = (motivo: MotivoDeNoVincular): string => {
  switch (motivo) {
    case 'DEMASIADOS_INTENTOS':
      return `Demasiados intentos con un código equivocado. Espere ${String(VENTANA_DE_INTENTOS_MINUTOS)} minutos y vuelva a intentarlo.`;
    case 'VIVIENDA_INEXISTENTE':
      return 'Esa vivienda no existe en su copropiedad. Revise el número (y la torre, si aplica).';
    case 'AGRUPACION_REQUERIDA':
      return 'Hay más de una vivienda con ese número: indique también su agrupación (torre, manzana, sector…).';
    case 'VIVIENDA_INACTIVA':
      return 'Esa vivienda está inactiva. Consulte con la administración.';
    case 'CODIGO_REQUERIDO':
      return 'Para vincularse a esa vivienda necesita el código de una plaza: pídaselo a su titular.';
    case 'CODIGO_INCORRECTO':
      return 'El código no corresponde a ninguna plaza libre de esa vivienda.';
    case 'DOCUMENTO_EN_USO':
      return 'Ese documento ya está vinculado a otra cuenta o a otra vivienda. Consulte con el superadministrador.';
    case 'YA_VINCULADA':
      return 'Su cuenta ya está vinculada a esa vivienda.';
    case 'VIVIENDA_SIN_TITULAR':
      return 'Esta vivienda aún no tiene titular: la administración entrega la primera cuenta.';
    case 'TITULAR_NO_SE_MUDA':
      return 'Como titular de su vivienda, no puede cambiarse de vivienda desde la app: pídalo a la administración.';
  }
};
