/**
 * Errores tipados del dominio (§2.4).
 *
 * `MotivoAcceso` es la enumeración cerrada que exige el contrato. Al ser un
 * tipo unión y no un `string`, añadir un motivo obliga al compilador a revisar
 * cada `switch` que lo consuma: el exhaustivo de `nuncaOcurre` convierte un
 * olvido en un error de compilación en vez de en una rama silenciosa.
 */
export const MOTIVOS_ACCESO = [
  'VIGENCIA_EXPIRADA',
  'AFORO_SUPERADO',
  'LISTA_NEGRA',
  'ZONA_NO_AUTORIZADA',
  'FUERA_DE_PATRON',
  'FUERA_DE_HORARIO',
  'SIN_CONSENTIMIENTO',
  'PLACA_DESCONOCIDA',
  'CONFIANZA_INSUFICIENTE',
  'FALLO_TECNICO',
] as const;

export type MotivoAcceso = (typeof MOTIVOS_ACCESO)[number];

/** Códigos de fallo de dominio que no son decisiones de acceso. */
export const CODIGOS_ERROR = [
  'INVARIANTE_VIOLADA',
  'ENTIDAD_NO_ENCONTRADA',
  'CONFLICTO_DE_CONCURRENCIA',
  'OPERACION_NO_PERMITIDA',
  'DATO_INVALIDO',
] as const;

export type CodigoError = (typeof CODIGOS_ERROR)[number];

export interface ErrorDominio {
  readonly codigo: CodigoError;
  /** Mensaje para la bitácora, nunca para el usuario final sin traducir. */
  readonly detalle: string;
  /** Regla de negocio que se incumplió, cuando aplica: 'RN-04'. */
  readonly regla?: string;
}

export const errorDominio = (codigo: CodigoError, detalle: string, regla?: string): ErrorDominio =>
  regla === undefined ? { codigo, detalle } : { codigo, detalle, regla };

/**
 * Exhaustividad. Si un `switch` deja de cubrir un caso de una unión, este
 * ayudante deja de compilar. Es la red que hace segura la ampliación de
 * `MotivoAcceso` — como ocurrió con `FUERA_DE_HORARIO` (D-18).
 */
export const nuncaOcurre = (valor: never, mensaje = 'Caso no cubierto'): never => {
  throw new Error(`${mensaje}: ${String(valor)}`);
};
