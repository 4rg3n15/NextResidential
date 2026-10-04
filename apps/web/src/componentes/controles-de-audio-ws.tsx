'use client';

import type { JSX, KeyboardEvent, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Mic, Volume2, VolumeX } from 'lucide-react';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import { formatoG711De } from '@/lib/audio/g711';
import type { FormatoG711 } from '@/lib/audio/g711';
import { CanalDeAudioPorWebSocket } from '@/lib/audio/canal-por-websocket';
import type { EstadoDelCanalWs, OpcionesDelCanalWs } from '@/lib/audio/canal-por-websocket';
import { urlDelAudio } from '@/lib/origen-directo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P2 · HABLAR Y OÍR POR EL CANAL ORDENADO (ADR-01, enmienda 15-P)
 *
 * Se monta con la palabra concedida y el canal del equipo abierto. Pide un
 * billete a la API (pasa por todos sus guardas) y abre el WebSocket por la
 * consola (`/api/ncr-audio`) o, en Netlify, directo a la API (15-R, D1).
 *
 * «Pulsar para hablar»: mantener el botón con el ratón o el dedo, o la barra
 * espaciadora con el foco en este panel. El micrófono se abre al pulsar y se
 * suelta al soltar —el piloto del navegador lo enseña sólo mientras tanto—, y
 * la API, además, descarta lo que llegue sin pulsar y corta un tramo trabado.
 * Al desmontar (colgar, cambiar de equipo) o al cerrar la pestaña, se cuelga:
 * la API suelta el turno y cierra el canal en el equipo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface CanalDeAudio {
  pulsar(): Promise<void>;
  soltar(): void;
  cerrar(): void;
}

export interface PropiedadesDeControlesWs {
  readonly formatoAnunciado: string | null;
  /** Pide el billete (POST …/billete) con el cliente de la consola. */
  readonly pedirBillete: () => Promise<string>;
  /** Inyectable para las pruebas: por omisión, el canal real. */
  readonly crearCanal?: (opciones: OpcionesDelCanalWs) => CanalDeAudio;
}

const usarCanal = (
  formato: FormatoG711 | null,
  pedirBillete: () => Promise<string>,
  crearCanal: (o: OpcionesDelCanalWs) => CanalDeAudio,
): { readonly estado: EstadoDelCanalWs; readonly canal: RefObject<CanalDeAudio | null> } => {
  const [estado, setEstado] = useState<EstadoDelCanalWs>({ fase: 'conectando' });
  const canal = useRef<CanalDeAudio | null>(null);
  useEffect(() => {
    if (formato === null) return;
    let vigente = true;
    const colgar = (): void => {
      canal.current?.cerrar();
      canal.current = null;
    };
    pedirBillete()
      .then((billete) => {
        if (!vigente) return;
        canal.current = crearCanal({
          url: urlDelAudio(billete),
          formato,
          alEstado: (e) => {
            if (vigente) setEstado(e);
          },
        });
      })
      .catch((e: unknown) => {
        if (vigente) {
          setEstado({
            fase: 'cerrado',
            motivo: e instanceof Error ? e.message : 'No se pudo abrir el audio',
          });
        }
      });
    // Cerrar la pestaña también cuelga: nunca un canal huérfano en el equipo.
    window.addEventListener('pagehide', colgar);
    return () => {
      vigente = false;
      window.removeEventListener('pagehide', colgar);
      colgar();
    };
  }, [formato, pedirBillete, crearCanal]);
  return { estado, canal };
};

const crearCanalReal = (o: OpcionesDelCanalWs): CanalDeAudio => new CanalDeAudioPorWebSocket(o);

export const ControlesDeAudioWs = ({
  formatoAnunciado,
  pedirBillete,
  crearCanal = crearCanalReal,
}: PropiedadesDeControlesWs): JSX.Element => {
  const formato = formatoG711De(formatoAnunciado);
  const { estado, canal } = usarCanal(formato, pedirBillete, crearCanal);
  const [fallo, setFallo] = useState<string | undefined>(undefined);

  const pulsar = (): void => {
    setFallo(undefined);
    canal.current?.pulsar().catch((e: unknown) => {
      setFallo(
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'El navegador no dio el micrófono: permítalo para esta página y vuelva a pulsar'
          : 'No se pudo abrir el micrófono',
      );
    });
  };
  const soltar = (): void => canal.current?.soltar();
  const conTeclado = (e: KeyboardEvent<HTMLDivElement>, abajo: boolean): void => {
    if (e.key !== ' ') return;
    e.preventDefault();
    if (abajo && !e.repeat) pulsar();
    if (!abajo) soltar();
  };

  if (formato === null) {
    return (
      <p className="text-distintivo text-aviso-texto" role="status">
        El equipo anuncia «{formatoAnunciado ?? 'sin formato'}» y esta consola sólo reproduce G.711
        (µ-law/A-law). No se reproduce lo que no se sabe decodificar.
      </p>
    );
  }

  const hablando = estado.fase === 'hablando';
  const cerrado = estado.fase === 'cerrado';
  return (
    <div
      className="flex flex-col gap-2 rounded-tarjeta border border-borde px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-marca"
      role="group"
      aria-label="Audio del equipo. Mantenga la barra espaciadora para hablar"
      tabIndex={0}
      onKeyDown={(e) => conTeclado(e, true)}
      onKeyUp={(e) => conTeclado(e, false)}
      onBlur={soltar}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Distintivo
          tono={
            hablando
              ? 'aviso'
              : cerrado
                ? 'peligro'
                : estado.fase === 'escuchando'
                  ? 'exito'
                  : 'neutro'
          }
        >
          {hablando ? (
            <>
              <Mic className="h-3.5 w-3.5" aria-hidden="true" /> Usted habla
            </>
          ) : estado.fase === 'escuchando' ? (
            <>
              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> Escuchando al equipo ·{' '}
              {formato}
            </>
          ) : cerrado ? (
            <>
              <VolumeX className="h-3.5 w-3.5" aria-hidden="true" /> Sin audio
            </>
          ) : (
            'Abriendo audio…'
          )}
        </Distintivo>
        <Boton
          variante={hablando ? 'primario' : 'secundario'}
          tamano="sm"
          aria-pressed={hablando}
          disabled={cerrado || estado.fase === 'conectando'}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            pulsar();
          }}
          onPointerUp={soltar}
          onPointerCancel={soltar}
          onKeyDown={(e) => {
            // La barra la atiende el panel; Intro no pulsa para no quedarse trabado.
            if (e.key === ' ' || e.key === 'Enter') e.preventDefault();
          }}
        >
          <Mic className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
          {hablando ? 'Hablando… suelte para escuchar' : 'Mantener para hablar'}
        </Boton>
      </div>
      <p className="text-distintivo text-texto-apagado">
        Turno de palabra: {hablando ? 'usted' : 'el visitante'}. El equipo no declara si es
        semiduplex: mientras usted habla, puede no oírse al visitante.
      </p>
      {cerrado ? (
        <p className="text-distintivo text-peligro-texto" role="alert">
          {estado.motivo}
        </p>
      ) : null}
      {estado.fase === 'escuchando' && estado.aviso !== undefined ? (
        <p className="text-distintivo text-aviso-texto" role="status">
          {estado.aviso}
        </p>
      ) : null}
      {fallo === undefined ? null : (
        <p className="text-distintivo text-peligro-texto" role="alert">
          {fallo}
        </p>
      )}
    </div>
  );
};
