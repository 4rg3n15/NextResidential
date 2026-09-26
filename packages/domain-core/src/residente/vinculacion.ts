/**
 * ═════════════════════════════════════════════════════════════════════════════
 * VINCULACIÓN DEL RESIDENTE CON SU VIVIENDA · ETAPA 15-I (D6, 3.2)
 *
 * Una cuenta nueva de residente no tiene vivienda: la declara en su primer
 * ingreso. Declarar la vivienda de otro es la forma más barata de colarse, así
 * que la regla es ésta, y vive aquí para que la app y la consola digan lo mismo:
 *
 *  · Si la vivienda YA tiene una cuenta vinculada, hace falta un CÓDIGO DE
 *    OCUPANTE que alguien de esa vivienda le dio. Sin él no hay vínculo.
 *  · Si NO tiene ninguna, quien entra marca «no lo tengo» y se vuelve el PRIMER
 *    residente: el único que puede declarar cuántos ocupantes hay (D6).
 *  · Los códigos equivocados cuentan: al quinto en quince minutos se bloquea el
 *    intento, antes incluso de mirar la vivienda —así el bloqueo no se esquiva
 *    probando viviendas distintas—.
 *
 * La propiedad la declara el propio residente y el sistema no puede probarla:
 * los contrapesos son la bitácora de solo inserción y la vista del
 * superadministrador, no esta función.
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
  | 'YA_VINCULADA';

export interface HechosDeVinculacion {
  readonly intentosFallidosRecientes: number;
  readonly viviendaExiste: boolean;
  readonly viviendaActiva: boolean;
  /** Alguna cuenta activa ya está vinculada a esa vivienda. */
  readonly viviendaTieneCuenta: boolean;
  /** El residente escribió un código (en vez de marcar «no lo tengo»). */
  readonly traeCodigo: boolean;
}

export type DecisionDeVinculacion =
  | { readonly vincular: 'como_primer_residente' }
  | { readonly vincular: 'con_codigo' }
  | { readonly vincular: false; readonly motivo: MotivoDeNoVincular };

/** El orden de los `if` ES la regla; hay una prueba por cada pareja en conflicto. */
export const decidirVinculacion = (h: HechosDeVinculacion): DecisionDeVinculacion => {
  if (h.intentosFallidosRecientes >= INTENTOS_DE_VINCULACION) {
    return { vincular: false, motivo: 'DEMASIADOS_INTENTOS' };
  }
  if (!h.viviendaExiste) return { vincular: false, motivo: 'VIVIENDA_INEXISTENTE' };
  if (!h.viviendaActiva) return { vincular: false, motivo: 'VIVIENDA_INACTIVA' };
  if (h.traeCodigo) return { vincular: 'con_codigo' };
  if (h.viviendaTieneCuenta) return { vincular: false, motivo: 'CODIGO_REQUERIDO' };
  return { vincular: 'como_primer_residente' };
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
      return 'Esa vivienda ya tiene residentes con cuenta: pídale a uno de ellos su código de ocupante y escríbalo aquí.';
    case 'CODIGO_INCORRECTO':
      return 'El código no corresponde a ninguna plaza libre de esa vivienda.';
    case 'DOCUMENTO_EN_USO':
      return 'Ese documento ya está vinculado a otra cuenta o a otra vivienda. Consulte con el superadministrador.';
    case 'YA_VINCULADA':
      return 'Su cuenta ya está vinculada a esa vivienda.';
  }
};
