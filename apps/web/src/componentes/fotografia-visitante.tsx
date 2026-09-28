'use client';

import type { JSX } from 'react';
import { ImageOff } from 'lucide-react';
import { useFotografiaDeVisitante } from '@/lib/api/consultas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA FOTO DEL VISITANTE, PARA MIRARLA — ETAPA 15-D (O3, ADR-021) · 15-L (F)
 *
 * El portero la mira para confrontar con quien tiene delante. Desde la 15-L la
 * foto se toma al GENERAR la autorización y de ella sale la plantilla que va a
 * los equipos; por eso aquí ya no se cambia: una foto nueva sobre una visita
 * viva dejaría a los equipos reconociendo una cara que la consola ya no
 * enseña. Para otra foto, se genera otra autorización.
 *
 * Lo que entra es una URL FIRMADA que caduca (RN-21). Nunca la clave del
 * bucket, nunca los bytes.
 */
export const FotografiaDeVisitante = ({
  copropiedadId,
  autorizacionId,
  visitante,
  tieneFotografia,
}: {
  readonly copropiedadId: string;
  readonly autorizacionId: string;
  readonly visitante: string;
  readonly tieneFotografia: boolean;
}): JSX.Element => {
  const url = useFotografiaDeVisitante(copropiedadId, autorizacionId, tieneFotografia);

  if (tieneFotografia && url.data !== undefined) {
    // `img` y no `next/image` a propósito: la URL es firmada y caduca, y
    // `next/image` la optimizaría y cachearía en el servidor de la consola,
    // que es justo lo que RN-21 no quiere.
    return (
      <img
        src={url.data.url}
        alt={`Foto de ${visitante}`}
        className="size-32 shrink-0 rounded-md border border-borde object-cover"
      />
    );
  }
  if (tieneFotografia && url.isLoading) {
    return (
      <div
        role="img"
        aria-label="Cargando la foto"
        className="size-32 shrink-0 animate-pulse rounded-md bg-neutro-suave"
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={tieneFotografia ? 'La foto no se pudo cargar' : 'Sin foto'}
      className="flex size-32 shrink-0 items-center justify-center rounded-md border border-dashed border-borde text-texto-apagado"
    >
      <ImageOff aria-hidden className="size-6" />
    </div>
  );
};
