import type {
  AccessPointProvider,
  FaceTemplateProvider,
  IntercomProvider,
  PlateEventSource,
  ResultadoAccionamiento,
  ResultadoDeAccionamiento,
} from '@ncr/domain-core';
import type { CapacidadesDeEquipo } from './capacidades';
import type { VeredictoRemoto } from './verificacion-remota';

/**
 * LO QUE TODO ADAPTADOR CUMPLE: los cuatro puertos del dominio, más UNA
 * pregunta que el dominio no hace y este paquete sí.
 *
 * `capacidadesDe` no es un puerto del dominio y no lo será: el motor de reglas
 * no necesita saber si un equipo tiene biblioteca de rostros. Quien lo necesita
 * es la composición —qué se le pide a qué aparato— y la consola —qué enseñar—.
 * Vive aquí, en el tipo del paquete, y la suite de contrato lo exige igual a
 * los tres adaptadores.
 */
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * `fijarBloqueo` · ETAPA 15-E · TAMPOCO ES UN PUERTO DEL DOMINIO, Y SE DICE
 *
 * El dominio declara `ControlDeBarrera` con las dos operaciones —accionar y
 * bloquear (H-3)— para el adaptador de barrera. `AccessPointProvider`, el
 * puerto que la API consume por dispositivo, sólo sabe abrir. Hasta la 15-E el
 * bloqueo llegaba al equipo por un segundo camino: el control de barrera que
 * `BARRERA_*` construye por entorno, para UN dispositivo. Con el registro de
 * equipos (D5) ese camino queda como compatibilidad, y el bloqueo tiene que
 * poder resolverse por dispositivo y por capacidad como todo lo demás.
 *
 * Se declara aquí y no en el dominio por la misma razón que `capacidadesDe`:
 * el motor de reglas no bloquea accesos; lo hace la administración (H-3), y el
 * puerto que la consola consume es de aplicación. Los tres adaptadores lo
 * cumplen y la suite de contrato lo exige: `bloqueoDeAcceso = si` → orden
 * aceptada; en otro caso `CapacidadNoSoportada`, nunca una orden que «pasa».
 */
export type ProveedorDeEquipos = AccessPointProvider &
  PlateEventSource &
  FaceTemplateProvider &
  IntercomProvider & {
    capacidadesDe(dispositivoId: string): Promise<CapacidadesDeEquipo>;
    fijarBloqueo(dispositivoId: string, bloqueado: boolean): Promise<ResultadoDeAccionamiento>;
    /**
     * A2 · contesta a una terminal que reconoció y ESPERA (`verificacionRemota`).
     * Con `permitido` el equipo abre; sin él, niega. Sólo se admite en un equipo
     * que declare la capacidad; en otro caso `CapacidadNoSoportada`.
     */
    responderVerificacionRemota(
      dispositivoId: string,
      veredicto: VeredictoRemoto,
    ): Promise<ResultadoAccionamiento>;
  };
