'use client';

import type { JSX } from 'react';
import { Boton } from '@/componentes/ui/boton';
import type { PoliticaDeDatos } from '@/lib/registro/respuesta';

/**
 * La política de tratamiento de datos (Ley 1581 de 2012), tal cual la entrega
 * el servidor y con su versión; la casilla es la aceptación. Las tres
 * situaciones de la app: cargando, sin política (sin ella no hay cuenta) y
 * con política.
 */
export const CasillaDePolitica = ({
  politica,
  fallo,
  aceptada,
  aviso,
  alCambiar,
  alReintentar,
}: {
  readonly politica: PoliticaDeDatos | null;
  readonly fallo: string | null;
  readonly aceptada: boolean;
  readonly aviso: string | undefined;
  readonly alCambiar: (aceptada: boolean) => void;
  readonly alReintentar: () => void;
}): JSX.Element => {
  if (politica === null && fallo === null) {
    return (
      <p role="status" className="text-secundario text-texto-apagado">
        Cargando la política de tratamiento de datos…
      </p>
    );
  }
  if (politica === null) {
    return (
      <div role="alert" className="space-y-2 rounded-campo bg-peligro-suave p-3">
        <p className="text-secundario text-peligro-texto">
          No se pudo cargar la política de tratamiento de datos, y sin aceptarla no se crea la
          cuenta. {fallo}
        </p>
        <Boton type="button" variante="secundario" tamano="sm" onClick={alReintentar}>
          Reintentar
        </Boton>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <h2 className="text-cuerpo font-medium text-texto">Tratamiento de sus datos</h2>
      {aviso === undefined ? null : (
        <p role="status" className="text-secundario text-aviso-texto">
          {aviso}
        </p>
      )}
      <div
        data-version={politica.version}
        className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-campo border border-borde bg-campo p-3 text-secundario text-texto"
      >
        {politica.texto}
      </div>
      <label className="flex cursor-pointer items-start gap-3 py-1">
        <input
          type="checkbox"
          name="aceptaTratamientoDeDatos"
          className="mt-1 h-4 w-4 accent-marca-boton"
          checked={aceptada}
          onChange={(e) => alCambiar(e.target.checked)}
        />
        <span className="text-cuerpo text-texto">
          He leído y acepto la política de tratamiento de mis datos
        </span>
      </label>
    </div>
  );
};
