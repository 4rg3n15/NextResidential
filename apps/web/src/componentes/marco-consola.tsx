'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Rol, Sesion } from '@ncr/contracts';
import { BarraLateral } from './barra-lateral';
import { Cabecera } from './cabecera';
import { ContextoDelCanal } from '@/lib/sse/contexto';
import type { EstadoDelCanal } from '@/lib/sse/canal';

/**
 * Estructura visual de la consola y **dueño del estado del canal en vivo**.
 *
 * El estado vive aquí, y no en el tablero, por una razón concreta: la cabecera
 * lo muestra y las páginas lo producen. Si cada página tuviera el suyo, el
 * indicador desaparecería al navegar y volvería a aparecer, dando la impresión
 * de que la conexión se cae en cada cambio de pantalla.
 */
export const MarcoDeConsola = ({
  sesion,
  rol,
  children,
}: {
  readonly sesion: Sesion;
  readonly rol: Rol;
  readonly children: ReactNode;
}): JSX.Element => {
  const [estado, setEstado] = useState<EstadoDelCanal>('conectando');

  return (
    <ContextoDelCanal.Provider value={{ estado, setEstado }}>
      <div className="flex min-h-dvh">
        <BarraLateral rol={rol} className="hidden md:flex" />
        <div className="flex min-w-0 flex-1 flex-col">
          <Cabecera sesion={sesion} estadoDelCanal={estado} />
          <main id="contenido" className="flex-1 px-6 py-6">
            {children}
          </main>
        </div>
      </div>
    </ContextoDelCanal.Provider>
  );
};
