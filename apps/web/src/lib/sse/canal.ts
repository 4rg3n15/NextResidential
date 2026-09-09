'use client';

import type { AlertaExpuesta, EventoRegistrado } from '@ncr/contracts';
import { ESPERA_MAXIMA_MS, esperaDeReintento, msHastaRenovar } from './reconexion';
import type { EstadoDeSesion } from '@/app/api/sesion/estado/route';

/**
 * Canal en vivo de la consola sobre el SSE de la API.
 *
 * **Sondeo, no.** La ETAPA 06 midió el canal: 200 de 200 alertas con 25
 * consolas suscritas, p99 de 3 ms contra un umbral de 10 000 ms (KPI-25). Un
 * sondeo cada pocos segundos daría peor latencia y más carga.
 *
 * Tres cosas que este cliente hace y que un `new EventSource(url)` a secas no:
 *
 * 1 · **Se adelanta al vencimiento del token.** La sesión dura pocos minutos.
 *     Un flujo abierto no recibe el 401 —ya no hay a quién devolvérselo—, así
 *     que esperar al fallo significa un canal mudo que parece vivo. Aquí se
 *     consulta el instante de expiración y se reabre el flujo ANTES, con el
 *     token ya renovado por el proxy.
 * 2 · **Reintenta con retroceso exponencial y jitter**, y recupera lo perdido:
 *     al reconectar pide el histórico desde el último evento visto, así que un
 *     corte de treinta segundos no deja un agujero en la lista.
 * 3 · **Publica el estado de la conexión.** Una lista congelada sin avisar es
 *     peor que una vacía: el operador cree que no pasa nada cuando lo que pasa
 *     es que no se está enterando.
 */

export type EstadoDelCanal = 'conectando' | 'conectado' | 'reconectando' | 'sin-conexion';

export interface MensajesDelCanal {
  readonly evento: (evento: EventoRegistrado) => void;
  readonly alerta: (alerta: AlertaExpuesta) => void;
  readonly estado: (estado: EstadoDelCanal, intento: number) => void;
  /** Eventos recuperados tras un corte, del más antiguo al más reciente. */
  readonly recuperados: (eventos: readonly EventoRegistrado[]) => void;
}

export interface OpcionesDelCanal {
  readonly copropiedadId: string;
  readonly mensajes: MensajesDelCanal;
  /** Inyectables para poder probar sin navegador ni relojes reales. */
  readonly crearFuente?: (url: string) => EventSource;
  readonly ahora?: () => number;
  readonly aleatorio?: () => number;
}

const RUTA = (copropiedadId: string): string =>
  `/api/ncr/copropiedades/${encodeURIComponent(copropiedadId)}/eventos`;

/** Cierra el canal; devolver una función es lo que permite usarlo en un efecto. */
export type Baja = () => void;

export const abrirCanal = ({
  copropiedadId,
  mensajes,
  crearFuente = (url) => new EventSource(url, { withCredentials: true }),
  ahora = Date.now,
  aleatorio = Math.random,
}: OpcionesDelCanal): Baja => {
  let fuente: EventSource | null = null;
  let temporizadorReintento: ReturnType<typeof setTimeout> | null = null;
  let temporizadorRenovacion: ReturnType<typeof setTimeout> | null = null;
  let intento = 0;
  let cerrado = false;
  // Marca de agua: instante del último evento entregado. Es lo que permite
  // pedir exactamente el hueco al reconectar y no el día entero.
  let ultimoVisto: string | null = null;

  const limpiarTemporizadores = (): void => {
    if (temporizadorReintento !== null) clearTimeout(temporizadorReintento);
    if (temporizadorRenovacion !== null) clearTimeout(temporizadorRenovacion);
    temporizadorReintento = null;
    temporizadorRenovacion = null;
  };

  const cerrarFuente = (): void => {
    fuente?.close();
    fuente = null;
  };

  /** Pide a la API lo ocurrido mientras el canal estuvo caído. */
  const recuperarHistorial = async (): Promise<void> => {
    if (ultimoVisto === null) return;
    const parametros = new URLSearchParams({
      desde: ultimoVisto,
      hasta: new Date(ahora()).toISOString(),
      tamanoPagina: '200',
    });
    try {
      const respuesta = await fetch(`${RUTA(copropiedadId)}?${parametros.toString()}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!respuesta.ok) return;
      const pagina = (await respuesta.json()) as { filas?: EventoRegistrado[] };
      const filas = pagina.filas ?? [];
      if (filas.length > 0) {
        mensajes.recuperados(filas);
        const ultimo = filas
          .map((f) => f.ocurridoEn)
          .sort()
          .at(-1);
        if (ultimo !== undefined) ultimoVisto = ultimo;
      }
    } catch {
      // La recuperación es un extra: si falla, el canal sigue vivo y la lista
      // se completa en el siguiente refresco de la consulta.
    }
  };

  /**
   * Programa la reapertura antes de que caduque el token. Se consulta el
   * estado de la sesión, que además fuerza el refresco en el servidor.
   */
  const programarRenovacion = async (): Promise<void> => {
    try {
      const respuesta = await fetch('/api/sesion/estado', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!respuesta.ok) return;
      const estado = (await respuesta.json()) as EstadoDeSesion;
      const espera = msHastaRenovar(estado.expiraEn, ahora());
      if (espera === null) return;
      temporizadorRenovacion = setTimeout(() => {
        if (cerrado) return;
        // Renovación planificada: NO cuenta como fallo, así que el contador de
        // intentos se queda a cero y no se penaliza con retroceso.
        cerrarFuente();
        conectar();
      }, espera);
    } catch {
      // Sin dato de expiración se sigue adelante: el reintento por fallo cubre
      // el caso, solo que reaccionando en vez de anticipando.
    }
  };

  const conectar = (): void => {
    if (cerrado) return;
    mensajes.estado(intento === 0 ? 'conectando' : 'reconectando', intento);

    const nueva = crearFuente(`${RUTA(copropiedadId)}/flujo`);
    fuente = nueva;

    nueva.addEventListener('listo', () => {
      const primeraVez = intento === 0;
      intento = 0;
      mensajes.estado('conectado', 0);
      // Solo se recupera tras un CORTE. En la primera conexión la vista ya
      // carga el histórico por su cuenta, y pedirlo aquí lo duplicaría.
      if (!primeraVez) void recuperarHistorial();
      void programarRenovacion();
    });

    nueva.addEventListener('eventos', (m) => {
      try {
        const evento = JSON.parse((m as MessageEvent<string>).data) as EventoRegistrado;
        ultimoVisto = evento.ocurridoEn;
        mensajes.evento(evento);
      } catch {
        // Un mensaje ilegible no debe tumbar el canal.
      }
    });

    nueva.addEventListener('alertas', (m) => {
      try {
        mensajes.alerta(JSON.parse((m as MessageEvent<string>).data) as AlertaExpuesta);
      } catch {
        /* ídem */
      }
    });

    nueva.onerror = () => {
      if (cerrado) return;
      cerrarFuente();
      limpiarTemporizadores();
      intento += 1;
      const espera = esperaDeReintento(intento, aleatorio);
      mensajes.estado(espera >= ESPERA_MAXIMA_MS ? 'sin-conexion' : 'reconectando', intento);
      temporizadorReintento = setTimeout(conectar, espera);
    };
  };

  conectar();

  return () => {
    cerrado = true;
    limpiarTemporizadores();
    cerrarFuente();
  };
};
