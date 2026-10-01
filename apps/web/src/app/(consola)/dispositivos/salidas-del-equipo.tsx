'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NodoDeSalidas, PuntoDeAcceso, SalidasDelEquipo } from '@ncr/contracts';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import type { TonoDeDistintivo } from '@/componentes/ui/distintivo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P3 · LAS SALIDAS DEL VIDEOPORTERO, EN SU FICHA
 *
 * Lo que el equipo DECLARA hoy (equipo → módulo → salida), leído por el
 * servidor con la credencial guardada —que no viaja aquí—, y lo PERSISTIDO:
 * los puntos de acceso que la guardia ofrece, con el nombre que se les dé.
 * «Descubrir» alinea lo segundo con lo primero; el nombre editado sobrevive.
 * El árbol llega plano y tiene tres niveles fijos: se agrupa, no se recorre.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const ESTADO: Readonly<
  Record<string, { readonly texto: string; readonly tono: TonoDeDistintivo }>
> = {
  en_linea: { texto: 'En línea', tono: 'exito' },
  fuera_de_linea: { texto: 'Fuera de línea', tono: 'aviso' },
  manipulada: { texto: 'Manipulada', tono: 'peligro' },
  averiada: { texto: 'Averiada', tono: 'peligro' },
};

const mensajeDe = (e: unknown): string => {
  const codigo = e instanceof ErrorDeApi ? e.estado : 0;
  if (codigo === 403) return 'Tu rol no administra las salidas de este equipo.';
  if (codigo === 0 || codigo === 502) return 'Sin conexión con la API: reintente en un momento.';
  return e instanceof Error ? e.message : 'No se pudo completar';
};

const FilaDePunto = ({
  punto,
  guardando,
  alGuardar,
}: {
  readonly punto: PuntoDeAcceso;
  readonly guardando: boolean;
  readonly alGuardar: (nombre: string) => void;
}): JSX.Element => {
  const [nombre, setNombre] = useState(punto.nombre);
  const cambiado = nombre.trim() !== '' && nombre.trim() !== punto.nombre;
  return (
    <li className="flex flex-wrap items-center gap-2">
      <label className="flex flex-1 items-center gap-2 text-secundario text-texto">
        <span className="w-16 shrink-0 text-texto-apagado">
          Puerta {String(punto.numeroDePuerta)}
        </span>
        <input
          value={nombre}
          maxLength={80}
          onChange={(e) => setNombre(e.target.value)}
          aria-label={`Nombre de la puerta ${String(punto.numeroDePuerta)}`}
          className="min-w-0 flex-1 rounded-campo border border-borde bg-campo px-2 py-1 text-cuerpo"
        />
      </label>
      <Boton
        type="button"
        tamano="sm"
        variante="secundario"
        disabled={!cambiado}
        cargando={guardando}
        onClick={() => alGuardar(nombre)}
      >
        Guardar nombre
      </Boton>
    </li>
  );
};

