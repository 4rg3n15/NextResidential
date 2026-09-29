'use client';

import type { JSX } from 'react';
import { Ban, LogIn } from 'lucide-react';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { EstadoVacio } from '@/componentes/estados';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { useMisNotificaciones } from '@/lib/api/residente';
import type { MiNotificacion } from '@/lib/api/residente';
import { fechaYHora } from '@/lib/fechas';
import { Aviso, estadoDeConsulta } from '../comunes';

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
 * M-7 · «Notificaciones». En la web no hay aviso al teléfono: se ven al abrir
 * la consola y la lista se refresca sola. El registro de aparatos para
 * notificaciones es de la app (FCM) y aquí no aplica.
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
      <Aviso>
        Aquí los avisos se ven al abrir la consola y se refrescan solos. Los avisos al teléfono
        llegan por la aplicación móvil.
      </Aviso>
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
