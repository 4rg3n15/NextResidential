export const TOPE_SIN_COMPRIMIR_MB: number;
export const BUSCAR_PROHIBIDOS: string;
export function juzgar(medido: {
  readonly nodeDeLaImagen: string;
  readonly nvmrc: string;
  readonly usuario: string;
  readonly prohibidos: readonly string[];
  readonly sinComprimirMb: number;
  readonly codigoEscribible: boolean;
}): string[];
