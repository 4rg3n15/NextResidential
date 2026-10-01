'use client';

import type { JSX, ReactNode } from 'react';
import { useId } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { EstadoCargando, estadoSegunCodigo } from '@/componentes/estados';
import { Distintivo } from '@/componentes/ui/distintivo';
import type { TonoDeDistintivo } from '@/componentes/ui/distintivo';
import { ErrorDeApi } from '@/lib/api/cliente';
import type { MiAutorizacion, MiVivienda } from '@/lib/api/residente';
import { rangoConFechas } from '@/lib/fechas';
import { nombreDeVivienda } from '@/lib/vocabulario';

/**
 * Piezas que comparten las pantallas del residente (15-M).
 *
 * `estadoDeConsulta` es el mismo tratamiento que el resto de la consola: el
 * esqueleto mientras carga, y ante un fallo el estado que corresponde al
 * código —401 sesión, 403 sin permiso, 404 no encontrado, 502 la API no responde, 503 la API dice que no está disponible—
 * con reintento. Se centraliza para que las ocho pantallas no lo repitan.
 */
export const estadoDeConsulta = (
  consulta: Pick<UseQueryResult<unknown>, 'isLoading' | 'isError' | 'error' | 'refetch'>,
  etiqueta: string,
): JSX.Element | null => {
  if (consulta.isLoading) return <EstadoCargando etiqueta={etiqueta} />;
  if (consulta.isError) {
    const e = consulta.error;
    return estadoSegunCodigo(
      e instanceof ErrorDeApi ? e : 0,
      e instanceof ErrorDeApi ? e.message : 'No se pudo cargar',
      () => void consulta.refetch(),
    );
  }
  return null;
};

/** «Casa 42 · Manzana B», con el vocabulario que la API manda dentro del dato. */
export const tituloDeVivienda = (v: MiVivienda): string =>
  nombreDeVivienda(
    { vivienda: v.etiquetaVivienda, agrupacion: v.etiquetaAgrupacion },
    v.identificador,
    v.agrupacion,
  );

/** Un código interno («al_dia») nunca se pinta: se traduce o se humaniza. */
export const legible = (codigo: string, conocidos: Readonly<Record<string, string>>): string => {
  const texto = conocidos[codigo];
  if (texto !== undefined) return texto;
  const limpio = codigo.replaceAll('_', ' ').trim();
  return limpio === '' ? '—' : limpio.charAt(0).toUpperCase() + limpio.slice(1);
};

const SITUACION: Readonly<
  Record<MiAutorizacion['situacion'], { readonly tono: TonoDeDistintivo; readonly texto: string }>
> = {
  vigente: { tono: 'exito', texto: 'Vigente' },
  programada: { tono: 'marca', texto: 'Programada' },
  vencida: { tono: 'neutro', texto: 'Vencida' },
  rechazada: { tono: 'peligro', texto: 'Rechazada' },
};

const TIPO_DE_AUTORIZACION: Readonly<Record<string, string>> = {
  puntual: 'Visita puntual',
  recurrente: 'Recurrente',
};

/** La fila de una autorización: la misma que la app pinta en inicio y en visitas. */
export const FilaDeAutorizacion = ({ a }: { readonly a: MiAutorizacion }): JSX.Element => {
  const situacion = SITUACION[a.situacion];
  const motivo = a.motivoRechazo?.trim() ?? '';
  return (
    <li className="flex items-start justify-between gap-3 border-b border-borde-suave py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="font-medium text-texto">{a.visitante}</p>
        <p className="text-secundario text-texto-apagado">
          {[
            legible(a.tipo, TIPO_DE_AUTORIZACION),
            a.placa,
            a.acompanantes > 0 ? `${String(a.acompanantes)} acompañante(s)` : null,
            // [SUPUESTO] S-154 · hora local y fecha DD-MM-YYYY en los dos extremos.
            rangoConFechas(a.desde, a.hasta),
          ]
            .filter((x): x is string => x !== null)
            .join(' · ')}
        </p>
        {a.situacion === 'rechazada' && motivo !== '' ? (
          <p className="text-secundario font-medium text-peligro-texto">Motivo: {motivo}</p>
        ) : null}
      </div>
      <Distintivo tono={situacion.tono}>{situacion.texto}</Distintivo>
    </li>
  );
};

export const Seccion = ({
  titulo,
  descripcion,
  accion,
  children,
}: {
  readonly titulo: string;
  readonly descripcion?: string;
  readonly accion?: ReactNode;
  readonly children: ReactNode;
}): JSX.Element => {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={id} className="text-seccion text-texto">
            {titulo}
          </h2>
          {descripcion !== undefined ? (
            <p className="text-secundario text-texto-apagado">{descripcion}</p>
          ) : null}
        </div>
        {accion}
      </div>
      {children}
    </section>
  );
};

/** Un aviso en tono suave, como los recuadros informativos de la app. */
export const Aviso = ({
  tono = 'neutro',
  children,
}: {
  readonly tono?: 'neutro' | 'aviso';
  readonly children: ReactNode;
}): JSX.Element => (
  <p
    className={
      tono === 'aviso'
        ? 'rounded-md bg-aviso-suave px-3 py-2 text-secundario text-aviso-texto'
        : 'rounded-md bg-neutro-suave px-3 py-2 text-secundario text-neutro-texto'
    }
  >
    {children}
  </p>
);
