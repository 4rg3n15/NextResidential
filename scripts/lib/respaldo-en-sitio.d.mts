import type {
  EquipoDeEnsayo,
  RespaldoDeEquipo,
  ResultadoDeRestauracion,
} from '@ncr/providers/operacion';

/** Lo que el guion necesita del paquete de equipos (`@ncr/providers/operacion`). */
export interface OperacionesDeRespaldo {
  capturarRespaldo(equipo: EquipoDeEnsayo, ahora: Date): Promise<RespaldoDeEquipo>;
  restaurarRespaldo(
    equipo: EquipoDeEnsayo,
    respaldo: RespaldoDeEquipo,
  ): Promise<readonly ResultadoDeRestauracion[]>;
  leerSerieDelEquipo(equipo: EquipoDeEnsayo): Promise<string | null>;
  ficheroDelRespaldo(familia: EquipoDeEnsayo['familia'], serie: string): string;
  llaveDelRespaldo(familia: EquipoDeEnsayo['familia'], serie: string): string;
  respaldoPara<R extends Pick<RespaldoDeEquipo, 'familia' | 'serie'>>(
    respaldos: readonly R[],
    familia: EquipoDeEnsayo['familia'],
    serie: string,
  ): R | null;
}

export interface OpcionesDeRespaldo {
  readonly P: OperacionesDeRespaldo;
  readonly equipos: readonly EquipoDeEnsayo[];
  readonly carpeta: string;
  readonly decir: (linea: string) => void;
}

/** Devuelve el número de fallos. */
export function respaldar(opciones: OpcionesDeRespaldo): Promise<number>;
export function restaurar(opciones: OpcionesDeRespaldo): Promise<number>;
