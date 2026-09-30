import { DISPARADORES_DE_ATENCION } from '../../eventos';
import type { DisparadorDeAtencion } from '../../eventos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * G2 (15-N) · QUÉ SE ABRE SOLO Y QUÉ SUENA, POR COPROPIEDAD Y DISPARADOR
 *
 * Por omisión, todo activado: la llamada, el rostro, la placa, la lista negra
 * y lo dudoso abren solos la Atención y suenan. El administrador puede apagar
 * cualquiera de las dos cosas para un disparador —p. ej. que la placa no suene
 * en una portería con tráfico—; lo que no se guardó vale «activado». Una
 * preferencia desconocida no se inventa ni se guarda: la forma la valida el
 * DTO y aquí sólo se mezclan las conocidas.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface PreferenciaDeDisparador {
  readonly abrir: boolean;
  readonly sonar: boolean;
}

export type PreferenciasDeAtencion = Readonly<
  Record<DisparadorDeAtencion, PreferenciaDeDisparador>
>;

export const ACTIVADO: PreferenciaDeDisparador = { abrir: true, sonar: true };

export const PREFERENCIAS_POR_OMISION: PreferenciasDeAtencion = Object.fromEntries(
  DISPARADORES_DE_ATENCION.map((d) => [d, ACTIVADO]),
) as PreferenciasDeAtencion;

/** Lo guardado (parcial, quizá con claves viejas) sobre los valores por omisión. */
export const mezclarPreferencias = (guardadas: unknown): PreferenciasDeAtencion => {
  const fuente =
    typeof guardadas === 'object' && guardadas !== null
      ? (guardadas as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    DISPARADORES_DE_ATENCION.map((d) => {
      const p = fuente[d];
      const objeto = typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : {};
      return [
        d,
        {
          abrir: typeof objeto['abrir'] === 'boolean' ? objeto['abrir'] : true,
          sonar: typeof objeto['sonar'] === 'boolean' ? objeto['sonar'] : true,
        },
      ];
    }),
  ) as PreferenciasDeAtencion;
};

export interface RepositorioDePreferenciasDeAtencion {
  /** Lo guardado tal cual, o `null` si la copropiedad no guardó nada. */
  leer(copropiedadId: string): Promise<unknown>;
  guardar(
    copropiedadId: string,
    preferencias: PreferenciasDeAtencion,
    actorId: string,
  ): Promise<void>;
}
export const PREFERENCIAS_DE_ATENCION = Symbol.for('ncr.guardia.PreferenciasDeAtencion');
