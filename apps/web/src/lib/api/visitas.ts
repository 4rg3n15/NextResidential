'use client';

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type {
  EstadoDeVisita,
  FotoEnEquipo,
  ListaDeVisitas,
  TextoDeLaCasilla,
  ViviendaDeVisita,
} from '@ncr/contracts';
import { cliente, desenvolver } from './cliente';
import { RECARGA_DE_LISTAS_COMPARTIDAS } from './recarga';

/**
 * F (15-L) · las consultas de «Visitantes».
 *
 * Todas cuelgan de `['visitas', copropiedad]`: generar, rechazar y el aviso en
 * vivo invalidan esa raíz y la lista, los equipos de una visita y el resto se
 * refrescan juntos. La copropiedad va en la clave para que la caché no mezcle
 * dos tenants al conmutar.
 */
export const clavesDeVisitas = {
  raiz: (copropiedadId: string) => ['visitas', copropiedadId] as const,
};

export interface FiltrosDeVisitas {
  readonly viviendaId: string;
  /** Día inicial y final, `AAAA-MM-DD` en hora local; vacío = sin límite. */
  readonly desde: string;
  readonly hasta: string;
  readonly estado: EstadoDeVisita | '';
  readonly texto: string;
}

export const SIN_FILTROS: FiltrosDeVisitas = {
  viviendaId: '',
  desde: '',
  hasta: '',
  estado: '',
  texto: '',
};

/** Un día local `AAAA-MM-DD` a su medianoche local, en ISO. */
const inicioDelDia = (dia: string): string => new Date(`${dia}T00:00:00`).toISOString();
const finDelDia = (dia: string): string =>
  new Date(new Date(`${dia}T00:00:00`).getTime() + 86_400_000).toISOString();

export const useVisitas = (
  copropiedadId: string,
  filtros: FiltrosDeVisitas,
): UseQueryResult<ListaDeVisitas> =>
  useQuery({
    queryKey: [...clavesDeVisitas.raiz(copropiedadId), 'lista', filtros] as const,
    // La lista cambia sola a medianoche y cuando el residente genera una
    // visita desde la app: se vuelve a pedir al volver a la ventana y cada
    // 15 s aunque el canal en vivo esté mudo (3h).
    ...RECARGA_DE_LISTAS_COMPARTIDAS,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/visitas', {
          params: {
            path: { id: copropiedadId },
            query: {
              ...(filtros.viviendaId === '' ? {} : { viviendaId: filtros.viviendaId }),
              ...(filtros.desde === '' ? {} : { desde: inicioDelDia(filtros.desde) }),
              ...(filtros.hasta === '' ? {} : { hasta: finDelDia(filtros.hasta) }),
              ...(filtros.estado === '' ? {} : { estado: filtros.estado }),
              ...(filtros.texto.trim() === '' ? {} : { texto: filtros.texto.trim() }),
            },
          },
        }),
      ),
  });

export const useViviendasDeVisitas = (copropiedadId: string): UseQueryResult<ViviendaDeVisita[]> =>
  useQuery({
    queryKey: [...clavesDeVisitas.raiz(copropiedadId), 'viviendas'] as const,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/visitas/viviendas', {
          params: { path: { id: copropiedadId } },
        }),
      ),
  });

export const useTextoDeLaCasilla = (copropiedadId: string): UseQueryResult<TextoDeLaCasilla> =>
  useQuery({
    queryKey: [...clavesDeVisitas.raiz(copropiedadId), 'casilla'] as const,
    staleTime: 60 * 60_000,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/visitas/casilla', {
          params: { path: { id: copropiedadId } },
        }),
      ),
  });

export const useFotoEnEquipos = (
  copropiedadId: string,
  autorizacionId: string | null,
): UseQueryResult<FotoEnEquipo[]> =>
  useQuery({
    enabled: autorizacionId !== null,
    queryKey: [...clavesDeVisitas.raiz(copropiedadId), 'equipos', autorizacionId] as const,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/visitas/{autorizacionId}/equipos', {
          params: { path: { id: copropiedadId, autorizacionId: autorizacionId ?? '' } },
        }),
      ),
  });
