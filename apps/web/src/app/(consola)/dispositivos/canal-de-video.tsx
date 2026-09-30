'use client';

import type { JSX } from 'react';
import { useId } from 'react';
import { Campo } from '@/componentes/ui/campo';

/**
 * E2/C1 (15-M) · EL CANAL DE VIDEO, ELEGIDO ENTRE LOS QUE EL EQUIPO DECLARA.
 *
 * En sitio (28/09) la cámara «no tenía el canal 102» y el número se escribía a
 * ciegas. Si la sonda descubrió la lista de flujos del equipo, se ofrece como
 * lista; el subflujo (`x02`) va por omisión porque es el que el navegador
 * reproduce con menos retardo (KPI-33), y si no hay subflujo, el primero. Sin
 * lista —equipo sin sondear, o que no la da— queda el campo de texto de antes.
 */
export interface CanalDeclarado {
  readonly id: string;
  readonly codec: string | null;
}

/**
 * El subflujo (`x02`) si existe; si no, el primero; sin lista, vacío. Vacío NO
 * es el 102 (V2, 15-N): la API usa el que el equipo declare al sondearlo.
 */
export const canalPorOmision = (canales: readonly CanalDeclarado[] | undefined): string =>
  canales?.find((c) => c.id.endsWith('02'))?.id ?? canales?.[0]?.id ?? '';

const AYUDA =
  'Canal × 100 + flujo: x02 es el subflujo (el que mejor ve el navegador), x01 el ' +
  'principal. Vacío: el que el equipo declare; use «Probar conexión» para verlos.';

export const CampoCanalDeVideo = ({
  valor,
  alCambiar,
  canales,
  error,
}: {
  readonly valor: string;
  readonly alCambiar: (canal: string) => void;
  readonly canales?: readonly CanalDeclarado[] | undefined;
  readonly error?: string | undefined;
}): JSX.Element => {
  const id = useId();
  if (canales === undefined || canales.length === 0) {
    return (
      <Campo
        etiqueta="Canal de video (opcional)"
        inputMode="numeric"
        placeholder="101, 102…"
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        ayuda={AYUDA}
        {...(error === undefined ? {} : { error })}
      />
    );
  }
  const declarado = canales.some((c) => c.id === valor);
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-secundario">
      <span className="font-medium text-texto">Canal de video</span>
      <select
        id={id}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        aria-label="Canal de video"
        className="rounded-campo border border-borde bg-campo px-2 py-1.5 text-cuerpo"
      >
        {!declarado && valor.trim() !== '' ? (
          <option value={valor}>{valor} — no lo declara el equipo</option>
        ) : null}
        {canales.map((c) => (
          <option key={c.id} value={c.id}>
            {c.id}
            {c.id.endsWith('02') ? ' (subflujo)' : c.id.endsWith('01') ? ' (principal)' : ''}
            {' — '}
            {c.codec ?? 'códec sin leer'}
          </option>
        ))}
      </select>
      <span className="text-distintivo text-texto-secundario">
        Los canales que el equipo declaró al sondearlo. El subflujo (x02) es el que ve la consola;
        H.264 es el códec que reproduce el navegador.
      </span>
    </label>
  );
};
