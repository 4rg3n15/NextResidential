import type { JSX } from 'react';
import type { PuntoDeFrecuencia } from '@ncr/contracts';

/**
 * Gráfico de frecuencia semanal — W-10.
 *
 * **Es un componente del sistema y no un `canvas` dentro de la pantalla.** Se
 * dibuja con `div` y no con una biblioteca de gráficos por dos motivos que
 * pesan más que la estética: una biblioteca son cientos de kilobytes en la
 * consola, y sobre todo, un `canvas` es **invisible para un lector de
 * pantalla**. Aquí cada barra es un elemento con su texto, la lista tiene su
 * descripción, y quien no ve el gráfico oye las cifras.
 *
 * No calcula nada: recibe los totales ya agregados por la API. Si los sumara
 * aquí, dos pantallas que muestran el mismo periodo podrían dar dos cifras.
 */
export const GraficoDeFrecuencia = ({
  puntos,
  etiqueta,
}: {
  readonly puntos: readonly PuntoDeFrecuencia[];
  readonly etiqueta: string;
}): JSX.Element => {
  if (puntos.length === 0) {
    return (
      <p className="text-secundario text-texto-apagado">
        No hay accesos en el rango, así que no hay frecuencia que dibujar.
      </p>
    );
  }
  const maximo = Math.max(...puntos.map((p) => p.total), 1);

  return (
    <figure>
      <figcaption className="sr-only">{etiqueta}</figcaption>
      <ul className="flex h-40 items-end gap-2" aria-label={etiqueta}>
        {puntos.map((p) => (
          <li
            key={p.semana}
            className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
          >
            <span className="text-distintivo tabular-nums text-texto-apagado">{p.total}</span>
            <div
              className="w-full rounded-t bg-marca"
              style={{ height: `${Math.max(4, Math.round((p.total / maximo) * 100))}%` }}
              role="img"
              aria-label={`Semana del ${p.semana}: ${p.total} accesos`}
            />
            <span className="w-full truncate text-center text-distintivo text-texto-apagado">
              {p.semana.slice(5)}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
};
