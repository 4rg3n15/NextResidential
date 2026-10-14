import type { Acceso } from '@ncr/domain-core';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL AVISO DE ACCESO AL RESIDENTE · HU-34 · RONDA 15-Z2 · DT-15R-08
 *
 * El texto del aviso llevaba el identificador crudo del equipo («… en
 * 70000000-…»): cosmético, sin dato personal, pero ilegible para quien lo
 * recibe en el teléfono. Desde aquí lleva el NOMBRE del equipo y, si nadie lo
 * sabe, lo dice en palabras; nunca el identificador.
 *
 * Función pura, fuera de `RegistrarAcceso` (334 líneas, que no debe crecer):
 * se prueba sin construir el caso de uso.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface NombreDeEquipo {
  /** El nombre con que la copropiedad registró el equipo, o `null` si no se lee. */
  nombreDe(dispositivoId: string): Promise<string | null>;
}

/** Lo que `RegistrarAcceso` recibe además de sus puertos (vive aquí para no hacerlo crecer). */
export interface OpcionesDeRegistrarAcceso {
  /** E5 (15-M) · una alerta por (equipo, tipo) y ventana. */
  readonly ventanaDeDuplicadosMs?: number;
  /** 15-Z2 (DT-15R-08) · el nombre del equipo para el aviso; sin él, «un equipo sin nombre». */
  readonly nombreDeEquipo?: NombreDeEquipo;
}

export const EQUIPO_SIN_NOMBRE = 'un equipo sin nombre';

export const avisoDeAcceso = (
  acceso: Pick<Acceso, 'permitido' | 'metodo' | 'motivo'>,
  nombreDelEquipo: string | null,
): { readonly titulo: string; readonly cuerpo: string } =>
  acceso.permitido
    ? {
        titulo: 'Acceso registrado',
        cuerpo: `Ingreso por ${acceso.metodo} en ${nombreDelEquipo ?? EQUIPO_SIN_NOMBRE}.`,
      }
    : { titulo: 'Acceso denegado', cuerpo: `Intento denegado (${acceso.motivo ?? 'sin motivo'}).` };
