'use client';

import type { ChangeEvent, JSX } from 'react';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, ImageOff } from 'lucide-react';
import { Boton } from '@/componentes/ui/boton';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { useFotografiaDeVisitante } from '@/lib/api/consultas';
import {
  ImagenDemasiadoGrande,
  dimensionesReducidas,
  prepararImagen,
} from '@/lib/biometria/imagen';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA FOTOGRAFÍA DEL VISITANTE — ETAPA 15-D (O3, ADR-021)
 *
 * Es una foto de IDENTIFICACIÓN: el portero la mira para confrontar. NO es la
 * captura biométrica de `/biometria`: aquí no hay detector de rostro, no hay
 * consentimiento de plantilla y nada viaja a una terminal. Los dos caminos no
 * se mezclan, y por eso este componente no importa nada de aquel salvo la
 * reducción de imagen, que es minimización (Ley 1581 art. 4) en ambos.
 *
 * Lo que sale del navegador es SIEMPRE un JPEG que el lienzo acaba de
 * producir, reducido a 1024 px de lado y acotado en bytes: el tipo declarado
 * coincide con los bytes porque los bytes los hace el navegador, y el servidor
 * lo vuelve a comprobar por su cuenta (§2.7.8).
 *
 * Lo que entra es una URL FIRMADA que caduca (RN-21). Nunca la clave del
 * bucket, nunca los bytes.
 */
export const LADO_MAXIMO_FOTOGRAFIA = 1024;
export const BYTES_MAXIMOS_FOTOGRAFIA = 400 * 1024;

const reducir = async (fichero: File): Promise<string> => {
  const mapa = await createImageBitmap(fichero);
  try {
    const { ancho, alto } = dimensionesReducidas(mapa.width, mapa.height, LADO_MAXIMO_FOTOGRAFIA);
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const pincel = lienzo.getContext('2d');
    if (pincel === null) throw new Error('El navegador no permitió preparar la imagen');
    pincel.drawImage(mapa, 0, 0, ancho, alto);
    return prepararImagen(lienzo, BYTES_MAXIMOS_FOTOGRAFIA).base64;
  } finally {
    mapa.close();
  }
};

export const FotografiaDeVisitante = ({
  copropiedadId,
  autorizacionId,
  visitante,
  tieneFotografia,
  editable,
}: {
  readonly copropiedadId: string;
  readonly autorizacionId: string;
  readonly visitante: string;
  readonly tieneFotografia: boolean;
  /** Sólo una autorización viva admite fotografía nueva (409 en la API). */
  readonly editable: boolean;
}): JSX.Element => {
  const clientes = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const url = useFotografiaDeVisitante(copropiedadId, autorizacionId, tieneFotografia);

  const subir = async (fichero: File): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      const contenidoBase64 = await reducir(fichero);
      desenvolver(
        await cliente.POST('/copropiedades/{id}/autorizaciones/{autorizacionId}/fotografia', {
          params: { path: { id: copropiedadId, autorizacionId } },
          body: { tipoMime: 'image/jpeg', contenidoBase64 },
        }),
      );
      await clientes.invalidateQueries({ queryKey: ['autorizaciones', copropiedadId] });
    } catch (e) {
      // El mensaje de la API viaja tal cual: dice si el tipo no coincide o si
      // la autorización ya está revocada, y eso decide qué hacer después.
      setError(
        e instanceof ErrorDeApi || e instanceof ImagenDemasiadoGrande
          ? e.message
          : 'No se pudo leer la imagen. Use un JPEG o un PNG.',
      );
    } finally {
      setEnviando(false);
      if (entrada.current !== null) entrada.current.value = '';
    }
  };

  const alElegir = (evento: ChangeEvent<HTMLInputElement>): void => {
    const fichero = evento.target.files?.[0];
    if (fichero !== undefined) void subir(fichero);
  };

  return (
    <div className="flex items-start gap-3">
      {tieneFotografia && url.data !== undefined ? (
        // `img` y no `next/image` a propósito: la URL es firmada y caduca, y
        // `next/image` la optimizaría y cachearía en el servidor de la consola,
        // que es justo lo que RN-21 no quiere.
        <img
          src={url.data.url}
          alt={`Fotografía de identificación de ${visitante}`}
          className="size-16 shrink-0 rounded-md border border-borde object-cover"
        />
      ) : tieneFotografia && url.isLoading ? (
        <div
          role="img"
          aria-label="Cargando la fotografía"
          className="size-16 shrink-0 animate-pulse rounded-md bg-neutro-suave"
        />
      ) : (
        <div
          role="img"
          aria-label={tieneFotografia ? 'La fotografía no se pudo cargar' : 'Sin fotografía'}
          className="flex size-16 shrink-0 items-center justify-center rounded-md border border-dashed border-borde text-texto-apagado"
        >
          <ImageOff aria-hidden className="size-5" />
        </div>
      )}
      <div className="min-w-0 space-y-1">
        <p className="text-secundario text-texto-apagado">
          {tieneFotografia ? 'Fotografía de identificación' : 'Sin fotografía de identificación'}
        </p>
        {editable ? (
          <>
            <input
              ref={entrada}
              type="file"
              accept="image/jpeg,image/png"
              capture="user"
              onChange={alElegir}
              className="sr-only"
              aria-label={`Elegir la fotografía de ${visitante}`}
              tabIndex={-1}
            />
            <Boton
              variante="secundario"
              tamano="sm"
              disabled={enviando}
              onClick={() => entrada.current?.click()}
            >
              <Camera aria-hidden className="size-4" />
              {enviando ? 'Subiendo…' : tieneFotografia ? 'Cambiar' : 'Adjuntar fotografía'}
            </Boton>
          </>
        ) : null}
        {error !== undefined ? (
          <p role="alert" className="text-distintivo text-peligro-texto">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
};
