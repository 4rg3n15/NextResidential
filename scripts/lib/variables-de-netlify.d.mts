export const OBLIGATORIAS: readonly string[];
export const CABECERA_DE_NETLIFY: string;
export function juzgarVariables(variables: Readonly<Record<string, unknown>>): string[];
export function leerCabeceras(texto: string): {
  readonly codigo: number;
  readonly cabeceras: Readonly<Record<string, string>>;
};
export function juzgarCabeceras(respuesta: {
  readonly codigo: number;
  readonly cabeceras: Readonly<Record<string, string>>;
}): string[];
export function juzgarEmpaquetado(entrada: {
  readonly funciones: readonly { readonly name: string; readonly runtimeVersion?: string }[];
  readonly rutasDeBorde: readonly { readonly function: string; readonly pattern: string }[];
  readonly nodeMayor: string;
}): string[];
