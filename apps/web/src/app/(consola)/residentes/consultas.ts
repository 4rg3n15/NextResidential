'use client';

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { CuentaDeResidente, PlazaDeOcupante, VehiculoDeResidente } from '@ncr/contracts';
import { cliente, desenvolver } from '@/lib/api/cliente';

/** Claves de caché del panel: una invalidación por sección. */
export const clavesDeResidentes = {
  cuentas: (id: string) => ['residentes', id, 'cuentas'] as const,
  vehiculos: (id: string) => ['residentes', id, 'vehiculos'] as const,
  ocupantes: (id: string, viviendaId: string) =>
    ['residentes', id, 'ocupantes', viviendaId] as const,
};

export const useCuentasDeResidentes = (
  copropiedadId: string,
): UseQueryResult<readonly CuentaDeResidente[]> =>
  useQuery({
    queryKey: clavesDeResidentes.cuentas(copropiedadId),
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/residentes/cuentas', {
          params: { path: { id: copropiedadId } },
        }),
      ),
  });

export const useVehiculosDeResidentes = (
  copropiedadId: string,
): UseQueryResult<readonly VehiculoDeResidente[]> =>
  useQuery({
    queryKey: clavesDeResidentes.vehiculos(copropiedadId),
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/residentes/vehiculos', {
          params: { path: { id: copropiedadId } },
        }),
      ),
  });

export const useOcupantes = (
  copropiedadId: string,
  viviendaId: string,
): UseQueryResult<readonly PlazaDeOcupante[]> =>
  useQuery({
    enabled: viviendaId !== '',
    queryKey: clavesDeResidentes.ocupantes(copropiedadId, viviendaId),
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/viviendas/{viviendaId}/ocupantes', {
          params: { path: { id: copropiedadId, viviendaId } },
        }),
      ),
  });
