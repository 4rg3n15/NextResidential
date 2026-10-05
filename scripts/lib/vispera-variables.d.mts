export const VARIABLES_DESDE_LA_15N: {
  readonly api: Readonly<Record<string, string>>;
  readonly consola: Readonly<Record<string, string>>;
};

export function leerDotenv(contenido: string): Map<string, string>;

export interface EntornosDeLaVispera {
  readonly api: Map<string, string> | null;
  readonly consola: Map<string, string> | null;
  readonly rotulos: { readonly api: string; readonly consola: string };
}

export function leerEntornos(raiz: string, rutaEnvApi: string): EntornosDeLaVispera;

export function lineasDeVariables(entornos: EntornosDeLaVispera): string[];
