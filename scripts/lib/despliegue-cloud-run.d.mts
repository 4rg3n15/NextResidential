export const OBLIGATORIAS: readonly string[];
export const SECRETAS: readonly string[];
export function variablesDeclaradas(ejemplo: string): Set<string>;
export function leerVariables(plantilla: string): Map<string, string>;
export function leerSecretos(lista: string): Map<string, string>;
export function problemas(
  variables: Map<string, string>,
  secretos: Map<string, string>,
  declaradas: Set<string>,
): string[];
export function sustituir(
  variables: Map<string, string>,
  entorno: Readonly<Record<string, string | undefined>>,
): Map<string, string>;
export function comoYaml(variables: Map<string, string>): string;
export function banderaDeSecretos(secretos: Map<string, string>): string;
export function cargar(raiz: string): {
  readonly variables: Map<string, string>;
  readonly secretos: Map<string, string>;
};
