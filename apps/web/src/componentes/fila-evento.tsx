import type { JSX } from 'react';
import type { EventoRegistrado } from '@ncr/contracts';
import type { MotivoAcceso } from '@ncr/contracts';
import { Distintivo, DistintivoDePlaca } from './ui/distintivo';
import { textoDeMotivo } from '@/lib/motivos';

/**
 * Fila de «Últimos eventos en tiempo real» — W-02.
 *
 * **Un solo motivo, tipado.** El mockup mostraba «Sin Registro / Lista Negra»
 * en la misma línea; en el dominio son `PLACA_DESCONOCIDA` y `LISTA_NEGRA`,
 * excluyentes, y la precedencia del motor (`listaNegra > vigencia > patrón >
 * zona`) decide cuál se selló. Mostrar dos impediría saber cuál determinó la
 * decisión, que es justamente lo que hace auditable el evento.
 *
 * **La evidencia no se pinta aquí.** Vive en un bucket privado y se sirve con
 * URL firmada de vida corta (RN-21); pedir una por fila las expondría en el
 * historial del navegador de forma masiva y sin que nadie las mire. La miniatura
 * llega con el detalle del evento, en la 09-B.
 */
const hora = (iso: string, zonaHoraria: string): string =>
  new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zonaHoraria,
  });

const TITULO: Readonly<Record<string, string>> = {
  ingreso: 'Entrada',
  salida: 'Salida',
  denegado: 'Intento de acceso',
  alerta: 'Alerta',
  manual: 'Apertura manual',
};

export const FilaDeEvento = ({
  evento,
  zonaHoraria,
}: {
  readonly evento: EventoRegistrado;
  readonly zonaHoraria: string;
}): JSX.Element => {
  const permitido = evento.resultado === 'permitido';
  return (
    <li className="flex items-start gap-3 border-b border-borde-suave px-5 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-cuerpo font-medium text-texto">
            {TITULO[evento.tipo] ?? evento.tipo}
          </span>
          {evento.placaDetectada === null ? null : (
            <DistintivoDePlaca placa={evento.placaDetectada} />
          )}
          {evento.decididoPorEdge ? (
            // KPI-31 / RN-16: decidido localmente por el Edge con caché de
            // reglas. Se marca porque cambia cómo se lee la trazabilidad.
            <Distintivo tono="neutro" conIcono={false}>
              Decidido por el Edge
            </Distintivo>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-secundario text-texto-apagado">
          {permitido
            ? `Regla ${evento.reglaAplicada} · versión ${evento.versionReglas}`
            : textoDeMotivo(evento.motivo as MotivoAcceso | null)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Distintivo tono={permitido ? 'exito' : 'peligro'}>
          {permitido ? 'Autorizado' : 'Denegado'}
        </Distintivo>
        <time dateTime={evento.ocurridoEn} className="text-secundario text-texto-apagado">
          {hora(evento.ocurridoEn, zonaHoraria)}
        </time>
      </div>
    </li>
  );
};
