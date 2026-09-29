'use client';

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { Esquemas } from '@ncr/contracts';
import { cliente, desenvolver } from './cliente';
import { RECARGA_DE_LISTAS_COMPARTIDAS } from './recarga';

/**
 * 15-M (C3) · las consultas del RESIDENTE en la consola web.
 *
 * Son los MISMOS endpoints que usa la app Flutter (`copropiedades/:id/mi/…`):
 * la vivienda no viaja nunca como parámetro —la resuelve el servidor desde la
 * identidad del token—, así que aquí no hay ningún identificador que la
 * consola pueda equivocar ni que un residente pueda cambiar a mano.
 *
 * Todas cuelgan de `['mi', copropiedad]`: registrar una visita, un vehículo o
 * guardar el perfil invalida esa raíz y las pantallas se refrescan juntas.
 */
export type MiInicio = Esquemas['MiInicioDto'];
export type MiVivienda = Esquemas['MiViviendaDto'];
export type MiembroDeFamilia = Esquemas['MiembroDeFamiliaDto'];
export type MiVehiculo = Esquemas['MiVehiculoDto'];
export type MiAutorizacion = Esquemas['MiAutorizacionDto'];
export type VisitanteReciente = Esquemas['VisitanteRecienteDto'];
export type MiVisitaGenerada = Esquemas['MiVisitaGeneradaDto'];
export type MiZona = Esquemas['MiZonaDto'];
export type MiEvento = Esquemas['MiEventoDto'];
export type MiNotificacion = Esquemas['MiNotificacionDto'];
export type PerfilDelResidente = Esquemas['PerfilDelResidenteDto'];
export type MisOcupantes = Esquemas['MisOcupantesDto'];
export type PeriodoDeHistorial = 'hoy' | 'semana' | 'mes' | 'todo';

export const clavesDelResidente = {
  raiz: (copropiedadId: string) => ['mi', copropiedadId] as const,
};

const ruta = (copropiedadId: string): { params: { path: { id: string } } } => ({
  params: { path: { id: copropiedadId } },
});

export const useMiVivienda = (copropiedadId: string): UseQueryResult<MiInicio> =>
  useQuery({
    queryKey: [...clavesDelResidente.raiz(copropiedadId), 'vivienda'] as const,
    queryFn: async () =>
      desenvolver(await cliente.GET('/copropiedades/{id}/mi/vivienda', ruta(copropiedadId))),
  });

export const useMiFamilia = (copropiedadId: string): UseQueryResult<MiembroDeFamilia[]> =>
  useQuery({
    queryKey: [...clavesDelResidente.raiz(copropiedadId), 'familia'] as const,
    queryFn: async () =>
      desenvolver(await cliente.GET('/copropiedades/{id}/mi/familia', ruta(copropiedadId))),
  });

export const useMisVehiculos = (copropiedadId: string): UseQueryResult<MiVehiculo[]> =>
  useQuery({
    queryKey: [...clavesDelResidente.raiz(copropiedadId), 'vehiculos'] as const,
    queryFn: async () =>
      desenvolver(await cliente.GET('/copropiedades/{id}/mi/vehiculos', ruta(copropiedadId))),
  });

export const useMisAutorizaciones = (copropiedadId: string): UseQueryResult<MiAutorizacion[]> =>
  useQuery({
    queryKey: [...clavesDelResidente.raiz(copropiedadId), 'autorizaciones'] as const,
    // Portería rechaza y la vigencia vence sola: se vuelve a pedir al volver a
    // la ventana y cada 15 s, como las listas compartidas de la consola.
    ...RECARGA_DE_LISTAS_COMPARTIDAS,
    queryFn: async () =>
      desenvolver(await cliente.GET('/copropiedades/{id}/mi/autorizaciones', ruta(copropiedadId))),
  });

export const useMisUltimosVisitantes = (
  copropiedadId: string,
): UseQueryResult<VisitanteReciente[]> =>
  useQuery({
    queryKey: [...clavesDelResidente.raiz(copropiedadId), 'ultimos'] as const,
    queryFn: async () =>
      desenvolver(await cliente.GET('/copropiedades/{id}/mi/visitas/ultimas', ruta(copropiedadId))),
  });

export const useMisZonas = (copropiedadId: string): UseQueryResult<MiZona[]> =>
  useQuery({
    queryKey: [...clavesDelResidente.raiz(copropiedadId), 'zonas'] as const,
    // El aforo es el de ESTE instante: se refresca como una lista compartida.
    ...RECARGA_DE_LISTAS_COMPARTIDAS,
    queryFn: async () =>
      desenvolver(await cliente.GET('/copropiedades/{id}/mi/zonas', ruta(copropiedadId))),
  });

export const useMiHistorial = (
  copropiedadId: string,
  periodo: PeriodoDeHistorial,
): UseQueryResult<MiEvento[]> =>
  useQuery({
    queryKey: [...clavesDelResidente.raiz(copropiedadId), 'historial', periodo] as const,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/mi/historial', {
          params: { path: { id: copropiedadId }, query: { periodo, limite: 100 } },
        }),
      ),
  });

export const useMisNotificaciones = (copropiedadId: string): UseQueryResult<MiNotificacion[]> =>
  useQuery({
    queryKey: [...clavesDelResidente.raiz(copropiedadId), 'notificaciones'] as const,
    ...RECARGA_DE_LISTAS_COMPARTIDAS,
    queryFn: async () =>
      desenvolver(await cliente.GET('/copropiedades/{id}/mi/notificaciones', ruta(copropiedadId))),
  });

export const useMiPerfil = (copropiedadId: string): UseQueryResult<PerfilDelResidente> =>
  useQuery({
    queryKey: [...clavesDelResidente.raiz(copropiedadId), 'perfil'] as const,
    queryFn: async () =>
      desenvolver(await cliente.GET('/copropiedades/{id}/mi/perfil', ruta(copropiedadId))),
  });

export const useMisOcupantes = (copropiedadId: string): UseQueryResult<MisOcupantes> =>
  useQuery({
    queryKey: [...clavesDelResidente.raiz(copropiedadId), 'ocupantes'] as const,
    queryFn: async () =>
      desenvolver(await cliente.GET('/copropiedades/{id}/mi/ocupantes', ruta(copropiedadId))),
  });
