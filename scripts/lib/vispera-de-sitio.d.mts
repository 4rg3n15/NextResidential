import type { Pool } from 'pg';

export interface MigracionDeLaVispera {
  readonly numero: string;
  readonly nombre: string;
  readonly aplicada: boolean;
}

export const MIGRACIONES_DE_LA_VISPERA: readonly { readonly numero: string }[];

export function migracionesDeLaVispera(
  pool: Pick<Pool, 'query'>,
  carpeta: string,
): Promise<{ readonly porRegistro: boolean; readonly migraciones: MigracionDeLaVispera[] }>;

export function lineasDeMigraciones(m: {
  readonly porRegistro: boolean;
  readonly migraciones: readonly MigracionDeLaVispera[];
}): string[];

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

export function sondearReenvioDeAudio(origen: string, plazoMs?: number): Promise<number | null>;

export function lineasDeLaConsola(origen: string, plazoMs?: number): Promise<string[]>;

export function comprobacionesDeLaVispera(opciones: {
  readonly pool: Pick<Pool, 'query'> | null;
  readonly decir: (linea: string) => void;
  readonly raiz: string;
  readonly rutaEnv: string;
  readonly consola?: string;
}): Promise<void>;
