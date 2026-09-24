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
  Persona,
  TipoDeInforme,
  Vehiculo,
  Zona,
  ColaDeAtencion,
  ConfiguracionDeCopropiedad,
  OrdenEjecutada,
  Latencias,
  UrlDeFotografia,
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
  personas: (c: string, busqueda: string) => ['personas', c, busqueda] as const,
  zonas: (c: string) => ['zonas', c] as const,
  dispositivosPendientes: (c: string) => ['dispositivos', c, 'pendientes'] as const,
  alertas: (c: string) => ['alertas', c] as const,
  informe: (c: string, tipo: string, desde: string, hasta: string) =>
    ['informes', c, tipo, desde, hasta] as const,
  configuracion: (c: string) => ['configuracion', c] as const,
};

/**
 * Configuración de la copropiedad. La consultan las pantallas que necesitan el
 * VOCABULARIO —cómo se llama aquí una vivienda— además de la de Configuración.
 *
 * La misma clave que usa el formulario de configuración, a propósito: al
 * guardar allí, el directorio repinta sus etiquetas sin recargar la página.
 *
 * `reintentar: false` porque la ruta es exclusiva de los dos roles
 * administrativos y a los demás les responde 404. Insistir tres veces en un
 * 404 legítimo es ruido, y quien la consulta ya sabe funcionar sin ella.
 */
export const useConfiguracion = (
  copropiedadId: string,
  habilitada = true,
): UseQueryResult<ConfiguracionDeCopropiedad> =>
  useQuery({
    enabled: habilitada && copropiedadId !== '',
    retry: false,
    queryKey: clavesDe09B.configuracion(copropiedadId),
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/configuracion', {
          params: { path: { id: copropiedadId } },
        }),
      ),
  });

export const useViviendas = (
  copropiedadId: string,
  /**
   * `estado` viene del contrato, no de una cadena libre: `'' | 'activo' |
   * 'inactivo'`. Si mañana la API añade un tercer estado, esto deja de
   * compilar en vez de mandar un filtro que el backend ignora en silencio.
   */
  filtro: { readonly estado: '' | EstadoDeRegistro; readonly busqueda: string },
  /**
   * `false` impide que la consulta salga. Existe por el buscador global, que
   * vive en la cabecera de TODAS las pantallas: sin esta puerta disparaba dos
   * peticiones en cada carga —y con la copropiedad vacía, contra una URL mal
   * formada— aunque nadie hubiera escrito nada.
   */
  habilitada = true,
): UseQueryResult<PaginaDeViviendas> =>
  useQuery({
    enabled: habilitada && copropiedadId !== '',
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

export const useVehiculos = (
  copropiedadId: string,
  habilitada = true,
): UseQueryResult<Vehiculo[]> =>
  useQuery({
    enabled: habilitada && copropiedadId !== '',
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

/**
 * Buscador de personas (D-72).
 *
 * **La API decide el mínimo, no la consola.** `BuscarPersonas` devuelve vacío
 * por debajo de dos caracteres; aquí solo se evita disparar la petición, que es
 * una economía de red, no una regla. Si la regla viviera en los dos sitios, un
 * cambio en la API dejaría la consola pidiendo lo que ya no se responde.
 *
 * `placeholderData` conserva la lista anterior mientras llega la siguiente: sin
 * él, cada tecla vacía el desplegable y la lista parpadea bajo el cursor.
 */
export const usePersonas = (copropiedadId: string, busqueda: string): UseQueryResult<Persona[]> =>
  useQuery({
    enabled: copropiedadId !== '' && busqueda.trim().length >= 2,
    queryKey: clavesDe09B.personas(copropiedadId, busqueda.trim()),
    placeholderData: (previa) => previa,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/padron/personas', {
          params: { path: { id: copropiedadId }, query: { busqueda: busqueda.trim() } },
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

/* ── ETAPA 10 · consolas operativas ─────────────────────────────────────── */

/**
 * La cola de atención se refresca **sola y a menudo**, y esa es la diferencia
 * con el resto de la consola.
 *
 * Las demás pantallas se consultan cuando alguien entra. Esta es una bandeja de
 * turno: el operador la mira sin tocar nada y lo que decide su trabajo es que
 * refleje lo que está pasando **ahora**. Cuatro segundos es el intervalo con el
 * que la espera en pantalla nunca se aleja más de eso de la real; el canal SSE
 * empuja los eventos nuevos, pero el CONTADOR de espera sólo avanza si se
 * vuelve a preguntar.
 */
export const useColaDeAtencion = (copropiedadId: string): UseQueryResult<ColaDeAtencion> =>
  useQuery({
    queryKey: ['guardia', copropiedadId, 'cola'],
    refetchInterval: 4000,
    // Sin esto, el operador que deja la pestaña de fondo vuelve a una cola
    // congelada y no lo sabe.
    refetchIntervalInBackground: false,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/guardia/cola', {
          params: { path: { id: copropiedadId } },
        }),
      ),
  });

export const useOrdenesManuales = (
  copropiedadId: string,
): UseQueryResult<{ ordenes: OrdenEjecutada[] }> =>
  useQuery({
    queryKey: ['guardia', copropiedadId, 'ordenes'],
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/guardia/ordenes', {
          params: { path: { id: copropiedadId } },
        }),
      ),
  });

/**
 * ETAPA 14 · las cinco latencias comprometidas (RNF-11.3).
 *
 * **No lleva copropiedad en la clave, y es la única que no la lleva.** Estos
 * son tiempos agregados del proceso, no datos de un tenant: no hay nada que
 * pudiera mezclarse al conmutar de copropiedad. La API lo declara igual, con
 * `@SinRecursoDeTenant()` y sin `:id` en la ruta.
 *
 * `refetchInterval` de 30 s: un tablero de latencias que hay que recargar a
 * mano se mira una vez y no se vuelve a mirar.
 */
export const useLatencias = (): UseQueryResult<Latencias> =>
  useQuery({
    queryKey: ['observabilidad', 'latencias'] as const,
    refetchInterval: 30_000,
    queryFn: async () => desenvolver(await cliente.GET('/observabilidad/latencias', {})),
  });

/* ── ETAPA 15-D (O3) · fotografía de identificación del visitante ─────────── */

/**
 * La URL FIRMADA de la fotografía (RN-21). Caduca a los 120 s, así que se
 * vuelve a pedir pasados 90: una URL caducada en pantalla es una imagen rota.
 * Sin reintento: el 404 de «no tiene fotografía» es una respuesta, no un fallo.
 * La clave cuelga de `['autorizaciones', copropiedad]`, la misma que invalida
 * la pantalla al adjuntar, revocar o modificar.
 */
export const useFotografiaDeVisitante = (
  copropiedadId: string,
  autorizacionId: string,
  habilitada: boolean,
): UseQueryResult<UrlDeFotografia> =>
  useQuery({
    enabled: habilitada && copropiedadId !== '' && autorizacionId !== '',
    retry: false,
    staleTime: 90_000,
    queryKey: ['autorizaciones', copropiedadId, 'fotografia', autorizacionId] as const,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/autorizaciones/{autorizacionId}/fotografia', {
          params: { path: { id: copropiedadId, autorizacionId } },
        }),
      ),
  });
