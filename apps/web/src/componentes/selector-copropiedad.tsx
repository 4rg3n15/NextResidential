'use client';

import type { JSX } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { CopropiedadResumen } from '@ncr/contracts';

/**
 * Conmutador de copropiedad de la cabecera.
 *
 * Solo aparece cuando el alcance incluye más de una: al superadministrador
 * (todas) y al operador de central (las de su turno). Un administrador tiene
 * una y ver un desplegable de un elemento sugeriría que hay algo que elegir.
 *
 * **La elección no viaja en la URL ni en un campo del cliente.** Va a una ruta
 * del servidor que la contrasta contra el catálogo y la guarda en una cookie
 * `httpOnly`; después se recarga el árbol del servidor para que las pantallas
 * la lean del mismo sitio que siempre. Si la elección viajara por la URL, el
 * identificador sería un dato que el usuario controla — la API lo rechazaría
 * con 404, pero la consola estaría invitando a intentarlo.
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

  if (disponibles.length <= 1) return null;

  const cambiar = (id: string): void => {
    setError(null);
    void (async () => {
      const respuesta = await fetch('/api/sesion/copropiedad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ copropiedadId: id }),
      }).catch(() => null);

      if (respuesta === null || !respuesta.ok) {
        setError('No se pudo cambiar de copropiedad. Vuelve a intentarlo.');
        return;
      }
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
        disabled={pendiente}
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
      {/* El error se anuncia: un cambio que no ocurre y no dice nada deja al
          operador mirando los datos de la copropiedad equivocada. */}
      <span role="status" aria-live="polite" className="sr-only">
        {pendiente ? 'Cambiando de copropiedad' : ''}
      </span>
      {error !== null ? (
        <span role="alert" className="text-secundario text-peligro">
          {error}
        </span>
      ) : null}
    </div>
  );
};
