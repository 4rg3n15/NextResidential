'use client';

import type { JSX } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ErrorDeApi } from './cliente';

/**
 * Configuración de TanStack Query — ver `docs/decisiones/ADR-006`.
 *
 * Los valores por defecto se eligen contra este dominio, no por costumbre:
 *
 *  - **No se reintenta un 4xx.** Un 401 no mejora reintentando —hay que volver
 *    a entrar—, y un 404 sobre un recurso de otra copropiedad reintentado tres
 *    veces son tres entradas en `auditoria_seguridad` por el mismo intento,
 *    ensuciando justo el registro que sirve para detectar un acceso cruzado.
 *  - **`staleTime` corto.** El canal SSE es quien mantiene la frescura; la
 *    consulta es el respaldo. Un tiempo largo dejaría datos viejos si el canal
 *    cae, que es exactamente cuando más importa.
 *  - **Se refresca al volver a la pestaña.** Un tablero que estuvo veinte
 *    minutos en segundo plano no debe mostrar cifras de hace veinte minutos
 *    como si fueran de ahora.
 */
export const ProveedorDeConsultas = ({ children }: { children: ReactNode }): JSX.Element => {
  // Dentro de `useState` y no en el módulo: un cliente por módulo se
  // compartiría entre peticiones en el servidor y filtraría caché entre
  // usuarios — que en un sistema multiempresa sería una fuga entre copropiedades.
  const [cliente] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: true,
            retry: (intentos, error) => {
              if (error instanceof ErrorDeApi && error.estado >= 400 && error.estado < 500) {
                return false;
              }
              return intentos < 2;
            },
            retryDelay: (intento) => Math.min(8_000, 500 * 2 ** intento),
          },
          mutations: { retry: false },
        },
      }),
  );

  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
};