const Modulo = ({
  modulo,
  salidas,
}: {
  readonly modulo: NodoDeSalidas;
  readonly salidas: readonly NodoDeSalidas[];
}): JSX.Element => {
  const estado = modulo.estado === null ? undefined : ESTADO[modulo.estado];
  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-secundario font-medium text-texto">
        {modulo.nombre}
        {estado === undefined ? null : <Distintivo tono={estado.tono}>{estado.texto}</Distintivo>}
      </div>
      {modulo.nota === null ? null : (
        <p className="text-distintivo text-texto-apagado">{modulo.nota}</p>
      )}
      {salidas.length === 0 ? null : (
        <ul
          className="ml-4 list-disc text-secundario text-texto"
          aria-label={`Salidas de ${modulo.nombre}`}
        >
          {salidas.map((s) => (
            <li key={s.ruta}>
              {s.nombre}
              {s.nota === null ? null : <span className="text-texto-apagado"> · {s.nota}</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

export const SalidasDelVideoportero = ({
  copropiedadId,
  equipoId,
}: {
  readonly copropiedadId: string;
  readonly equipoId: string;
}): JSX.Element => {
  const clave = ['equipos', copropiedadId, equipoId, 'salidas'];
  const clientes = useQueryClient();
  const ruta = { params: { path: { id: copropiedadId, equipoId } } };
  const vista = useQuery({
    queryKey: clave,
    queryFn: async (): Promise<SalidasDelEquipo> =>
      desenvolver(await cliente.GET('/copropiedades/{id}/equipos/{equipoId}/salidas', ruta)),
    retry: false,
  });
  const descubrir = useMutation({
    mutationFn: async (): Promise<SalidasDelEquipo> =>
      desenvolver(
        await cliente.POST('/copropiedades/{id}/equipos/{equipoId}/salidas/descubrir', ruta),
      ),
    onSuccess: (datos) => clientes.setQueryData(clave, datos),
  });
  const renombrar = useMutation({
    mutationFn: async (e: { readonly puntoId: string; readonly nombre: string }) =>
      desenvolver(
        await cliente.PATCH('/copropiedades/{id}/equipos/{equipoId}/salidas/{puntoId}', {
          params: { path: { id: copropiedadId, equipoId, puntoId: e.puntoId } },
          body: { nombre: e.nombre },
        }),
      ),
    onSuccess: () => void clientes.invalidateQueries({ queryKey: clave }),
  });

  const datos = descubrir.data ?? vista.data;
  const modulos = (datos?.arbol ?? []).filter((n) => n.nivel === 2);
  const fallo = descubrir.error ?? renombrar.error ?? vista.error;

  return (
    <section className="space-y-2" aria-labelledby={`salidas-${equipoId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`salidas-${equipoId}`} className="text-cuerpo font-semibold text-texto">
          Salidas del videoportero
        </h3>
        <Boton
          type="button"
          tamano="sm"
          variante="secundario"
          cargando={descubrir.isPending}
          onClick={() => descubrir.mutate()}
        >
          Descubrir salidas
        </Boton>
      </div>
      {vista.isLoading ? (
        <p className="text-distintivo text-texto-apagado" role="status" aria-live="polite">
          Leyendo lo que el equipo declara…
        </p>
      ) : null}
      {fallo === null ? null : (
        <p className="text-distintivo text-peligro-texto" role="alert">
          {mensajeDe(fallo)}
        </p>
      )}
      {datos?.motivoSinArbol === null || datos === undefined ? null : (
        <p className="text-distintivo text-aviso-texto" role="status">
          No se pudo leer el equipo: {datos.motivoSinArbol}
        </p>
      )}
      {modulos.length === 0 ? null : (
        <ul className="space-y-2" aria-label="Lo que el equipo declara">
          {modulos.map((m) => (
            <Modulo
              key={m.ruta}
              modulo={m}
              salidas={(datos?.arbol ?? []).filter(
                (n) => n.padre === m.ruta && n.tipo === 'salida',
              )}
            />
          ))}
        </ul>
      )}
      <h4 className="text-secundario font-medium text-texto">Puntos de acceso para la guardia</h4>
      {datos !== undefined && datos.puntos.length === 0 ? (
        <p className="text-distintivo text-texto-apagado" role="status">
          Aún no hay puntos: use «Descubrir salidas». Mientras tanto la guardia abre la puerta de la
          ficha.
        </p>
      ) : (
        <ul className="space-y-1">
          {(datos?.puntos ?? []).map((p) => (
            <FilaDePunto
              key={`${p.id}-${p.nombre}`}
              punto={p}
              guardando={renombrar.isPending && renombrar.variables.puntoId === p.id}
              alGuardar={(nombre) => renombrar.mutate({ puntoId: p.id, nombre })}
            />
          ))}
        </ul>
      )}
      <p className="text-distintivo text-texto-apagado">
        La consola sólo ABRE. Dejar una puerta libre o bloqueada queda fuera (pendiente de definir
        quién puede hacerlo).
      </p>
    </section>
  );
};
