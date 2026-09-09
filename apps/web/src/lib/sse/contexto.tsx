'use client';

import { createContext, useContext } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { EstadoDelCanal } from './canal';

/**
 * Contexto mínimo para el estado del canal.
 *
 * Es lo único que la consola comparte globalmente, y por eso no hay ninguna
 * biblioteca de estado: el resto —datos del servidor— lo gobierna TanStack
 * Query, que ya tiene caché, reintentos e invalidación. Añadir un almacén
 * global encima produciría dos copias de la misma verdad, y la que se muestre
 * dependería de cuál se actualizó antes. Ver `docs/decisiones/ADR-006`.
 */
export interface ValorDelCanal {
  readonly estado: EstadoDelCanal;
  readonly setEstado: Dispatch<SetStateAction<EstadoDelCanal>>;
}

export const ContextoDelCanal = createContext<ValorDelCanal | null>(null);

export const useCanal = (): ValorDelCanal => {
  const valor = useContext(ContextoDelCanal);
  if (valor === null) {
    throw new Error('useCanal debe usarse dentro del marco de la consola');
  }
  return valor;
};
