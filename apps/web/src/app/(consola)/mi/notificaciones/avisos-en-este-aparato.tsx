'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BellRing } from 'lucide-react';
import { Boton } from '@/componentes/ui/boton';
import { cliente, desenvolver } from '@/lib/api/cliente';
import {
  activarAvisos,
  quitarAvisos,
  resincronizar,
  soporteDeAvisos,
  suscripcionActual,
} from '@/lib/avisos-web';
import { Aviso } from '../comunes';

type Estado = 'revisando' | 'activos' | 'inactivos' | 'bloqueados';

/** iPhone: la consola tiene que estar INSTALADA (iOS 16.4+) para recibir avisos. */
const ComoInstalarEnIphone = (): JSX.Element => (
  <Aviso>
    Para recibir avisos en el iPhone (iOS 16.4 o posterior): abra esta consola en Safari, toque
    Compartir y luego «Añadir a pantalla de inicio». Abra Next Control desde ese ícono, vuelva a
    Notificaciones y pulse «Activar avisos en este aparato».
  </Aviso>
);

/**
 * 15-R · B4 · activar o quitar los avisos al teléfono en ESTE aparato (Web
 * Push, ADR-036). El permiso se pide sólo al pulsar. Si la API no tiene llaves
 * VAPID, o el navegador no admite avisos, lo dice en vez de ofrecer un botón
 * que no puede funcionar. Ante un fallo de la consulta no estorba: la bandeja
 * de abajo sigue siendo la fuente de verdad.
 */
export const AvisosEnEsteAparato = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element | null => {
  const config = useQuery({
    queryKey: ['mi', copropiedadId, 'web-push'] as const,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/mi/notificaciones/web-push', {
          params: { path: { id: copropiedadId } },
        }),
      ),
  });
  const [estado, setEstado] = useState<Estado>('revisando');
  const [error, setError] = useState<string | null>(null);
  const soporte = soporteDeAvisos();
  const disponible = config.data?.disponible === true && soporte === 'si';

  useEffect(() => {
    if (!disponible) return;
    if (Notification.permission === 'denied') {
      setEstado('bloqueados');
      return;
    }
    // Vuelve a entregar la suscripción: el navegador puede haberla rotado.
    void resincronizar(copropiedadId)
      .then((activa) => setEstado(activa ? 'activos' : 'inactivos'))
      .catch(() => setEstado('inactivos'));
  }, [copropiedadId, disponible]);

  if (config.data === undefined) return null;
  if (!config.data.disponible) {
    return <Aviso>Este servidor no envía avisos al teléfono: revise esta lista al entrar.</Aviso>;
  }
  if (soporte === 'iphone_sin_instalar') return <ComoInstalarEnIphone />;
  if (soporte === 'no') {
    return <Aviso>Este navegador no admite avisos. Revise esta lista al entrar.</Aviso>;
  }
  if (estado === 'bloqueados') {
    return (
      <Aviso tono="aviso">
        Los avisos están bloqueados para esta consola en este navegador. Actívelos en la
        configuración del sitio y vuelva a esta pantalla.
      </Aviso>
    );
  }

  const alternar = async (): Promise<void> => {
    setError(null);
    try {
      if (estado === 'activos') {
        await quitarAvisos(copropiedadId);
        setEstado('inactivos');
        return;
      }
      const permiso = await activarAvisos(copropiedadId, config.data?.clavePublica ?? '');
      setEstado(
        permiso === 'granted' ? 'activos' : permiso === 'denied' ? 'bloqueados' : 'inactivos',
      );
    } catch {
      setError('No se pudo cambiar los avisos de este aparato. Inténtelo de nuevo.');
      setEstado((await suscripcionActual().catch(() => null)) === null ? 'inactivos' : 'activos');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Boton
        variante={estado === 'activos' ? 'secundario' : 'primario'}
        cargando={estado === 'revisando'}
        onClick={() => void alternar()}
      >
        <BellRing className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
        {estado === 'activos' ? 'Quitar avisos de este aparato' : 'Activar avisos en este aparato'}
      </Boton>
      <p aria-live="polite" className="text-secundario text-texto-apagado">
        {estado === 'activos' ? 'Los avisos llegan a este aparato.' : null}
        {error}
      </p>
    </div>
  );
};
