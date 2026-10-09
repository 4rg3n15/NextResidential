'use client';

import type { JSX, KeyboardEvent, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Headphones, Mic, Volume2, VolumeX } from 'lucide-react';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import { formatoG711De } from '@/lib/audio/g711';
import type { FormatoG711 } from '@/lib/audio/g711';
import { CanalDeAudioPorWebSocket } from '@/lib/audio/canal-por-websocket';
import type {
  EstadoDelCanalWs,
  NivelesDelCanal,
  OpcionesDelCanalWs,
} from '@/lib/audio/canal-por-websocket';
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
  /** B3 (15-S2) · micrófono abierto hasta colgar o hasta volver a pulsarlo. */
  manosLibresActivas?(): Promise<void>;
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
): {
  readonly estado: EstadoDelCanalWs;
  readonly canal: RefObject<CanalDeAudio | null>;
  readonly niveles: NivelesDelCanal;
  readonly semiduplex: boolean;
} => {
  const [estado, setEstado] = useState<EstadoDelCanalWs>({ fase: 'conectando' });
  const [niveles, setNiveles] = useState<NivelesDelCanal>({ recibiendo: 0, enviando: 0 });
  const [semiduplex, setSemiduplex] = useState(false);
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
          // B3 (15-S2) · los dos sentidos en vivo, y el turno si el equipo es semidúplex.
          alNiveles: (n) => {
            if (vigente) setNiveles(n);
          },
          alSemiduplex: () => {
            if (vigente) setSemiduplex(true);
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
  return { estado, canal, niveles, semiduplex };
};

/**
 * B3 (15-S2) · un sentido del audio: si pasa algo y cuánto. `<meter>` nativo y
 * sin `style` en línea: la CSP de la consola no admite estilos en línea.
 */
const Medidor = ({ rotulo, nivel }: { rotulo: string; nivel: number }): JSX.Element => (
  <label className="flex items-center gap-2 text-distintivo text-texto-apagado">
    <span className="w-44 shrink-0">{rotulo}</span>
    <meter
      className="h-2 w-full"
      min={0}
      max={100}
      low={5}
      value={Math.min(100, Math.round(Math.sqrt(nivel) * 100))}
    />
  </label>
);

const crearCanalReal = (o: OpcionesDelCanalWs): CanalDeAudio => new CanalDeAudioPorWebSocket(o);

export const ControlesDeAudioWs = ({
  formatoAnunciado,
  pedirBillete,
  crearCanal = crearCanalReal,
}: PropiedadesDeControlesWs): JSX.Element => {
  const formato = formatoG711De(formatoAnunciado);
  const { estado, canal, niveles, semiduplex } = usarCanal(formato, pedirBillete, crearCanal);
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
  const manosLibres = estado.fase === 'hablando' && estado.manosLibres === true;
  const alternarManosLibres = (): void => {
    setFallo(undefined);
    if (manosLibres) {
      soltar();
      return;
    }
    canal.current?.manosLibresActivas?.().catch(() => {
      setFallo('No se pudo abrir el micrófono: permítalo para esta página');
    });
  };
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
      onBlur={() => {
        // En manos libres el micrófono sigue abierto aunque el foco se vaya.
        if (!manosLibres) soltar();
      }}
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
          {hablando && !manosLibres ? 'Hablando… suelte para escuchar' : 'Mantener para hablar'}
        </Boton>
        <Boton
          variante={manosLibres ? 'primario' : 'secundario'}
          tamano="sm"
          aria-pressed={manosLibres}
          disabled={cerrado || estado.fase === 'conectando' || (hablando && !manosLibres)}
          onClick={alternarManosLibres}
        >
          <Headphones className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
          {manosLibres ? 'Manos libres: activas' : 'Manos libres'}
        </Boton>
      </div>
      <Medidor rotulo="Recibiendo del equipo · nivel" nivel={niveles.recibiendo} />
      <Medidor rotulo="Enviando · nivel" nivel={hablando ? niveles.enviando : 0} />
      {semiduplex ? (
        <p className="text-distintivo text-aviso-texto" role="status">
          Equipo semidúplex (medido): mientras usted habla no oye al equipo. Turno de palabra:{' '}
          <strong>{hablando ? 'usted' : 'el equipo'}</strong>.
        </p>
      ) : (
        <p className="text-distintivo text-texto-apagado">
          Se oye al equipo también mientras usted habla. Si el equipo resulta semidúplex, aquí se
          indicará el turno de palabra.
        </p>
      )}
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
