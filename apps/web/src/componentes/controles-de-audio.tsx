'use client';

import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Mic, Volume2, VolumeX } from 'lucide-react';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import { formatoG711De } from '@/lib/audio/g711';
import { capturarMicrofono, reproducirFlujo } from '@/lib/audio/puente';
import type { ControlDeAudio } from '@/lib/audio/puente';

/**
 * A4 (15-E) · HABLAR Y OÍR, CON LA PALABRA YA CONCEDIDA.
 *
 * Se monta sólo cuando el canal dice `transporte: equipo`: la exclusividad y
 * la cola las lleva el turno (ADR-01); esto es el audio en sí. Reproduce la
 * bajada en cuanto aparece y sube el micrófono MIENTRAS se mantiene pulsado
 * «Hablar»: es la forma más honesta de un canal que puede ser semiduplex —el
 * operador ve quién tiene el turno de palabra porque lo está sosteniendo—.
 *
 * Si el equipo anuncia un códec que esta consola no sabe reproducir, se dice
 * con esas palabras en vez de sonar a ruido.
 */
const rutaDeAudio = (copropiedadId: string, dispositivoId: string): string =>
  `/api/ncr/copropiedades/${encodeURIComponent(copropiedadId)}/guardia/intercom/${encodeURIComponent(dispositivoId)}/audio`;

export const ControlesDeAudio = ({
  copropiedadId,
  dispositivoId,
  formatoAnunciado,
}: {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  readonly formatoAnunciado: string | null;
}): JSX.Element => {
  const formato = formatoG711De(formatoAnunciado);
  const [escucha, setEscucha] = useState<'apagada' | 'sonando' | 'terminada' | 'error'>('apagada');
  const [hablando, setHablando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const reproduccion = useRef<ControlDeAudio | null>(null);
  const captura = useRef<ControlDeAudio | null>(null);
  /**
   * Otros fallos (15-M) · lo que el operador QUIERE ahora, no lo que ya se
   * abrió. `getUserMedia` tarda —y la primera vez espera al permiso—: si suelta
   * el botón antes de que el micrófono abra, al abrir se cierra en el acto en
   * vez de quedar transmitiendo sin nadie pulsando. `abriendo` evita que la
   * autorrepetición del teclado abra varias capturas a la vez.
   */
  const quiereHablar = useRef(false);
  const abriendo = useRef(false);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const url = rutaDeAudio(copropiedadId, dispositivoId);

  useEffect(() => {
    if (formato === null) return;
    let vigente = true;
    reproducirFlujo(url, formato, {
      alTerminar: (motivo) => {
        if (vigente) setEscucha(motivo === 'error' ? 'error' : 'terminada');
      },
    })
      .then((control) => {
        if (!vigente) {
          control.detener();
          return;
        }
        reproduccion.current = control;
        setEscucha('sonando');
      })
      .catch((fallo: unknown) => {
        if (vigente) {
          setEscucha('error');
          setError(fallo instanceof Error ? fallo.message : 'No se pudo abrir el audio.');
        }
      });
    return () => {
      vigente = false;
      reproduccion.current?.detener();
      reproduccion.current = null;
      captura.current?.detener();
      captura.current = null;
    };
  }, [url, formato]);

  const empezarAHablar = async (): Promise<void> => {
    quiereHablar.current = true;
    if (formato === null || captura.current !== null || abriendo.current) return;
    abriendo.current = true;
    try {
      const abierta = await capturarMicrofono(formato, (trozo) => {
        void fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/octet-stream' },
          body: trozo,
        }).then((r) => {
          if (!r.ok) setError(`El equipo no aceptó el audio (HTTP ${String(r.status)})`);
        });
      });
      if (!quiereHablar.current || !montado.current) {
        abierta.detener();
        return;
      }
      captura.current = abierta;
      setHablando(true);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo abrir el micrófono.');
    } finally {
      abriendo.current = false;
    }
  };

  const dejarDeHablar = (): void => {
    quiereHablar.current = false;
    captura.current?.detener();
    captura.current = null;
    setHablando(false);
  };

  if (formato === null) {
    return (
      <p className="text-distintivo text-aviso-texto" role="status">
        El equipo anuncia «{formatoAnunciado ?? 'sin formato'}» y esta consola sólo reproduce G.711
        (µ-law/A-law). No se reproduce lo que no se sabe decodificar.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Audio del equipo">
      <Distintivo
        tono={escucha === 'sonando' ? 'exito' : escucha === 'error' ? 'peligro' : 'neutro'}
      >
        {escucha === 'sonando' ? (
          <>
            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> Oyendo · {formato}
          </>
        ) : escucha === 'error' ? (
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
        onMouseDown={() => void empezarAHablar()}
        onMouseUp={dejarDeHablar}
        onMouseLeave={dejarDeHablar}
        onTouchStart={() => void empezarAHablar()}
        onTouchEnd={dejarDeHablar}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') void empezarAHablar();
        }}
        onKeyUp={dejarDeHablar}
      >
        <Mic className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
        {hablando ? 'Hablando… suelte para escuchar' : 'Mantener para hablar'}
      </Boton>
      {error !== undefined ? (
        <span className="text-distintivo text-peligro-texto" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
};
