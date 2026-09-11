'use client';

import type { JSX } from 'react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Sesion } from '@ncr/contracts';
import type { Rol } from '@ncr/contracts';
import { Boton } from './ui/boton';
import { Distintivo } from './ui/distintivo';
import { NOMBRE_DE_ROL } from '@/lib/navegacion';
import type { EstadoDelCanal } from '@/lib/sse/canal';
import type { AlcanceActivo } from '@/app/(consola)/copropiedad';
import { SelectorDeCopropiedad } from './selector-copropiedad';

/**
 * Cabecera: buscador global, estado del canal en vivo y menú de usuario.
 *
 * **El indicador del canal es un requisito, no un adorno.** Una lista que deja
 * de actualizarse sin avisar es peor que una vacía: el operador cree que no
 * pasa nada cuando lo que pasa es que no se está enterando. Por eso el estado
 * va en la cabecera —visible desde cualquier pantalla— y con `aria-live`, para
 * que también se anuncie.
 *
 * El buscador global del mockup queda **deshabilitado con su motivo**: busca
 * casas, placas y residentes, y esas pantallas son de la 09-B. Un buscador que
 * no encuentra nada enseña a no usarlo.
 */
export const Cabecera = ({
  sesion,
  estadoDelCanal,
  alcance,
}: {
  readonly sesion: Sesion;
  readonly estadoDelCanal: EstadoDelCanal;
  readonly alcance: AlcanceActivo;
}): JSX.Element => {
  const router = useRouter();
  const [cerrando, setCerrando] = useState(false);

  const cerrarSesion = async (): Promise<void> => {
    setCerrando(true);
    await fetch('/api/sesion', { method: 'DELETE', credentials: 'same-origin' }).catch(
      () => undefined,
    );
    router.replace('/acceso');
    router.refresh();
  };

  return (
    <header className="flex h-cabecera items-center gap-4 border-b border-borde bg-tarjeta px-6">
      <SelectorDeCopropiedad
        disponibles={alcance.disponibles}
        activa={alcance.copropiedadId}
        alcanceGlobal={alcance.alcanceGlobal}
      />
      <div className="min-w-0 flex-1">
        <label htmlFor="buscador-global" className="sr-only">
          Buscar casa, placa o residente
        </label>
        <input
          id="buscador-global"
          type="search"
          disabled
          placeholder="Buscar casa, placa, residente… (disponible en la ETAPA 09-B)"
          className="h-10 w-full max-w-md rounded-campo border border-borde bg-lienzo px-3 text-cuerpo text-texto-apagado placeholder:text-texto-apagado disabled:cursor-not-allowed"
        />
      </div>

      <IndicadorDeCanal estado={estadoDelCanal} />

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-secundario font-medium text-texto">
            {NOMBRE_DE_ROL[sesion.rol as Rol]}
          </p>
          {sesion.mfaVerificado ? (
            <p className="text-secundario text-exito-texto">Segundo factor verificado</p>
          ) : (
            <p className="text-secundario text-aviso-texto">Sin segundo factor</p>
          )}
        </div>
        <Boton
          variante="secundario"
          tamano="sm"
          cargando={cerrando}
          onClick={() => void cerrarSesion()}
        >
          Salir
        </Boton>
      </div>
    </header>
  );
};

const PRESENTACION: Readonly<
  Record<EstadoDelCanal, { readonly tono: 'exito' | 'aviso' | 'peligro'; readonly texto: string }>
> = {
  conectando: { tono: 'aviso', texto: 'Conectando…' },
  conectado: { tono: 'exito', texto: 'En vivo' },
  reconectando: { tono: 'aviso', texto: 'Reconectando…' },
  'sin-conexion': { tono: 'peligro', texto: 'Sin canal en vivo' },
};

export const IndicadorDeCanal = ({ estado }: { readonly estado: EstadoDelCanal }): JSX.Element => {
  const { tono, texto } = PRESENTACION[estado];
  return (
    <div aria-live="polite" aria-atomic="true">
      <Distintivo tono={tono}>{texto}</Distintivo>
      <span className="sr-only">
        {estado === 'conectado'
          ? 'El canal en vivo está conectado; los eventos llegan al instante.'
          : 'El canal en vivo no está entregando eventos. La lista puede estar desactualizada.'}
      </span>
    </div>
  );
};
