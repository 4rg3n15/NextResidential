import type { JSX, ReactNode } from 'react';

/**
 * Encabezado de pantalla — título, contexto y acción principal.
 *
 * **Está en el sistema y no en cada pantalla porque se repite siete veces.** La
 * alternativa que se descartó fue copiar tres `div` en cada vista: al tercer
 * copiado, dos pantallas tenían el título en tamaños distintos y una había
 * perdido el `h1`, que es el ancla que un lector de pantalla usa para saber
 * dónde está.
 *
 * `resumen` es para cifras que describen lo que se está viendo —«120 activas ·
 * 8 inactivas»—, no para adornos: si no hay un número honesto que poner, se
 * deja vacío.
 */
export interface PropiedadesDeEncabezado {
  readonly titulo: string;
  readonly descripcion: string;
  readonly resumen?: ReactNode;
  readonly acciones?: ReactNode;
}

export const EncabezadoDePantalla = ({
  titulo,
  descripcion,
  resumen,
  acciones,
}: PropiedadesDeEncabezado): JSX.Element => (
  <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div className="min-w-0">
      <h1 className="text-titulo text-texto">{titulo}</h1>
      <p className="mt-1 max-w-2xl text-cuerpo text-texto-apagado">{descripcion}</p>
      {resumen !== undefined ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">{resumen}</div>
      ) : null}
    </div>
    {acciones !== undefined ? <div className="flex shrink-0 gap-2">{acciones}</div> : null}
  </header>
);
