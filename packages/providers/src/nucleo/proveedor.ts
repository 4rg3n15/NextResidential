import type {
  AccessPointProvider,
  FaceTemplateProvider,
  IntercomProvider,
  PlateEventSource,
} from '@ncr/domain-core';
import type { CapacidadesDeEquipo } from './capacidades';

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
export type ProveedorDeEquipos = AccessPointProvider &
  PlateEventSource &
  FaceTemplateProvider &
  IntercomProvider & {
    capacidadesDe(dispositivoId: string): Promise<CapacidadesDeEquipo>;
  };
