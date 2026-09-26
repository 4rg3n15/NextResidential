'use client';

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type {
  HechoDeBitacora,
  Portero,
  TipoDeHechoDeBitacora,
  TurnoDePorteria,
} from '@ncr/contracts';
import { cliente, desenvolver } from '@/lib/api/cliente';

/** Claves de caché del panel: una invalidación por sección, no por pantalla. */
export const clavesDePorteria = {
  porteros: (id: string) => ['porteria', id, 'porteros'] as const,
  turnos: (id: string, desde: string) => ['porteria', id, 'turnos', desde] as const,
  bitacora: (id: string, tipo: string) => ['porteria', id, 'bitacora', tipo] as const,
};

export const usePorteros = (copropiedadId: string): UseQueryResult<readonly Portero[]> =>
  useQuery({
    queryKey: clavesDePorteria.porteros(copropiedadId),
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/porteros', {
          params: { path: { id: copropiedadId } },
        }),
      ).porteros,
    // «Quién está de turno ahora» cambia con el reloj, no sólo con las acciones.
    refetchInterval: 60_000,
  });

export const useTurnos = (
  copropiedadId: string,
  desde: Date,
  hasta: Date,
): UseQueryResult<readonly TurnoDePorteria[]> =>
  useQuery({
    queryKey: clavesDePorteria.turnos(copropiedadId, desde.toISOString()),
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/turnos', {
          params: {
            path: { id: copropiedadId },
            query: { desde: desde.toISOString(), hasta: hasta.toISOString() },
          },
        }),
      ).turnos,
  });

export const useBitacora = (
  copropiedadId: string,
  tipo: TipoDeHechoDeBitacora | 'todos',
  desde: Date,
  hasta: Date,
): UseQueryResult<readonly HechoDeBitacora[]> =>
  useQuery({
    queryKey: clavesDePorteria.bitacora(copropiedadId, tipo),
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/porteria/bitacora', {
          params: {
            path: { id: copropiedadId },
            query: {
              desde: desde.toISOString(),
              hasta: hasta.toISOString(),
              ...(tipo === 'todos' ? {} : { tipo }),
            },
          },
        }),
      ).hechos,
    refetchInterval: 60_000,
  });
