/**
 * Motivos de rechazo de autenticación. Tipados y cerrados: el manejador HTTP
 * decide qué código devolver, y ninguno de estos textos llega al cliente —
 * distinguir «firma inválida» de «token expirado» ayuda a un atacante a afinar.
 */
export const MOTIVOS_RECHAZO = [
  'SIN_TOKEN',
  'FORMATO_INVALIDO',
  'KID_DESCONOCIDO',
  'ALGORITMO_NO_ADMITIDO',
  'FIRMA_INVALIDA',
  'EXPIRADO',
  'EMISOR_INVALIDO',
  'AUDIENCIA_INVALIDA',
  'CLAIMS_INVALIDOS',
  'JWKS_NO_DISPONIBLE',
  'SEGUNDO_FACTOR_REQUERIDO',
] as const;
export type MotivoRechazo = (typeof MOTIVOS_RECHAZO)[number];

export class RechazoDeAutenticacion extends Error {
  constructor(
    readonly motivo: MotivoRechazo,
    detalle?: string,
  ) {
    super(detalle ?? motivo);
    this.name = 'RechazoDeAutenticacion';
  }
}
