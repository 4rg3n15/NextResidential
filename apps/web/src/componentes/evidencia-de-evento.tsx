'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { cliente } from '@/lib/api/cliente';

/**
 * La evidencia de un ACCESO, pedida **al abrirlo** y no antes.
 *
 * Es una imagen del bucket privado servida con URL firmada de 60 s. La CSP
 * admite ese origen (`img-src`). Se pide al abrir el evento, no en la lista:
 * pedir una por fila las expondría en el historial del navegador de forma
 * masiva y sin que nadie las mire (RN-21).
 *
 * G2 (15-N) · compartida por Portería y Guardia: la «Atención» que se abre
 * sola enseña la foto o el recorte de placa del elemento, en las dos.
 */
export const EvidenciaDeEvento = ({
  copropiedadId,
  eventoId,
}: {
  readonly copropiedadId: string;
  readonly eventoId: string;
}): JSX.Element => {
  const [estado, setEstado] = useState<'pidiendo' | 'lista' | 'sin-evidencia'>('pidiendo');
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    setEstado('pidiendo');
    void cliente
      .GET('/copropiedades/{id}/eventos/{eventoId}/evidencia', {
        params: { path: { id: copropiedadId, eventoId } },
      })
      .then((r) => {
        // `vigente` evita escribir estado sobre un componente que ya cambió de
        // evento: el operador pasa al siguiente antes de que llegue la firma, y
        // sin esto la miniatura del anterior aparecería sobre el nuevo.
        if (!vigente) return;
        const enlace = (r.data as { url?: string } | undefined)?.url;
        if (typeof enlace === 'string' && enlace !== '') {
          setUrl(enlace);
          setEstado('lista');
        } else {
          setEstado('sin-evidencia');
        }
      })
      .catch(() => {
        if (vigente) setEstado('sin-evidencia');
      });
    return () => {
      vigente = false;
    };
  }, [copropiedadId, eventoId]);

  if (estado === 'pidiendo') {
    return (
      <div className="h-40 w-full animate-pulse rounded-tarjeta bg-borde-suave motion-reduce:animate-none" />
    );
  }
  if (estado === 'sin-evidencia' || url === null) {
    return (
      <p className="rounded-tarjeta border border-borde bg-lienzo px-4 py-3 text-secundario text-texto-apagado">
        Este evento no trae evidencia fotográfica. La cámara puede no haberla enviado, o el enlace
        firmado puede haber caducado: vuelve a abrir el evento para pedir uno nuevo.
      </p>
    );
  }
  return (
    <img
      src={url}
      alt="Evidencia fotográfica del evento"
      className="max-h-64 w-full rounded-tarjeta border border-borde object-cover"
    />
  );
};
