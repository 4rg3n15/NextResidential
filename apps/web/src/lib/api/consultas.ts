'use client';

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type {
  AccesosPorHora,
  AlertaExpuesta,
  Autorizacion,
  EstadoDeDispositivos,
  Indicadores,
  Informe,
  PaginaDeEventos,
  EstadoDeRegistro,
  PaginaDeViviendas,
  Pendientes,
  TipoDeInforme,
  Vehiculo,
  Zona,
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

/* ────────────────────────────────────────────────────────────────────────────
 * ETAPA 09-B · las siete pantallas restantes.
 *
 * Mismo criterio que arriba y por el mismo motivo: **una consulta por cosa que
 * se pinta**, y la copropiedad como primer segmento de la clave para que la
 * caché del navegador no mezcle dos tenants.
 *
 * Las MUTACIONES no tienen `useMutation` compartido: cada pantalla invalida lo
 * que ella sabe que cambió. Un invalidador genérico —«refresca todo»— convierte
 * un alta de vivienda en cinco peticiones y esconde qué depende de qué.
 * ──────────────────────────────────────────────────────────────────────────── */

export const clavesDe09B = {
  viviendas: (c: string, estado: string, busqueda: string) =>
    ['viviendas', c, estado, busqueda] as const,
  vehiculos: (c: string) => ['vehiculos', c] as const,
  autorizaciones: (c: string, ver: string) => ['autorizaciones', c, ver] as const,
  zonas: (c: string) => ['zonas', c] as const,
  dispositivosPendientes: (c: string) => ['dispositivos', c, 'pendientes'] as const,
  alertas: (c: string) => ['alertas', c] as const,
  informe: (c: string, tipo: string, desde: string, hasta: string) =>
    ['informes', c, tipo, desde, hasta] as const,
};

export const useViviendas = (
  copropiedadId: string,
  /**
   * `estado` viene del contrato, no de una cadena libre: `'' | 'activo' |
   * 'inactivo'`. Si mañana la API añade un tercer estado, esto deja de
   * compilar en vez de mandar un filtro que el backend ignora en silencio.
   */
  filtro: { readonly estado: '' | EstadoDeRegistro; readonly busqueda: string },
): UseQueryResult<PaginaDeViviendas> =>
  useQuery({
    queryKey: clavesDe09B.viviendas(copropiedadId, filtro.estado, filtro.busqueda),
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/padron/viviendas', {
          params: {
            path: { id: copropiedadId },
            query: {
              ...(filtro.estado === '' ? {} : { estado: filtro.estado }),
              ...(filtro.busqueda === '' ? {} : { busqueda: filtro.busqueda }),
            },
          },
        }),
      ),
  });

export const useVehiculos = (copropiedadId: string): UseQueryResult<Vehiculo[]> =>
  useQuery({
    queryKey: clavesDe09B.vehiculos(copropiedadId),
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/padron/vehiculos', {
          params: { path: { id: copropiedadId } },
        }),
      ),
  });

export const useAutorizaciones = (
  copropiedadId: string,
  ver: 'activas' | 'historial',
): UseQueryResult<Autorizacion[]> =>
  useQuery({
    queryKey: clavesDe09B.autorizaciones(copropiedadId, ver),
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/autorizaciones', {
          params: { path: { id: copropiedadId }, query: { ver } },
        }),
      ),
  });

export const useZonas = (copropiedadId: string): UseQueryResult<Zona[]> =>
  useQuery({
    queryKey: clavesDe09B.zonas(copropiedadId),
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/zonas', {
          params: { path: { id: copropiedadId } },
        }),
      ),
    // El aforo cambia con cada ingreso y la interfaz REFLEJA, no calcula: sin
    // este refresco mostraría el conteo del momento en que se abrió la página.
    refetchInterval: 15_000,
  });

/** Equipos con una orden encolada: la lista los pinta «sincronizando». */
export const useDispositivosPendientes = (copropiedadId: string): UseQueryResult<Pendientes> =>
  useQuery({
    queryKey: clavesDe09B.dispositivosPendientes(copropiedadId),
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/dispositivos/pendientes', {
          params: { path: { id: copropiedadId } },
        }),
      ),
    refetchInterval: 20_000,
  });

export const useAlertasAbiertas = (copropiedadId: string): UseQueryResult<AlertaExpuesta[]> =>
  useQuery({
    queryKey: clavesDe09B.alertas(copropiedadId),
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/alertas', {
          params: { path: { id: copropiedadId } },
        }),
      ),
  });

export const useInforme = (
  copropiedadId: string,
  parametros: {
    readonly tipo: TipoDeInforme;
    readonly desde: string;
    readonly hasta: string;
    readonly viviendaId?: string;
    readonly dispositivoId?: string;
  },
  habilitada: boolean,
): UseQueryResult<Informe> =>
  useQuery({
    queryKey: clavesDe09B.informe(
      copropiedadId,
      parametros.tipo,
      parametros.desde,
      parametros.hasta,
    ),
    enabled: habilitada,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/informes', {
          params: {
            path: { id: copropiedadId },
            query: {
              tipo: parametros.tipo,
              desde: parametros.desde,
              hasta: parametros.hasta,
              ...(parametros.viviendaId ? { viviendaId: parametros.viviendaId } : {}),
              ...(parametros.dispositivoId ? { dispositivoId: parametros.dispositivoId } : {}),
            },
          },
        }),
      ),
  });
