'use client';

import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Video, VideoOff } from 'lucide-react';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import { ErrorDeVistaEnVivo, negociarVistaEnVivo, rutaWhep } from '@/lib/video/whep';
import type { ConexionEnVivo, OpcionesDeNegociacion } from '@/lib/video/whep';

/**
 * A5 (15-E) · LA CÁMARA DEL EQUIPO, EN LA CONSOLA.
 *
 * Negocia WebRTC contra la API (WHEP) y cuelga el flujo del `<video>`. Dos
 * tiempos se muestran porque KPI-33 (< 2 s) se demuestra midiendo, no
 * afirmando: la negociación (oferta → respuesta) y el PRIMER CUADRO (desde
 * que se pidió hasta que el navegador reproduce). El segundo es el que ve el
 * operador; el primero dice dónde se fue el tiempo si el segundo es malo.
 *
 * Cada negativa se dice con su causa: sin puente en la API (503), equipo sin
 * video (409), puente caído (502). Un recuadro negro sin explicación es
 * indistinguible de una cámara caída, y eso es justo lo que no puede pasar en
 * una consola de guardia.
 */
type Fase =
  | { readonly tipo: 'conectando' }
  | {
      readonly tipo: 'reproduciendo';
      readonly negociacionMs: number;
      readonly primerCuadroMs: number | null;
    }
  | { readonly tipo: 'error'; readonly codigo: string; readonly mensaje: string }
  /** D3 (15-L) · negoció, pero el equipo no manda imagen. */
  | { readonly tipo: 'sin_senal' };

/** D3 (15-L) · sin primer cuadro en este tiempo, «sin señal» y no un negro. */
export const PLAZO_PRIMER_CUADRO_MS = 8000;

const TITULO_POR_CODIGO: Record<string, string> = {
  sin_puente: 'Vista en vivo no desplegada',
  // 409 · no ofrece video, o lo entrega en un códec que el navegador no
  // reproduce (H.265): el mensaje de la API dice cuál de las dos.
  sin_video: 'Sin video de este equipo',
  cortado: 'Se cortó el video',
  puente: 'El puente de video no responde',
  sin_permiso: 'Sin permiso para ver este equipo',
  navegador: 'Este navegador no reproduce WebRTC',
  red: 'No se pudo negociar el video',
};

export const VideoEnVivo = ({
  copropiedadId,
  dispositivoId,
  negociar = negociarVistaEnVivo,
  plazoPrimerCuadroMs = PLAZO_PRIMER_CUADRO_MS,
}: {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  /** Inyectable para las pruebas; por omisión, la negociación real. */
  readonly negociar?: (url: string, opciones: OpcionesDeNegociacion) => Promise<ConexionEnVivo>;
  readonly plazoPrimerCuadroMs?: number;
}): JSX.Element => {
  const [fase, setFase] = useState<Fase>({ tipo: 'conectando' });
  const [intento, setIntento] = useState(0);
  const video = useRef<HTMLVideoElement | null>(null);
  const inicio = useRef<number>(0);

  useEffect(() => {
    let vigente = true;
    let conexion: ConexionEnVivo | null = null;
    inicio.current = performance.now();
    setFase({ tipo: 'conectando' });
    negociar(rutaWhep(copropiedadId, dispositivoId), {
      alFlujo: (flujo) => {
        if (video.current !== null) video.current.srcObject = flujo;
      },
      alCortarse: () => {
        if (!vigente) return;
        setFase({
          tipo: 'error',
          codigo: 'cortado',
          mensaje: 'La conexión con el puente de video se interrumpió: reintente',
        });
      },
    })
      .then((c) => {
        if (!vigente) {
          c.cerrar();
          return;
        }
        conexion = c;
        setFase({
          tipo: 'reproduciendo',
          negociacionMs: c.latenciaNegociacionMs,
          primerCuadroMs: null,
        });
      })
      .catch((error: unknown) => {
        if (!vigente) return;
        const codigo = error instanceof ErrorDeVistaEnVivo ? error.codigo : 'red';
        const mensaje = error instanceof Error ? error.message : String(error);
        setFase({ tipo: 'error', codigo, mensaje });
      });
    return () => {
      vigente = false;
      conexion?.cerrar();
      if (video.current !== null) video.current.srcObject = null;
    };
  }, [copropiedadId, dispositivoId, intento, negociar]);

  // D3 (15-L) · negoció y no llega imagen: se dice «sin señal», no un negro.
  const esperandoCuadro = fase.tipo === 'reproduciendo' && fase.primerCuadroMs === null;
  useEffect(() => {
    if (!esperandoCuadro) return;
    const temporizador = setTimeout(() => setFase({ tipo: 'sin_senal' }), plazoPrimerCuadroMs);
    return () => clearTimeout(temporizador);
  }, [esperandoCuadro, plazoPrimerCuadroMs]);

  const alReproducir = (): void => {
    const primerCuadroMs = Math.round(performance.now() - inicio.current);
    setFase((actual) => (actual.tipo === 'reproduciendo' ? { ...actual, primerCuadroMs } : actual));
  };

  return (
    <div className="space-y-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-tarjeta border border-borde bg-oscuro">
        <video
          ref={video}
          className="h-full w-full object-contain"
          autoPlay
          muted
          playsInline
          onPlaying={alReproducir}
          aria-label={`Video en vivo del equipo ${dispositivoId.slice(0, 8)}`}
        />
        {fase.tipo !== 'reproduciendo' && (
          <div
            role="status"
            className="absolute inset-0 flex items-center justify-center px-6 text-center"
          >
            <div>
              {fase.tipo === 'conectando' ? (
                <Video
                  className="mx-auto h-8 w-8 animate-pulse text-texto-invertidoApagado"
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
              ) : (
                <VideoOff
                  className="mx-auto h-8 w-8 text-texto-invertidoApagado"
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
              )}
              <p className="mt-2 text-secundario text-texto-invertido">
                {fase.tipo === 'conectando'
                  ? 'Negociando el video con la API…'
                  : fase.tipo === 'sin_senal'
                    ? 'Sin señal'
                    : (TITULO_POR_CODIGO[fase.codigo] ?? TITULO_POR_CODIGO['red'])}
              </p>
              {fase.tipo === 'error' && (
                <p className="mt-1 text-distintivo text-texto-invertidoApagado">{fase.mensaje}</p>
              )}
              {fase.tipo === 'sin_senal' && (
                <p className="mt-1 text-distintivo text-texto-invertidoApagado">
                  El video se negoció pero el equipo no envía imagen. Si su ficha dice H.265,
                  cámbielo a H.264; si no, pruebe la conexión del equipo.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-distintivo text-texto-secundario">
        {fase.tipo === 'reproduciendo' && (
          <>
            <Distintivo tono="exito">En vivo</Distintivo>
            <span>negociación {fase.negociacionMs} ms</span>
            <span>
              · primer cuadro{' '}
              {fase.primerCuadroMs === null ? 'pendiente' : `${fase.primerCuadroMs} ms`}
            </span>
            <span
              className={
                fase.primerCuadroMs !== null && fase.primerCuadroMs > 2000
                  ? 'text-peligro'
                  : undefined
              }
            >
              · KPI-33 &lt; 2 s
            </span>
          </>
        )}
        {(fase.tipo === 'error' || fase.tipo === 'sin_senal') && (
          <Boton
            type="button"
            variante="secundario"
            tamano="sm"
            onClick={() => setIntento((n) => n + 1)}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
            Reintentar
          </Boton>
        )}
      </div>
    </div>
  );
};
