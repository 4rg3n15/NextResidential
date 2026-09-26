'use client';

import type { JSX } from 'react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { EstadoDeSesionDePorteria, Sesion } from '@ncr/contracts';
import type { Rol } from '@ncr/contracts';
import { Boton } from './ui/boton';
import { Distintivo } from './ui/distintivo';
import { NOMBRE_DE_ROL } from '@/lib/navegacion';
import type { EstadoDelCanal } from '@/lib/sse/canal';
import type { AlcanceActivo } from '@/app/(consola)/copropiedad';
import { SelectorDeCopropiedad } from './selector-copropiedad';
import { BuscadorGlobal } from './buscador-global';
import { ConmutadorDeTema } from './conmutador-tema';
import { cliente, desenvolver } from '@/lib/api/cliente';

/**
 * Cabecera: buscador global, estado del canal en vivo y menú de usuario.
 *
 * **El indicador del canal es un requisito, no un adorno.** Una lista que deja
 * de actualizarse sin avisar es peor que una vacía: el operador cree que no
 * pasa nada cuando lo que pasa es que no se está enterando. Por eso el estado
 * va en la cabecera —visible desde cualquier pantalla— y con `aria-live`, para
 * que también se anuncie.
 *
 * El buscador global ya funciona: hasta la 09-B estaba deshabilitado porque las
 * pantallas que busca —casas y placas— no existían, y un buscador que no
 * encuentra nada enseña a no usarlo.
 */
export const Cabecera = ({
  sesion,
  estadoDelCanal,
  alcance,
  porteria = null,
}: {
  readonly sesion: Sesion;
  readonly estadoDelCanal: EstadoDelCanal;
  readonly alcance: AlcanceActivo;
  readonly porteria?: EstadoDeSesionDePorteria | null;
}): JSX.Element => {
  const router = useRouter();
  const [cerrando, setCerrando] = useState(false);
  const [saliendoARonda, setSaliendoARonda] = useState(false);

  /**
   * 15-H (ADR-024) · el patrullaje lo pone la API en el servidor; al refrescar,
   * el marco pregunta de nuevo y pinta la pantalla de bloqueo.
   */
  const iniciarPatrullaje = async (): Promise<void> => {
    setSaliendoARonda(true);
    try {
      desenvolver(await cliente.POST('/porteria/sesion/patrullaje'));
    } finally {
      router.refresh();
    }
  };

  const cerrarSesion = async (): Promise<void> => {
    setCerrando(true);
    await fetch('/api/sesion', { method: 'DELETE', credentials: 'same-origin' }).catch(
      () => undefined,
    );
    router.replace('/acceso');
    router.refresh();
  };

  return (
    <header
      /**
       * También pegada. El selector de copropiedad, el buscador y el estado del
       * canal en vivo tienen que seguir alcanzables en las pantallas largas:
       * el indicador del canal avisa de que la lista dejó de actualizarse, y un
       * aviso que hay que ir a buscar desplazándose arriba no avisa de nada.
       *
       * `z-20` la deja por encima del contenido y por debajo de los diálogos.
       */
      className="sticky top-0 z-20 flex h-cabecera items-center gap-4 border-b border-borde bg-tarjeta px-6"
    >
      <SelectorDeCopropiedad
        disponibles={alcance.disponibles}
        activa={alcance.copropiedadId}
        alcanceGlobal={alcance.alcanceGlobal}
      />
      <BuscadorGlobal copropiedadId={alcance.copropiedadId} />

      <IndicadorDeCanal estado={estadoDelCanal} />

      <ConmutadorDeTema />

      {porteria?.estado === 'activa' && porteria.codigo !== null ? (
        <div className="flex items-center gap-2">
          <span
            className="rounded-distintivo bg-marca-suave px-2 py-1 font-mono text-distintivo tracking-widest text-marca-texto"
            aria-label={`Código de patrullaje ${porteria.codigo.split('').join(' ')}`}
            title="Código de patrullaje: lo pedirá la consola al volver de la ronda"
          >
            {porteria.codigo}
          </span>
          <Boton
            variante="secundario"
            tamano="sm"
            cargando={saliendoARonda}
            onClick={() => void iniciarPatrullaje()}
          >
            Patrullaje
          </Boton>
        </div>
      ) : null}

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
