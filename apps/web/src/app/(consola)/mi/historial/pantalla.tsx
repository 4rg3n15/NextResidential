'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { EstadoVacio } from '@/componentes/estados';
import { Distintivo } from '@/componentes/ui/distintivo';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { useMiHistorial } from '@/lib/api/residente';
import type { MiEvento, PeriodoDeHistorial } from '@/lib/api/residente';
import { cn } from '@/lib/cn';
import { fechaYHora } from '@/lib/fechas';
import { TEXTO_MOTIVO } from '@/lib/motivos';
import { estadoDeConsulta, legible } from '../comunes';

const PERIODOS: readonly { readonly valor: PeriodoDeHistorial; readonly etiqueta: string }[] = [
  { valor: 'hoy', etiqueta: 'Hoy' },
  { valor: 'semana', etiqueta: 'Esta semana' },
  { valor: 'mes', etiqueta: 'Este mes' },
  { valor: 'todo', etiqueta: 'Todo' },
];

const RESULTADO: Readonly<Record<string, string>> = {
  permitido: 'Permitido',
  negado: 'Negado',
  pendiente: 'Pendiente',
};

const METODO: Readonly<Record<string, string>> = {
  placa: 'Por placa',
  rostro: 'Por rostro',
  manual: 'Apertura manual',
  remota: 'Apertura remota',
  tarjeta: 'Por tarjeta',
};

/** El motivo de una negación, en castellano: el residente tiene derecho a entenderla (M-6). */
const motivoLegible = (motivo: string): string =>
  legible(motivo, TEXTO_MOTIVO as Readonly<Record<string, string>>);

const Evento = ({ e }: { readonly e: MiEvento }): JSX.Element => {
  const negado = e.resultado === 'negado';
  return (
    <li className="space-y-1 border-b border-borde-suave px-5 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-texto">{e.persona ?? e.placaDetectada ?? 'Acceso'}</p>
        <Distintivo tono={negado ? 'peligro' : 'exito'}>
          {legible(e.resultado ?? e.tipo, RESULTADO)}
        </Distintivo>
      </div>
      <p className="text-secundario text-texto-apagado">
        {[
          fechaYHora(e.ocurridoEn),
          legible(e.metodo, METODO),
          e.zona,
          e.placaDetectada !== null && e.persona !== null ? e.placaDetectada : null,
          e.deVisitante ? 'Visitante' : null,
        ]
          .filter((x): x is string => x !== null)
          .join(' · ')}
      </p>
      {e.motivo !== null ? (
        <p className="rounded-md bg-peligro-suave px-2.5 py-1 text-secundario text-peligro-texto">
          {motivoLegible(e.motivo)}
        </p>
      ) : null}
      {e.decididoPorEdge ? (
        <p className="text-distintivo text-neutro-texto">Decidido en el conjunto, sin nube</p>
      ) : null}
    </li>
  );
};

/**
 * M-6 · «Historial» con los cuatro periodos del mockup. Cada acceso dice su
 * resultado y, si se negó, por qué; y marca los decididos por el Edge en vez
 * de esconderlos (KPI-31).
 */
export const PantallaDeMiHistorial = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const [periodo, setPeriodo] = useState<PeriodoDeHistorial>('mes');
  const historial = useMiHistorial(copropiedadId, periodo);
  const eventos = historial.data ?? [];

  return (
    <div className="space-y-6">
      <EncabezadoDePantalla
        titulo="Historial"
        descripcion="Los accesos registrados a tu vivienda: los tuyos, los de tu familia y los de tus visitantes."
        resumen={
          historial.data !== undefined ? (
            <span className="text-secundario text-texto-apagado">
              {String(eventos.length)} acceso(s) en el periodo
            </span>
          ) : undefined
        }
      />
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Periodo</legend>
        {PERIODOS.map((p) => (
          <label
            key={p.valor}
            className={cn(
              'cursor-pointer rounded-full border px-3 py-1.5 text-secundario',
              periodo === p.valor
                ? 'border-marca bg-marca-suave font-medium text-marca-texto'
                : 'border-borde bg-campo text-texto',
            )}
          >
            <input
              type="radio"
              name="periodo"
              value={p.valor}
              checked={periodo === p.valor}
              onChange={() => setPeriodo(p.valor)}
              className="sr-only"
            />
            {p.etiqueta}
          </label>
        ))}
      </fieldset>
      {estadoDeConsulta(historial, 'Cargando el historial')}
      {historial.data !== undefined && eventos.length === 0 ? (
        <EstadoVacio
          titulo="Sin accesos en el periodo"
          descripcion="Sin accesos registrados en el periodo elegido. Prueba con uno más amplio."
        />
      ) : null}
      {eventos.length > 0 ? (
        <Tarjeta>
          <ul aria-label="Accesos de mi vivienda">
            {eventos.map((e) => (
              <Evento key={e.id} e={e} />
            ))}
          </ul>
        </Tarjeta>
      ) : null}
    </div>
  );
};
