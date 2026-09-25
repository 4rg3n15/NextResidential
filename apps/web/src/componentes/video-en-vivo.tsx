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
  | { readonly tipo: 'error'; readonly codigo: string; readonly mensaje: string };

const TITULO_POR_CODIGO: Record<string, string> = {
  sin_puente: 'Vista en vivo no desplegada',
  sin_video: 'Este equipo no ofrece video',
  puente: 'El puente de video no responde',
  sin_permiso: 'Sin permiso para ver este equipo',
  navegador: 'Este navegador no reproduce WebRTC',
  red: 'No se pudo negociar el video',
};

export const VideoEnVivo = ({
  copropiedadId,
  dispositivoId,
  negociar = negociarVistaEnVivo,
}: {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  /** Inyectable para las pruebas; por omisión, la negociación real. */
  readonly negociar?: (url: string, opciones: OpcionesDeNegociacion) => Promise<ConexionEnVivo>;
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
                  : (TITULO_POR_CODIGO[fase.codigo] ?? TITULO_POR_CODIGO['red'])}
              </p>
              {fase.tipo === 'error' && (
                <p className="mt-1 text-distintivo text-texto-invertidoApagado">{fase.mensaje}</p>
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
        {fase.tipo === 'error' && (
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
