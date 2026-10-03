'use client';

import type { JSX } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { CopropiedadResumen } from '@ncr/contracts';
import { usarCambioDeCopropiedad } from '@/lib/usar-cambio-de-copropiedad';

/**
 * Conmutador de copropiedad de la cabecera.
 *
 * Solo aparece con más de una en el alcance (superadministrador, operador).
 *
 * **La elección no viaja en la URL ni en un campo del cliente.** Una ruta del
 * servidor la contrasta con el catálogo y la guarda en una cookie `httpOnly`;
 * después se recarga el árbol. Por la URL sería un dato que el usuario controla.
 * Del clic al final de la recarga, ninguna escritura sale (H-15K-01).
 */
export const SelectorDeCopropiedad = ({
  disponibles,
  activa,
  alcanceGlobal,
}: {
  readonly disponibles: readonly CopropiedadResumen[];
  readonly activa: string | null;
  readonly alcanceGlobal: boolean;
}): JSX.Element | null => {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cambio = usarCambioDeCopropiedad(pendiente); // E1 (15-R) · H-15K-01

  if (disponibles.length <= 1) return null;

  const cambiar = (id: string): void => {
    setError(null);
    cambio.empezar();
    void (async () => {
      const respuesta = await fetch('/api/sesion/copropiedad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ copropiedadId: id }),
      }).catch(() => null);

      if (respuesta === null || !respuesta.ok) {
        cambio.fallar();
        setError('No se pudo cambiar de copropiedad. Vuelve a intentarlo.');
        return;
      }
      cambio.recargar();
      iniciarTransicion(() => router.refresh());
    })();
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="selector-copropiedad" className="sr-only">
        Copropiedad activa
      </label>
      <select
        id="selector-copropiedad"
        value={activa ?? ''}
        disabled={pendiente || cambio.cambiando}
        onChange={(e) => cambiar(e.target.value)}
        className="h-9 max-w-[16rem] rounded-campo border border-borde bg-tarjeta px-2 text-cuerpo text-texto disabled:opacity-60"
      >
        {disponibles.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      {alcanceGlobal ? (
        <span className="hidden text-secundario text-texto-apagado lg:inline">
          Alcance global · {disponibles.length} copropiedades
        </span>
      ) : null}
      {/* El error se anuncia: un cambio mudo deja mirando la copropiedad equivocada. */}
      <span role="status" aria-live="polite" className="sr-only">
        {pendiente || cambio.cambiando ? 'Cambiando de copropiedad' : ''}
      </span>
      {error !== null ? (
        <span role="alert" className="text-secundario text-peligro">
          {error}
        </span>
      ) : null}
    </div>
  );
};
