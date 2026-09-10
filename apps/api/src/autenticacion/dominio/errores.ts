/**
 * Motivos de rechazo de autenticación. Tipados y cerrados: el manejador HTTP
 * decide qué código devolver, y ninguno de estos textos llega al cliente —
 * distinguir «firma inválida» de «token expirado» ayuda a un atacante a afinar.
 *
 * **La reserva importante, aprendida a base de rondas perdidas.** Ocultarle el
 * motivo al cliente es correcto; ocultárselo a la BITÁCORA no lo es, y colapsar
 * ahí es lo que hizo que un JWKS en 404 se registrara como `FIRMA_INVALIDA`
 * durante toda la ETAPA 09. Quien leyó ese registro persiguió una firma rota
 * que nunca existió. Por eso los fallos del SERVIDOR —el JWKS inalcanzable, un
 * error no previsto— tienen motivo propio: no son distinciones que el atacante
 * pueda provocar token a token, son estados globales que `/ready` ya publica, y
 * confundirlos con un token malo manda al operador al sitio equivocado.
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
  /** Fallo del servidor, no del token: nada que el cliente pueda corregir. */
  'ERROR_INESPERADO',
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
