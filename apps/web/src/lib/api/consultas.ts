'use client';

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type {
  AccesosPorHora,
  EstadoDeDispositivos,
  Indicadores,
  PaginaDeEventos,
} from '@ncr/contracts';
import { cliente, desenvolver } from './cliente';

/**
 * Consultas del tablero.
 *
 * **Una consulta por tarjeta**, y no una que las traiga todas. Es la traducción
 * al cliente de la misma decisión que se tomó en la API: una tarjeta caída no
 * debe tumbar el tablero. Con una consulta agregada, un fallo en el histograma
 * dejaría los cuatro indicadores en estado de error.
 *
 * Las claves llevan la copropiedad como primer segmento: al conmutar de
 * copropiedad —lo hará el operador de central en la ETAPA 10— la caché no
 * mezcla resultados de dos tenants, que sería una fuga silenciosa dentro del
 * propio navegador.
 */
export const claves = {
  indicadores: (copropiedadId: string) => ['tablero', copropiedadId, 'indicadores'] as const,
  accesosPorHora: (copropiedadId: string) => ['tablero', copropiedadId, 'accesos'] as const,
  dispositivos: (copropiedadId: string) => ['tablero', copropiedadId, 'dispositivos'] as const,
  eventosRecientes: (copropiedadId: string) => ['eventos', copropiedadId, 'recientes'] as const,
};

export const useIndicadores = (copropiedadId: string): UseQueryResult<Indicadores> =>
  useQuery({
    queryKey: claves.indicadores(copropiedadId),
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/tablero/indicadores', {
          params: { path: { id: copropiedadId } },
        }),
      ),
  });

export const useAccesosPorHora = (copropiedadId: string): UseQueryResult<AccesosPorHora> =>
  useQuery({
    queryKey: claves.accesosPorHora(copropiedadId),
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/tablero/accesos-por-hora', {
          params: { path: { id: copropiedadId } },
        }),
      ),
  });

export const useDispositivos = (copropiedadId: string): UseQueryResult<EstadoDeDispositivos> =>
  useQuery({
    queryKey: claves.dispositivos(copropiedadId),
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/tablero/dispositivos', {
          params: { path: { id: copropiedadId } },
        }),
      ),
    // El estado de un dispositivo se deriva del latido contra un umbral de
    // minutos: refrescar cada 30 s mantiene la lista honesta aunque el canal
    // en vivo no publique nada —un equipo que se cae deja de hablar, no avisa.
    refetchInterval: 30_000,
  });

/** Últimos eventos del día para la lista en vivo del tablero. */
export const useEventosRecientes = (
  copropiedadId: string,
  ventana: { readonly desde: string; readonly hasta: string } | undefined,
): UseQueryResult<PaginaDeEventos> =>
  useQuery({
    queryKey: [...claves.eventosRecientes(copropiedadId), ventana?.desde ?? null],
    enabled: ventana !== undefined,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/eventos', {
          params: {
            path: { id: copropiedadId },
            // El rango es el de la copropiedad, calculado por la API: la
            // consola no decide qué es «hoy». Si lo hiciera con la zona del
            // navegador, un operador en otro huso vería otro día.
            query: { desde: ventana?.desde ?? '', hasta: ventana?.hasta ?? '', tamanoPagina: 20 },
          },
        }),
      ),
  });
