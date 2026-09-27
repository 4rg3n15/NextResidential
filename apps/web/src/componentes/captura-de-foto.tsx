'use client';

import type { ChangeEvent, JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Distintivo } from '@/componentes/ui/distintivo';
import { Ayuda } from '@/componentes/ui/ayuda';
import { CONSEJOS, fallosDeCalidad } from '@/lib/biometria/medidas';
import type { MedidasDeCaptura } from '@/lib/biometria/medidas';
import { medirCaptura } from '@/lib/biometria/deteccion';
import {
  ImagenDemasiadoGrande,
  dimensionesReducidas,
  prepararImagen,
} from '@/lib/biometria/imagen';

/** Lo que sale de aquí hacia «Generar autorización»: la foto lista para enviar. */
export interface FotoLista {
  readonly contenidoBase64: string;
  readonly tipoMime: 'image/jpeg';
  readonly medidas: MedidasDeCaptura;
}

interface Leida {
  readonly medidas: MedidasDeCaptura;
  readonly detectorDisponible: boolean;
  readonly base64: string;
}

/**
 * F1 (15-L) · LA FOTO FRONTAL DEL VISITANTE.
 *
 * Toma la foto (cámara del equipo o archivo), la reduce EN EL NAVEGADOR antes
 * de que salga —la original no se envía—, mide nitidez e iluminación y, si el
 * navegador sabe, cuenta rostros. Si no sabe, no se inventa un rostro: quien
 * opera confirma el encuadre mirando a la persona.
 *
 * Sólo entrega una foto cuando pasa la calidad: el formulario no puede enviar
 * una foto que la terminal no va a reconocer.
 */
export const CapturaDeFoto = ({
  alCambiar,
  etiqueta = 'Foto frontal del visitante',
}: {
  readonly alCambiar: (foto: FotoLista | null) => void;
  readonly etiqueta?: string;
}): JSX.Element => {
  const [leida, setLeida] = useState<Leida | null>(null);
  const [confirmaEncuadre, setConfirmaEncuadre] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const leer = useCallback(async (fichero: File): Promise<void> => {
    setError(undefined);
    setProcesando(true);
    try {
      const mapa = await createImageBitmap(fichero);
      const { ancho, alto } = dimensionesReducidas(mapa.width, mapa.height);
      const lienzo = document.createElement('canvas');
      lienzo.width = ancho;
      lienzo.height = alto;
      const pincel = lienzo.getContext('2d');
      if (pincel === null) throw new Error('El navegador no permitió preparar la imagen');
      pincel.drawImage(mapa, 0, 0, ancho, alto);
      const { data } = pincel.getImageData(0, 0, ancho, alto);
      const lectura = await medirCaptura(mapa, data, ancho, alto);
      const imagen = prepararImagen(lienzo);
      setLeida({
        medidas: lectura.medidas,
        detectorDisponible: lectura.detectorDisponible,
        base64: imagen.base64,
      });
      setConfirmaEncuadre(false);
      mapa.close();
    } catch (fallo) {
      setLeida(null);
      setError(
        fallo instanceof ImagenDemasiadoGrande
          ? fallo.message
          : 'No se pudo leer la imagen. Use una foto JPEG o PNG.',
      );
    } finally {
      setProcesando(false);
    }
  }, []);

  /**
   * Sin detector, la confirmación de quien opera SUSTITUYE al conteo de
   * rostros y a la proporción; se recalcula sobre las mismas medidas para que
   * lo que se juzga sea lo que se envía.
   */
  const medidas: MedidasDeCaptura | null =
    leida === null
      ? null
      : leida.detectorDisponible || !confirmaEncuadre
        ? leida.medidas
        : { ...leida.medidas, rostrosDetectados: 1, proporcionRostro: 0.4 };
  const fallos = medidas === null ? [] : fallosDeCalidad(medidas);

  useEffect(() => {
    alCambiar(
      leida !== null && medidas !== null && fallos.length === 0
        ? { contenidoBase64: leida.base64, tipoMime: 'image/jpeg', medidas }
        : null,
    );
    // `medidas` y `fallos` se derivan de estas dos: basta con sus fuentes.
  }, [leida, confirmaEncuadre]);

  return (
    <div className="space-y-3">
      <label className="block space-y-1.5">
        <span className="flex items-center text-etiqueta font-medium text-texto">
          {etiqueta}
          <Ayuda texto="De frente, sin gafas oscuras ni gorra, con buena luz. La foto se reduce en este equipo antes de enviarse." />
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png"
          capture="user"
          aria-label={etiqueta}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const fichero = e.target.files?.[0];
            if (fichero !== undefined) void leer(fichero);
          }}
          className="block w-full text-secundario file:mr-4 file:rounded-campo file:border-0 file:bg-superficie file:px-4 file:py-2"
        />
      </label>

      {procesando ? (
        <p role="status" className="text-secundario text-texto-apagado">
          Revisando la foto…
        </p>
      ) : null}

      {leida !== null ? (
        <div className="flex flex-wrap items-start gap-4">
          {/* `img` y no `next/image`: la fuente es un `data:` que sólo existe en esta pestaña. */}
          <img
            src={`data:image/jpeg;base64,${leida.base64}`}
            alt="Vista previa de la foto del visitante"
            className="h-32 w-auto rounded-md border border-borde"
          />
          {fallos.length === 0 ? <Distintivo tono="exito">La foto sirve</Distintivo> : null}
        </div>
      ) : null}

      {leida !== null && !leida.detectorDisponible ? (
        <label className="flex items-start gap-2 text-secundario">
          <input
            type="checkbox"
            checked={confirmaEncuadre}
            onChange={(e) => setConfirmaEncuadre(e.target.checked)}
          />
          <span>
            Este navegador no cuenta rostros: confirmo que se ve un solo rostro, de frente y bien
            encuadrado.
          </span>
        </label>
      ) : null}

      {fallos.length > 0 ? (
        <ul className="space-y-1 text-secundario" role="alert">
          {fallos.map((fallo) => (
            <li key={fallo} className="flex items-start gap-2">
              <Distintivo tono="peligro">No sirve</Distintivo>
              <span>{CONSEJOS[fallo]}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {error !== undefined ? (
        <p className="text-secundario text-peligro-texto" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
};
