'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ElementoDeLineaDeTiempo } from '@ncr/contracts';

/**
 * D-145 · los operadores que han abierto o negado a mano en lo consultado, para
 * el filtro «Operador». Se ACUMULAN mientras la página está abierta: si no, al
 * filtrar por uno la lista se quedaría con ése solo y no habría cómo cambiar.
 */
export const useOperadoresVistos = (
  elementos: readonly ElementoDeLineaDeTiempo[] | undefined,
): readonly { readonly id: string; readonly nombre: string }[] => {
  const [vistos, setVistos] = useState<ReadonlyMap<string, string>>(() => new Map());

  useEffect(() => {
    const nuevos = (elementos ?? []).flatMap((e) =>
      e.operadorId === null ? [] : [[e.operadorId, e.operador ?? 'Operador sin nombre'] as const],
    );
    if (nuevos.length === 0) return;
    setVistos((m) => {
      if (nuevos.every(([id, nombre]) => m.get(id) === nombre)) return m;
      return new Map([...m, ...nuevos]);
    });
  }, [elementos]);

  return useMemo(
    () =>
      [...vistos]
        .map(([id, nombre]) => ({ id, nombre }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [vistos],
  );
};
