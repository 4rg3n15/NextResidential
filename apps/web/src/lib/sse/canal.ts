'use client';

import type { AlertaExpuesta, EventoRegistrado } from '@ncr/contracts';
import { ESPERA_MAXIMA_MS, esperaDeReintento, msHastaRenovar } from './reconexion';
import { esLlamadaEntrante } from './llamadas';
import { esEventoDeEquipoEnVivo } from './eventos-de-equipo';
import type { EventoDeEquipoEnVivo } from './eventos-de-equipo';
import type { LlamadaEntrante } from './llamadas';
import { esAvisoDeVisita } from './visitas';
import type { AvisoDeVisitaEnVivo } from './visitas';
import type { EstadoDeSesion } from '@/app/api/sesion/estado/route';
import { origenDirecto, urlDelFlujoDirecto } from '@/lib/origen-directo';

/**
 * Canal en vivo de la consola sobre el SSE de la API. Sondeo, no: la ETAPA 06
 * midió p99 de 3 ms con 25 consolas (KPI-25). Lo que hace y un `EventSource`
 * a secas no: (1) **se adelanta al vencimiento del token** y reabre antes, con
 * el token renovado, porque un flujo abierto no recibe el 401; (2) **reintenta
 * con retroceso exponencial y jitter** y pide el histórico desde el último
 * evento visto; (3) **publica el estado de la conexión**: una lista congelada
 * sin avisar es peor que una vacía.
 */
export type EstadoDelCanal = 'conectando' | 'conectado' | 'reconectando' | 'sin-conexion';

export interface MensajesDelCanal {
  readonly evento: (evento: EventoRegistrado) => void;
  readonly alerta: (alerta: AlertaExpuesta) => void;
  /** A4 · la llamada de un videoportero. Opcional: no toda vista la atiende. */
  readonly llamada?: (llamada: LlamadaEntrante) => void;
  /** 15-L (B) · un evento de EQUIPO o algo que la plataforma hizo con él. Opcional. */
  readonly eventoDeEquipo?: (evento: EventoDeEquipoEnVivo) => void;
  /** F2 (15-L) · una visita generada o anulada. Opcional: la atiende quien la muestra. */
  readonly visita?: (aviso: AvisoDeVisitaEnVivo) => void;
  readonly estado: (estado: EstadoDelCanal, intento: number) => void;
  /** Eventos recuperados tras un corte, del más antiguo al más reciente. */
  readonly recuperados: (eventos: readonly EventoRegistrado[]) => void;
}

export interface OpcionesDelCanal {
  readonly copropiedadId: string;
  readonly mensajes: MensajesDelCanal;
  /** Inyectables para poder probar sin navegador ni relojes reales. */
  readonly crearFuente?: (url: string, conCredenciales?: boolean) => EventSource;
  /** 15-R · D1 · origen de la API para el flujo DIRECTO; `null` = por el proxy (sitio). */
  readonly origen?: string | null;
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
  crearFuente = (url, conCredenciales = true) =>
    new EventSource(url, { withCredentials: conCredenciales }),
  origen = origenDirecto(),
  ahora = Date.now,
  aleatorio = Math.random,
}: OpcionesDelCanal): Baja => {
  let fuente: EventSource | null = null;
  let temporizadorReintento: ReturnType<typeof setTimeout> | null = null;
  let temporizadorRenovacion: ReturnType<typeof setTimeout> | null = null;
  let intento = 0;
  let cerrado = false;
  // Marca de agua: el último evento entregado; al reconectar se pide sólo el hueco.
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

  /** Reabre antes de que caduque el token; consultar la sesión fuerza el refresco. */
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

  const fallar = (): void => {
    if (cerrado) return;
    cerrarFuente();
    limpiarTemporizadores();
    intento += 1;
    const espera = esperaDeReintento(intento, aleatorio);
    mensajes.estado(espera >= ESPERA_MAXIMA_MS ? 'sin-conexion' : 'reconectando', intento);
    temporizadorReintento = setTimeout(conectar, espera);
  };

  const abrir = (url: string, conCredenciales: boolean): void => {
    if (cerrado) return;
    const nueva = crearFuente(url, conCredenciales);
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

    nueva.addEventListener('llamadas', (m) => {
      try {
        const carga: unknown = JSON.parse((m as MessageEvent<string>).data);
        if (esLlamadaEntrante(carga)) mensajes.llamada?.(carga);
      } catch {
        /* ídem */
      }
    });

    nueva.addEventListener('eventos-de-equipo', (m) => {
      try {
        const carga: unknown = JSON.parse((m as MessageEvent<string>).data);
        if (esEventoDeEquipoEnVivo(carga)) mensajes.eventoDeEquipo?.(carga);
      } catch {
        /* ídem */
      }
    });

    nueva.addEventListener('visitas', (m) => {
      try {
        const carga: unknown = JSON.parse((m as MessageEvent<string>).data);
        if (esAvisoDeVisita(carga)) mensajes.visita?.(carga);
      } catch {
        /* ídem */
      }
    });

    nueva.onerror = fallar;
  };

  // 15-R · D1 · en sitio, por el proxy con la cookie; con origen público, directo
  // a la API con un billete NUEVO en cada apertura (y en cada reintento).
  function conectar(): void {
    if (cerrado) return;
    mensajes.estado(intento === 0 ? 'conectando' : 'reconectando', intento);
    if (origen === null) abrir(`${RUTA(copropiedadId)}/flujo`, true);
    else void urlDelFlujoDirecto(RUTA(copropiedadId), origen).then((u) => abrir(u, false), fallar);
  }

  conectar();

  return () => {
    cerrado = true;
    limpiarTemporizadores();
    cerrarFuente();
  };
};
