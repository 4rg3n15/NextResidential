'use client';

import type { JSX } from 'react';
import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { PuntoDeAcceso } from '@ncr/contracts';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P3 · QUÉ PUERTA DEL EQUIPO EN ATENCIÓN SE ABRE
 *
 * Vive DENTRO del bloque «abrir/denegar» del mockup: no cambia su estructura.
 * Los puntos son los que el administrador descubrió y nombró en la ficha del
 * equipo; aquí no se lee el equipo (abrir no espera a una lectura). Sin puntos
 * —equipo sin descubrir, o que no es videoportero—, la orden abre la puerta de
 * la ficha, como siempre, y se dice. Elegir es obligatorio sólo cuando hay
 * más de uno: abrir «una cualquiera» de dos cerraduras no es una orden.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface PuntoElegido {
  readonly id: string;
  readonly nombre: string;
}

const CLASE_DE_AVISO = 'text-distintivo text-texto-apagado';

/** Los puntos del equipo en atención; la pantalla y el selector comparten la consulta. */
export const usePuntosDelEquipo = (
  copropiedadId: string,
  dispositivoId: string | undefined,
): UseQueryResult<readonly PuntoDeAcceso[]> =>
  useQuery({
    queryKey: ['guardia', copropiedadId, 'puntos', dispositivoId],
    enabled: dispositivoId !== undefined,
    queryFn: async (): Promise<readonly PuntoDeAcceso[]> =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/equipos/{equipoId}/puntos', {
          params: { path: { id: copropiedadId, equipoId: dispositivoId ?? '' } },
        }),
      ).puntos,
    retry: false,
  });

/**
 * El punto con que sale la orden: el elegido; con UNO solo, ése (no hay nada
 * que elegir); con varios y ninguno elegido, ninguno —y la consola no deja
 * abrir—; sin puntos, ninguno —y se abre la puerta de la ficha—.
 */
export const puntoDeLaOrden = (
  lista: readonly PuntoDeAcceso[] | undefined,
  elegido: PuntoElegido | null,
): PuntoElegido | null => {
  if (elegido !== null && lista?.some((p) => p.id === elegido.id) === true) return elegido;
  const unico = lista?.length === 1 ? lista[0] : undefined;
  return unico === undefined ? null : { id: unico.id, nombre: unico.nombre };
};

/** Si hay que elegir antes de abrir: más de un punto y ninguno elegido. */
export const faltaElegirPunto = (
  lista: readonly PuntoDeAcceso[] | undefined,
  elegido: PuntoElegido | null,
): boolean => (lista?.length ?? 0) > 1 && puntoDeLaOrden(lista, elegido) === null;

export const SelectorDePunto = ({
  puntos,
  elegido,
  alElegir,
}: {
  readonly puntos: UseQueryResult<readonly PuntoDeAcceso[]>;
  readonly elegido: PuntoElegido | null;
  readonly alElegir: (punto: PuntoElegido | null) => void;
}): JSX.Element => {
  const grupo = useId();
  const enUso = puntoDeLaOrden(puntos.data, elegido);

  if (puntos.isLoading) {
    return (
      <p className={CLASE_DE_AVISO} role="status" aria-live="polite">
        Cargando los puntos de acceso del equipo…
      </p>
    );
  }
  if (puntos.isError) {
    const e = puntos.error;
    const codigo = e instanceof ErrorDeApi ? e.estado : 0;
    return (
      <p className="text-distintivo text-aviso-texto" role="alert">
        {codigo === 403
          ? 'Tu rol no ve los puntos de acceso de este equipo.'
          : codigo === 0 || codigo === 502
            ? 'Sin conexión con la API: no se pueden elegir puntos ahora. La orden abriría la puerta de la ficha.'
            : `No se pudieron leer los puntos de acceso${e instanceof Error ? `: ${e.message}` : ''}.`}{' '}
        <button
          type="button"
          className="underline underline-offset-2"
          onClick={() => void puntos.refetch()}
        >
          Reintentar
        </button>
      </p>
    );
  }
  const lista = puntos.data ?? [];
  if (lista.length === 0) {
    return (
      <p className={CLASE_DE_AVISO} role="status">
        Este equipo no tiene puntos de acceso descubiertos: se abre la puerta de su ficha.
      </p>
    );
  }
  return (
    <fieldset className="rounded-tarjeta border border-borde px-3 py-2">
      <legend id={grupo} className="px-1 text-etiqueta uppercase tracking-wide text-texto-apagado">
        Punto de acceso
      </legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {lista.map((p) => (
          <label
            key={p.id}
            className="inline-flex min-h-8 items-center gap-2 text-cuerpo text-texto"
          >
            <input
              type="radio"
              name={grupo}
              value={p.id}
              checked={enUso?.id === p.id}
              onChange={() => alElegir({ id: p.id, nombre: p.nombre })}
              className="h-4 w-4 accent-marca"
            />
            {p.nombre}
            {p.modulo === null || p.modulo === 'Salidas del equipo' ? null : (
              <span className="text-distintivo text-texto-apagado">· {p.modulo}</span>
            )}
          </label>
        ))}
      </div>
      {faltaElegirPunto(lista, elegido) ? (
        <p className="mt-1 text-distintivo text-aviso-texto" role="status">
          Elija qué puerta abrir: el equipo tiene {String(lista.length)}.
        </p>
      ) : null}
    </fieldset>
  );
};
