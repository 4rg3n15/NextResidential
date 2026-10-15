'use client';

import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ActividadDeVivienda, ActividadPorVivienda as Respuesta } from '@ncr/contracts';
import { cliente, desenvolver, ErrorDeApi } from '@/lib/api/cliente';
import { TablaDeDatos } from './tabla-datos';
import type { Columna } from './tabla-datos';
import { CabeceraDeTarjeta, CuerpoDeTarjeta, Tarjeta } from './ui/tarjeta';
import { estadoSegunCodigo } from './estados';

/**
 * 15-Z3 (D-Z3) · ACTIVIDAD POR VIVIENDA
 *
 * «Torre XX · Apto XXXX — N vehículos en visita activa · M visitantes en este
 * momento», para Portería y para el tablero. Sólo recuentos: ningún nombre,
 * documento ni placa sale de la API para esta vista, así que tampoco hay nada
 * que ocultar aquí.
 *
 * **Sondeo cada 15 s, no tiempo real.** Es una cifra de ocupación, no una
 * alarma: la cola de Portería ya sondea cada 4 s lo urgente, y abrir un canal
 * de tiempo real para un recuento que cambia con cada paso por la puerta
 * costaría una suscripción más por consola sin que nadie la mirase al segundo.
 * En segundo plano no se sondea.
 *
 * **El criterio lo dice la API y la pantalla lo enseña tal cual** (P-41): qué
 * significa «en este momento» con los datos que hay no se decide aquí.
 */
export type OrdenDeActividad = 'actividad' | 'vivienda';

const porTexto = (a: string, b: string): number => a.localeCompare(b, 'es', { numeric: true });
const porTorre = (a: ActividadDeVivienda, b: ActividadDeVivienda): number =>
  Number(a.agrupacion === null) - Number(b.agrupacion === null) ||
  porTexto(a.agrupacion ?? '', b.agrupacion ?? '') ||
  porTexto(a.identificador, b.identificador);

/** Pura: devuelve una copia ordenada. Por actividad es el orden que trae la API; se repite aquí por si el filtro lo deshace. */
export const ordenarFilas = (
  filas: readonly ActividadDeVivienda[],
  orden: OrdenDeActividad,
): readonly ActividadDeVivienda[] =>
  [...filas].sort((a, b) =>
    orden === 'vivienda'
      ? porTorre(a, b)
      : b.visitantesAhora - a.visitantesAhora ||
        b.vehiculosEnVisita - a.vehiculosEnVisita ||
        porTorre(a, b),
  );

export const textoDeVivienda = (f: ActividadDeVivienda): string =>
  f.agrupacion === null ? f.identificador : `${f.agrupacion} · ${f.identificador}`;

const plural = (n: number, uno: string, varios: string): string =>
  `${String(n)} ${n === 1 ? uno : varios}`;

export const useActividadPorVivienda = (copropiedadId: string): UseQueryResult<Respuesta> =>
  useQuery({
    queryKey: ['tablero', copropiedadId, 'actividad-por-vivienda'],
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/tablero/actividad-por-vivienda', {
          params: { path: { id: copropiedadId } },
        }),
      ),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

const COLUMNAS: readonly Columna<ActividadDeVivienda>[] = [
  { clave: 'vivienda', titulo: 'Vivienda', celda: textoDeVivienda, texto: textoDeVivienda },
  {
    clave: 'vehiculos',
    titulo: 'Vehículos',
    alineacion: 'derecha',
    celda: (f) =>
      plural(f.vehiculosEnVisita, 'vehículo en visita activa', 'vehículos en visita activa'),
  },
  {
    clave: 'visitantes',
    titulo: 'Visitantes',
    alineacion: 'derecha',
    celda: (f) =>
      plural(f.visitantesAhora, 'visitante en este momento', 'visitantes en este momento'),
  },
];

const CLASE_SELECT =
  'rounded-campo border border-borde bg-campo px-3 py-2 text-cuerpo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto';

const Filtros = ({
  orden,
  torre,
  torres,
  alCambiar,
}: {
  readonly orden: OrdenDeActividad;
  readonly torre: string;
  readonly torres: readonly string[];
  readonly alCambiar: (cambio: { orden?: OrdenDeActividad; torre?: string }) => void;
}): JSX.Element => (
  <div className="flex flex-wrap gap-3">
    <label className="flex items-center gap-2 text-secundario">
      <span>Orden</span>
      <select
        className={CLASE_SELECT}
        value={orden}
        onChange={(e) => alCambiar({ orden: e.target.value as OrdenDeActividad })}
      >
        <option value="actividad">Más actividad primero</option>
        <option value="vivienda">Por torre y vivienda</option>
      </select>
    </label>
    {torres.length > 0 ? (
      <label className="flex items-center gap-2 text-secundario">
        <span>Torre</span>
        <select
          className={CLASE_SELECT}
          value={torre}
          onChange={(e) => alCambiar({ torre: e.target.value })}
        >
          <option value="">Todas</option>
          {torres.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
    ) : null}
  </div>
);

const HORA = (iso: string): string =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

export const ActividadPorVivienda = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const consulta = useActividadPorVivienda(copropiedadId);
  const [orden, setOrden] = useState<OrdenDeActividad>('actividad');
  const [torre, setTorre] = useState('');
  const filas = useMemo(() => consulta.data?.filas ?? [], [consulta.data]);
  const torres = useMemo(
    () =>
      [...new Set(filas.flatMap((f) => (f.agrupacion === null ? [] : [f.agrupacion])))].sort(
        porTexto,
      ),
    [filas],
  );
  const visibles = useMemo(
    () => ordenarFilas(torre === '' ? filas : filas.filter((f) => f.agrupacion === torre), orden),
    [filas, torre, orden],
  );

  const cuerpo = (): JSX.Element => {
    if (consulta.error !== null) {
      const e = consulta.error;
      return estadoSegunCodigo(
        e instanceof ErrorDeApi ? e : 0,
        e instanceof ErrorDeApi ? e.message : 'Sin conexión con el servidor.',
        () => void consulta.refetch(),
      );
    }
    return (
      <TablaDeDatos
        titulo="actividad por vivienda"
        columnas={COLUMNAS}
        filas={visibles}
        claveDeFila={(f) => f.viviendaId}
        cargando={consulta.isPending}
        porPagina={25}
        vacio={{
          titulo: torre === '' ? 'Sin viviendas activas' : 'Sin viviendas en esa torre',
          descripcion:
            torre === ''
              ? 'Cuando la administración dé de alta viviendas, aquí se verá su actividad.'
              : 'Elige otra torre o quita el filtro.',
        }}
        filtros={
          <Filtros
            orden={orden}
            torre={torre}
            torres={torres}
            alCambiar={(c) => {
              if (c.orden !== undefined) setOrden(c.orden);
              if (c.torre !== undefined) setTorre(c.torre);
            }}
          />
        }
      />
    );
  };

  return (
    <Tarjeta>
      <CabeceraDeTarjeta
        titulo="Actividad por vivienda"
        descripcion={
          consulta.data === undefined
            ? 'Vehículos en visita activa y visitantes en este momento, por vivienda.'
            : `Al ${HORA(consulta.data.ahora)} · se actualiza cada 15 s.`
        }
      />
      <CuerpoDeTarjeta>
        {cuerpo()}
        {consulta.data === undefined ? null : (
          <p className="mt-3 text-etiqueta text-texto-apagado">{consulta.data.criterio}</p>
        )}
      </CuerpoDeTarjeta>
    </Tarjeta>
  );
};
