'use client';

import type { JSX } from 'react';
import { Ban, LogIn } from 'lucide-react';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { EstadoVacio } from '@/componentes/estados';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { useMisNotificaciones } from '@/lib/api/residente';
import type { MiNotificacion } from '@/lib/api/residente';
import { fechaYHora } from '@/lib/fechas';
import { estadoDeConsulta } from '../comunes';
import { AvisosEnEsteAparato } from './avisos-en-este-aparato';

const textoDe = (n: MiNotificacion): string => {
  const visitante = n.visitante ?? 'un visitante';
  if (n.tipo === 'visita_rechazada') {
    const motivo = n.motivo?.trim() ?? '';
    return `Portería rechazó la visita de ${visitante}${motivo === '' ? '' : `: ${motivo}`}`;
  }
  return `${n.visitante ?? 'Un visitante'} ingresó al conjunto`;
};

const Fila = ({ n }: { readonly n: MiNotificacion }): JSX.Element => {
  const rechazo = n.tipo === 'visita_rechazada';
  const Icono = rechazo ? Ban : LogIn;
  return (
    <li className="flex items-start gap-3 border-b border-borde-suave px-5 py-3 last:border-b-0">
      <Icono
        aria-hidden="true"
        className={
          rechazo
            ? 'mt-0.5 h-5 w-5 shrink-0 text-peligro-texto'
            : 'mt-0.5 h-5 w-5 shrink-0 text-exito-texto'
        }
      />
      <div className="min-w-0">
        <p className="text-cuerpo text-texto">{textoDe(n)}</p>
        <p className="text-secundario text-texto-apagado">{fechaYHora(n.en)}</p>
      </div>
    </li>
  );
};

/**
 * M-7 · «Notificaciones». La lista se refresca sola; los avisos al teléfono
 * llegan por Web Push a esta consola instalada (15-R, ADR-036).
 *
 * [SUPUESTO] S-152 · sin estado de «vista»: la API no guarda qué leyó el
 * residente, así que la lista no marca nuevas ni leídas; es la misma que la app.
 */
export const PantallaDeMisNotificaciones = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const notificaciones = useMisNotificaciones(copropiedadId);
  const lista = notificaciones.data ?? [];
  return (
    <div className="space-y-6">
      <EncabezadoDePantalla
        titulo="Notificaciones"
        descripcion="Lo que pasó con tus visitas: las que rechazó portería y los ingresos de tus visitantes."
      />
      <AvisosEnEsteAparato copropiedadId={copropiedadId} />
      {estadoDeConsulta(notificaciones, 'Cargando las notificaciones')}
      {notificaciones.data !== undefined && lista.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay avisos"
          descripcion="Aquí aparecerán las visitas que rechacen en portería y los ingresos de tus visitantes."
        />
      ) : null}
      {lista.length > 0 ? (
        <Tarjeta>
          <ul aria-label="Avisos de mis visitas">
            {lista.map((n) => (
              <Fila key={n.id} n={n} />
            ))}
          </ul>
        </Tarjeta>
      ) : null}
    </div>
  );
};
