'use client';

import type { JSX, ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { BellRing } from 'lucide-react';
import { Boton } from '@/componentes/ui/boton';
import { useColaDeAtencion } from '@/lib/api/consultas';
import { abrirCanal } from '@/lib/sse/canal';
import type { LlamadaEntrante } from '@/lib/sse/llamadas';
import {
  ETIQUETA_DE_DISPARADOR,
  actualizarVistos,
  debeSonar,
  nuevos,
  rutaParaAtender,
} from '@/lib/atencion/seleccion';
import {
  notificar,
  pedirPermisoDeNotificacion,
  permisoDeNotificacion,
  sonarAviso,
} from '@/lib/atencion/avisos';
import type { PermisoDeNotificacion } from '@/lib/atencion/avisos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * G2 (15-N) · LA ATENCIÓN LLEGA AUNQUE EL OPERADOR ESTÉ EN OTRA PANTALLA
 *
 * Montado una vez en el marco de la consola, para quien atiende la cola
 * (operador de central, portero, administración). Hace cuatro cosas:
 *
 *  · abre UN canal en vivo y, con cada acceso, alerta, llamada o evento de
 *    equipo, refresca la cola al instante (sin esperar los 4 s del sondeo);
 *  · SUENA una vez por cada elemento nuevo cuyo disparador tenga el sonido
 *    activado en la copropiedad (y no silenciado en este navegador);
 *  · fuera de Guardia y Portería, enseña un aviso con «Atender», que lleva a
 *    la pantalla con ESE elemento ya en «Atención»; y una notificación del
 *    navegador si el usuario la autorizó;
 *  · recuerda la última llamada de cada videoportero (vivienda que declara),
 *    que la cola no trae y la pantalla de atención enseña.
 * ═════════════════════════════════════════════════════════════════════════════
 */
interface ValorDeAtencion {
  /** La última llamada avisada por ese equipo, con la vivienda que declaró. */
  readonly llamadaDe: (dispositivoId: string) => LlamadaEntrante | undefined;
  /** El navegador no dejó sonar: falta un gesto del usuario en la página. */
  readonly sonidoBloqueado: boolean;
}

const ContextoDeAtencion = createContext<ValorDeAtencion>({
  llamadaDe: () => undefined,
  sonidoBloqueado: false,
});

export const useAtencionEnVivo = (): ValorDeAtencion => useContext(ContextoDeAtencion);

/** Las pantallas que YA atienden: allí no hace falta el aviso, basta el sonido. */
const PANTALLAS_DE_ATENCION = ['/guardia', '/porteria'];

const CLAVE_DE_SILENCIO = 'ncr.atencion.silencio';

const leerSilencio = (): boolean => {
  try {
    return window.localStorage.getItem(CLAVE_DE_SILENCIO) === '1';
  } catch {
    return false;
  }
};

const guardarSilencio = (silencio: boolean): void => {
  try {
    window.localStorage.setItem(CLAVE_DE_SILENCIO, silencio ? '1' : '0');
  } catch {
    /* sin almacenamiento, el silencio dura lo que la pestaña */
  }
};

export const AtencionEnVivo = ({
  copropiedadId,
  rol,
  children,
  suscribir = abrirCanal,
  sonar = sonarAviso,
  notificarNavegador = notificar,
}: {
  readonly copropiedadId: string;
  readonly rol: string;
  readonly children: ReactNode;
  /** Inyectables para probar sin `EventSource`, sin WebAudio y sin notificaciones. */
  readonly suscribir?: typeof abrirCanal;
  readonly sonar?: (urgente: boolean) => boolean;
  readonly notificarNavegador?: typeof notificar;
}): JSX.Element => {
  const consultas = useQueryClient();
  const cola = useColaDeAtencion(copropiedadId);
  const ruta = usePathname() ?? '';
  const router = useRouter();
  const vistos = useRef<ReadonlySet<string>>(new Set());
  const llamadas = useRef(new Map<string, LlamadaEntrante>());
  const [sonidoBloqueado, setSonidoBloqueado] = useState(false);
  const [silencio, setSilencio] = useState(false);
  const [descartado, setDescartado] = useState<string | null>(null);
  const [permiso, setPermiso] = useState<PermisoDeNotificacion>('no_disponible');

  useEffect(() => {
    setSilencio(leerSilencio());
    setPermiso(permisoDeNotificacion());
  }, []);

  // Un canal: lo que pueda cambiar la cola la refresca ya.
  useEffect(() => {
    if (suscribir === abrirCanal && typeof EventSource === 'undefined') return undefined;
    const refrescar = (): void => {
      void consultas.invalidateQueries({ queryKey: ['guardia', copropiedadId, 'cola'] });
    };
    return suscribir({
      copropiedadId,
      mensajes: {
        evento: refrescar,
        alerta: refrescar,
        eventoDeEquipo: refrescar,
        llamada: (l) => {
          llamadas.current.set(l.dispositivoId, l);
          refrescar();
        },
        estado: () => undefined,
        recuperados: refrescar,
      },
    });
  }, [copropiedadId, suscribir, consultas]);

  const enPantallaDeAtencion = PANTALLAS_DE_ATENCION.some((p) => ruta.startsWith(p));
  const lista = cola.data?.cola;
  const preferencias = cola.data?.preferencias;

  const atender = useCallback(
    (eventoId: string) => {
      setDescartado(null);
      router.push(rutaParaAtender(rol, eventoId));
    },
    [rol, router],
  );

  // Lo nuevo suena una vez y, fuera de la pantalla que atiende, notifica.
  useEffect(() => {
    if (lista === undefined) return;
    const recien = nuevos(vistos.current, lista);
    vistos.current = actualizarVistos(lista);
    if (recien.length === 0) return;
    if (!silencio && debeSonar(recien, preferencias)) {
      setSonidoBloqueado(!sonar(recien.some((e) => e.urgencia === 'critica')));
    }
    const primero = recien[0];
    if (primero !== undefined && (!enPantallaDeAtencion || document.hidden)) {
      notificarNavegador(
        ETIQUETA_DE_DISPARADOR[primero.disparador],
        `${primero.titulo} · ${String(lista.length)} en la cola`,
        primero.eventoId,
        () => atender(primero.eventoId),
      );
    }
    // Sólo cuando cambia la cola: el resto son lecturas del momento.
  }, [lista]);

  const primero = lista?.[0];
  const mostrarAviso =
    !enPantallaDeAtencion && primero !== undefined && primero.eventoId !== descartado;

  return (
    <ContextoDeAtencion.Provider
      value={{ llamadaDe: (d) => llamadas.current.get(d), sonidoBloqueado }}
    >
      {children}
      {mostrarAviso ? (
        <div
          role="alertdialog"
          aria-labelledby="aviso-de-atencion-titulo"
          className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-tarjeta border-2 border-marca-texto bg-superficie p-4 shadow-lg sm:inset-x-auto sm:right-4"
        >
          <div className="flex items-start gap-3">
            <BellRing
              className="mt-0.5 h-6 w-6 shrink-0 text-marca-texto"
              aria-hidden="true"
              strokeWidth={1.75}
            />
            <div className="min-w-0 flex-1">
              <p id="aviso-de-atencion-titulo" className="text-titulo font-semibold text-texto">
                {ETIQUETA_DE_DISPARADOR[primero.disparador]}: {primero.titulo}
              </p>
              <p className="mt-1 text-secundario text-texto-apagado">
                Esperando {String(primero.esperaSegundos)} s · {String(lista?.length ?? 0)} en la
                cola
              </p>
              {sonidoBloqueado && !silencio ? (
                <p className="mt-1 text-distintivo text-aviso-texto">
                  El navegador no dejó sonar el aviso: pulse en cualquier parte de la consola para
                  activarlo.
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {permiso === 'default' ? (
              <Boton
                variante="secundario"
                tamano="sm"
                onClick={() => {
                  void pedirPermisoDeNotificacion().then(setPermiso);
                }}
              >
                Avisarme también fuera de la pestaña
              </Boton>
            ) : null}
            <Boton
              variante="secundario"
              tamano="sm"
              onClick={() => {
                guardarSilencio(!silencio);
                setSilencio(!silencio);
              }}
            >
              {silencio ? 'Activar sonido aquí' : 'Silenciar aquí'}
            </Boton>
            <Boton
              variante="secundario"
              tamano="sm"
              onClick={() => setDescartado(primero.eventoId)}
            >
              Más tarde
            </Boton>
            <Boton variante="primario" tamano="sm" onClick={() => atender(primero.eventoId)}>
              Atender
            </Boton>
          </div>
        </div>
      ) : null}
    </ContextoDeAtencion.Provider>
  );
};
