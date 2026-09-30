'use client';

import { useEffect, useState } from 'react';
import type { ColaDeAtencion, EnAtencion } from '@ncr/contracts';
import { aQuienAtender, enEspera } from './seleccion';

/**
 * G2 (15-N) · el elemento en «Atención» de una pantalla, con memoria.
 *
 * `inicial` es el que trae la ruta (`?atender=…`, desde el aviso de otra
 * pantalla). Lo que se abre solo o se elige a mano se RECUERDA: la cola se
 * reordena en cada consulta (llega algo crítico delante) y sin memoria la
 * pantalla saltaría a otro mientras el operador habla con el primero.
 */
export const useAtencion = (
  cola: ColaDeAtencion | undefined,
  inicial?: string | undefined,
): {
  readonly actual: EnAtencion | undefined;
  readonly enCola: number;
  readonly atender: (eventoId: string) => void;
} => {
  const [atendiendo, setAtendiendo] = useState<string | null>(inicial ?? null);
  const lista = cola?.cola ?? [];
  const actual = aQuienAtender(atendiendo, lista, cola?.preferencias);

  useEffect(() => {
    if (actual !== undefined && actual.eventoId !== atendiendo) setAtendiendo(actual.eventoId);
  }, [actual, atendiendo]);

  return { actual, enCola: enEspera(lista, actual), atender: setAtendiendo };
};
