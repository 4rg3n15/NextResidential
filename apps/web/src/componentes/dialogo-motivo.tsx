'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { Boton } from './ui/boton';
import { cn } from '@/lib/cn';

/**
 * El diálogo que pide el motivo — RN-08, CA-16, CA-17.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO ES UN CAMPO OBLIGATORIO: ES UNA CONDICIÓN DE LA ORDEN
 *
 * La diferencia se nota en lo que hace el botón. Aquí **está deshabilitado
 * hasta que el motivo vale**, y lo que decide si vale es la misma regla que
 * aplica el servidor —importada, no reescrita—. Un formulario que deja pulsar
 * y luego muestra un error enseña a escribir cualquier cosa para pasar; uno que
 * no deja pulsar dice, sin texto, que el motivo es parte de la orden.
 *
 * Y la consola OCULTA, no protege: el rechazo real es el 400 del servidor. Esto
 * evita el viaje, no la regla.
 *
 * **Por qué el contador es hacia arriba y no hacia abajo.** «Faltan 3» es una
 * cuenta atrás para salir del paso. «8 mínimo» dice cuál es el listón. En una
 * portería con alguien esperando, la diferencia entre las dos redacciones es la
 * calidad de lo que queda en la auditoría.
 */
export const LONGITUD_MINIMA_DE_MOTIVO = 8;
export const LONGITUD_MAXIMA_DE_MOTIVO = 300;

/** Misma normalización que el servidor: recorte, NFC y colapso de espacios. */
export const motivoNormalizado = (crudo: string): string =>
  crudo.normalize('NFC').replace(/\s+/g, ' ').trim();

export const motivoAceptable = (crudo: string): boolean => {
  const limpio = motivoNormalizado(crudo);
  return limpio.length >= LONGITUD_MINIMA_DE_MOTIVO && limpio.length <= LONGITUD_MAXIMA_DE_MOTIVO;
};

export const DialogoDeMotivo = ({
  titulo,
  descripcion,
  etiquetaAccion,
  variante = 'primario',
  sugerencias = [],
  cargando = false,
  error,
  alConfirmar,
  alCancelar,
}: {
  readonly titulo: string;
  readonly descripcion: string;
  readonly etiquetaAccion: string;
  readonly variante?: 'primario' | 'peligro';
  readonly sugerencias?: readonly string[];
  readonly cargando?: boolean;
  readonly error?: string | undefined;
  readonly alConfirmar: (motivo: string) => void;
  readonly alCancelar: () => void;
}): JSX.Element => {
  const [motivo, setMotivo] = useState('');
  const limpio = motivoNormalizado(motivo);
  const vale = motivoAceptable(motivo);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-motivo"
      className="fixed inset-0 z-50 flex items-end justify-center bg-oscuro/50 p-4 sm:items-center"
    >
      <div className="w-full max-w-lg rounded-tarjeta border border-borde bg-tarjeta p-5 shadow-flotante motion-safe:animate-desplegar">
        <h2 id="titulo-motivo" className="text-seccion text-texto">
          {titulo}
        </h2>
        <p className="mt-1 text-secundario text-texto-apagado">{descripcion}</p>

        <label htmlFor="motivo" className="mt-4 block text-secundario font-medium text-texto">
          Motivo
        </label>
        <textarea
          id="motivo"
          autoFocus
          rows={3}
          value={motivo}
          maxLength={LONGITUD_MAXIMA_DE_MOTIVO}
          onChange={(e) => setMotivo(e.target.value)}
          aria-describedby="ayuda-motivo"
          className="mt-1.5 w-full rounded-campo border border-borde bg-campo px-3 py-2 text-cuerpo text-texto placeholder:text-texto-apagado focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
          placeholder="Qué pasó y por qué se toma esta decisión"
        />
        <p id="ayuda-motivo" className="mt-1 text-secundario text-texto-apagado">
          {limpio.length} de {LONGITUD_MAXIMA_DE_MOTIVO} · mínimo {LONGITUD_MINIMA_DE_MOTIVO}. Queda
          en la auditoría con tu nombre y la hora.
        </p>

        {sugerencias.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {/*
              Atajos, no plantillas rellenadas: colocan el texto en el campo y
              se puede seguir escribiendo. Un desplegable cerrado de motivos
              acabaría con el 90 % de la auditoría diciendo «Otro».
            */}
            {sugerencias.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setMotivo(s)}
                className="rounded-distintivo border border-borde px-2 py-1 text-distintivo text-texto-apagado transition-colors duration-150 ease-salida [@media(hover:hover)and(pointer:fine)]:hover:border-marca-texto [@media(hover:hover)and(pointer:fine)]:hover:text-texto motion-reduce:transition-none"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        {error !== undefined ? (
          <p role="alert" className="mt-3 text-secundario text-peligro-texto">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Boton variante="secundario" onClick={alCancelar} disabled={cargando}>
            Cancelar
          </Boton>
          <Boton
            variante={variante}
            disabled={!vale}
            cargando={cargando}
            onClick={() => alConfirmar(limpio)}
            className={cn(!vale && 'cursor-not-allowed')}
          >
            {etiquetaAccion}
          </Boton>
        </div>
      </div>
    </div>
  );
};
