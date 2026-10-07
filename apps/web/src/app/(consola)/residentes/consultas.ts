'use client';

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type {
  CuentaDeResidente,
  Esquemas,
  PlazaDeOcupante,
  VehiculoDeResidente,
} from '@ncr/contracts';
import { cliente, desenvolver } from '@/lib/api/cliente';
import { RECARGA_DE_LISTAS_COMPARTIDAS } from '@/lib/api/recarga';

/** 15-W · alias de lo generado, no tipos escritos a mano. */
export type ViviendaSinTitular = Esquemas['ViviendaSinTitularDto'];
export type TopeDePlazas = Esquemas['TopeDePlazasDto'];

/** Claves de caché del panel: una invalidación por sección. */
export const clavesDeResidentes = {
  cuentas: (id: string) => ['residentes', id, 'cuentas'] as const,
  vehiculos: (id: string) => ['residentes', id, 'vehiculos'] as const,
  ocupantes: (id: string, viviendaId: string) =>
    ['residentes', id, 'ocupantes', viviendaId] as const,
  /** La raíz de las búsquedas de viviendas sin titular: invalidarla las refresca todas. */
  viviendasSinTitular: (id: string) => ['residentes', id, 'viviendas-sin-titular'] as const,
  /**
   * Cuelga de `ocupantes` A PROPÓSITO: añadir o quitar una plaza invalida esa
   * clave y, con ella, «Plazas: N de M», sin que nadie tenga que acordarse.
   */
  topeDePlazas: (id: string, viviendaId: string) =>
    ['residentes', id, 'ocupantes', viviendaId, 'tope'] as const,
};

export const useCuentasDeResidentes = (
  copropiedadId: string,
): UseQueryResult<readonly CuentaDeResidente[]> =>
  useQuery({
    queryKey: clavesDeResidentes.cuentas(copropiedadId),
    // 3h · el residente edita su perfil y sus vehículos desde la app.
    ...RECARGA_DE_LISTAS_COMPARTIDAS,
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
    ...RECARGA_DE_LISTAS_COMPARTIDAS,
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

/**
 * 15-W · viviendas ACTIVAS y SIN TITULAR, buscadas por número o agrupación. La
 * búsqueda la hace el servidor (devuelve 50 como mucho), no esta lista.
 *
 * Sin caché (`gcTime: 0`): quién es titular cambia con cada alta, y una lista
 * vieja ofrecería una vivienda que ya no está libre. `placeholderData` sólo
 * conserva la lista anterior MIENTRAS llega la de la tecla siguiente, para que
 * el desplegable no parpadee.
 */
export const useViviendasSinTitular = (
  copropiedadId: string,
  busqueda: string,
): UseQueryResult<readonly ViviendaSinTitular[]> =>
  useQuery({
    queryKey: [...clavesDeResidentes.viviendasSinTitular(copropiedadId), busqueda] as const,
    gcTime: 0,
    placeholderData: (previa) => previa,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/residentes/viviendas-sin-titular', {
          params: { path: { id: copropiedadId }, query: { q: busqueda } },
        }),
      ),
  });

/** 15-W · «Plazas: N de M» de UNA vivienda. Sin caché: el tope es un derecho. */
export const useTopeDePlazas = (
  copropiedadId: string,
  viviendaId: string,
): UseQueryResult<TopeDePlazas> =>
  useQuery({
    enabled: viviendaId !== '',
    queryKey: clavesDeResidentes.topeDePlazas(copropiedadId, viviendaId),
    gcTime: 0,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/viviendas/{viviendaId}/tope-de-plazas', {
          params: { path: { id: copropiedadId, viviendaId } },
        }),
      ),
  });
