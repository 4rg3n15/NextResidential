'use client';

import type { JSX } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Boton } from './ui/boton';
import type { VarianteDeBoton } from './ui/boton';

/**
 * Modal de confirmación con **motivo obligatorio** — RN-08, CA-16, CA-17.
 *
 * La regla que implementa no es de interfaz: *sin motivo no se ejecuta la
 * apertura*. Aquí eso significa que el botón de confirmar está deshabilitado
 * mientras el motivo no alcance la longitud mínima, y que el motivo viaja al
 * caso de uso. **La consola no es la que hace cumplir la regla** —el backend
 * rechaza la petición sin motivo—; lo que hace es no dejar que el operador
 * llegue a intentarlo, que es distinto y complementario.
 *
 * Se usa `<dialog>` nativo y no una capa de `div`: trae el foco atrapado, el
 * cierre con Escape y el fondo inerte sin escribir nada de eso a mano. Lo que
 * sí hay que añadir es devolver el foco al elemento que lo abrió, porque el
 * navegador no siempre lo hace.
 */

export interface PropiedadesDeConfirmacion {
  readonly abierto: boolean;
  readonly titulo: string;
  readonly descripcion: string;
  readonly etiquetaConfirmar: string;
  readonly variante?: VarianteDeBoton;
  /** Longitud mínima del motivo. Cinco caracteres: «error» es un motivo; «x» no. */
  readonly minimoMotivo?: number;
  readonly sugerencias?: readonly string[];
  readonly enviando?: boolean;
  readonly error?: string | undefined;
  readonly alConfirmar: (motivo: string) => void;
  readonly alCancelar: () => void;
  readonly children?: ReactNode;
}

export const MINIMO_MOTIVO = 5;

export const DialogoDeConfirmacion = ({
  abierto,
  titulo,
  descripcion,
  etiquetaConfirmar,
  variante = 'peligro',
  minimoMotivo = MINIMO_MOTIVO,
  sugerencias = [],
  enviando = false,
  error,
  alConfirmar,
  alCancelar,
  children,
}: PropiedadesDeConfirmacion): JSX.Element => {
  const referencia = useRef<HTMLDialogElement>(null);
  const idMotivo = useId();
  const [motivo, setMotivo] = useState('');
  const suficiente = motivo.trim().length >= minimoMotivo;

  useEffect(() => {
    const dialogo = referencia.current;
    if (dialogo === null) return;
    if (abierto && !dialogo.open) {
      setMotivo('');
      dialogo.showModal();
    }
    if (!abierto && dialogo.open) dialogo.close();
  }, [abierto]);

  return (
    <dialog
      ref={referencia}
      aria-labelledby={`${idMotivo}-titulo`}
      onCancel={(e) => {
        // Escape cierra, pero se enruta por `alCancelar` para que el estado del
        // padre no se quede creyendo que el diálogo sigue abierto.
        e.preventDefault();
        alCancelar();
      }}
      className="w-[min(32rem,calc(100vw-2rem))] rounded-tarjeta border border-borde bg-tarjeta p-0 text-texto shadow-flotante backdrop:bg-oscuro/50"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (suficiente && !enviando) alConfirmar(motivo.trim());
        }}
      >
        <div className="space-y-3 px-5 pt-5">
          <h2 id={`${idMotivo}-titulo`} className="text-seccion">
            {titulo}
          </h2>
          <p className="text-cuerpo text-texto-apagado">{descripcion}</p>
          {children}

          <div className="space-y-1.5">
            <label htmlFor={idMotivo} className="block text-secundario font-medium">
              Motivo <span className="text-peligro-texto">(obligatorio)</span>
            </label>
            <textarea
              id={idMotivo}
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              aria-describedby={`${idMotivo}-ayuda`}
              aria-invalid={motivo.length > 0 && !suficiente}
              className="w-full rounded-campo border border-borde bg-campo p-3 text-cuerpo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
              placeholder="Describe por qué se toma esta decisión"
            />
            <p id={`${idMotivo}-ayuda`} className="text-secundario text-texto-apagado">
              Queda registrado en la auditoría junto a tu usuario y no se puede modificar después.
            </p>
          </div>

          {sugerencias.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {sugerencias.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setMotivo(s)}
                  className="rounded-distintivo border border-borde px-2 py-1 text-secundario text-texto-apagado hover:bg-lienzo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          {error !== undefined ? (
            <p role="alert" className="text-secundario text-peligro-texto">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-borde bg-lienzo px-5 py-3">
          <Boton type="button" variante="secundario" onClick={alCancelar} disabled={enviando}>
            Cancelar
          </Boton>
          <Boton type="submit" variante={variante} disabled={!suficiente} cargando={enviando}>
            {etiquetaConfirmar}
          </Boton>
        </div>
      </form>
    </dialog>
  );
};
