'use client';

import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { EstadoCargando } from '@/componentes/estados';
import { Boton } from '@/componentes/ui/boton';
import { CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { opcionesDelRostro } from '@/lib/api/residente';
import { claveDeAhoraNo, tieneRostro } from '@/lib/rostro';

const yaRespondio = (cuenta: string): boolean => {
  try {
    return cuenta !== '' && localStorage.getItem(claveDeAhoraNo(cuenta)) !== null;
  } catch {
    return false;
  }
};

const recordarAhoraNo = (cuenta: string): void => {
  try {
    if (cuenta !== '') localStorage.setItem(claveDeAhoraNo(cuenta), 'si');
  } catch {
    // Sin almacén (modo privado, datos bloqueados): se vuelve a preguntar la próxima vez.
  }
};

/**
 * 15-Y3 · la invitación del primer ingreso, como «Entre con su rostro» en la
 * app: sin rostro registrado y sin un «Ahora no» de esta cuenta, se ofrece una
 * vez; «Ahora no» se recuerda en este navegador (no es un dato sensible: sólo
 * que se respondió). Si la API no contesta, se entra sin la invitación.
 */
export const InvitacionDelRostro = ({
  copropiedadId,
  cuenta,
  children,
}: {
  readonly copropiedadId: string;
  readonly cuenta: string;
  readonly children: ReactNode;
}): JSX.Element => {
  const [respondida, setRespondida] = useState(() => yaRespondio(cuenta));
  const rostro = useQuery({ ...opcionesDelRostro(copropiedadId, null), enabled: !respondida });
  if (respondida || rostro.isError) return <>{children}</>;
  if (rostro.isPending) return <EstadoCargando etiqueta="Cargando tu cuenta" />;
  if (tieneRostro(rostro.data.estado)) return <>{children}</>;
  return (
    <Tarjeta>
      <CuerpoDeTarjeta className="space-y-4 pt-5 text-center">
        <h2 className="text-seccion text-texto">Entre con su rostro</h2>
        <p className="text-cuerpo text-texto-apagado">
          Con su rostro registrado, la terminal de la portería lo reconoce y le abre. Es opcional:
          puede entrar sin él y registrarlo después desde «Perfil».
        </p>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/mi/rostro"
            prefetch={false}
            className="inline-flex h-11 items-center justify-center rounded-campo bg-marca px-4 font-medium text-blanco"
          >
            Registrar mi rostro
          </Link>
          <Boton
            type="button"
            variante="secundario"
            onClick={() => {
              recordarAhoraNo(cuenta);
              setRespondida(true);
            }}
          >
            Ahora no
          </Boton>
        </div>
      </CuerpoDeTarjeta>
    </Tarjeta>
  );
};
