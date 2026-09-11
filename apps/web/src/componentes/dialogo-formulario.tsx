'use client';

import type { JSX, ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
import { Boton } from './ui/boton';

/**
 * Diálogo con formulario — el hermano de `DialogoDeConfirmacion` para lo que
 * NO es una baja.
 *
 * Son dos componentes y no uno con un `if` porque exigen cosas distintas:
 * confirmar una baja **obliga a un motivo** (RN-19) y ese campo no puede ser
 * opcional en ningún camino; un alta no tiene motivo que dar. Unificarlos
 * habría convertido el motivo en opcional, y con él la garantía.
 *
 * Comparten las mecánicas del `<dialog>` nativo: `showModal` para el foco
 * atrapado y la inercia del fondo, y `onCancel` enrutado al padre para que el
 * Escape no deje el estado creyendo que sigue abierto.
 */
export interface PropiedadesDeDialogoDeFormulario {
  readonly abierto: boolean;
  readonly titulo: string;
  readonly descripcion: string;
  readonly etiquetaEnviar: string;
  readonly enviando?: boolean;
  readonly error?: string | undefined;
  readonly puedeEnviar?: boolean;
  readonly alEnviar: () => void;
  readonly alCancelar: () => void;
  readonly children: ReactNode;
}

export const DialogoDeFormulario = ({
  abierto,
  titulo,
  descripcion,
  etiquetaEnviar,
  enviando = false,
  error,
  puedeEnviar = true,
  alEnviar,
  alCancelar,
  children,
}: PropiedadesDeDialogoDeFormulario): JSX.Element => {
  const referencia = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const dialogo = referencia.current;
    if (dialogo === null) return;
    if (abierto && !dialogo.open) dialogo.showModal();
    if (!abierto && dialogo.open) dialogo.close();
  }, [abierto]);

  return (
    <dialog
      ref={referencia}
      aria-labelledby={`${id}-titulo`}
      onCancel={(e) => {
        e.preventDefault();
        alCancelar();
      }}
      className="w-[min(34rem,calc(100vw-2rem))] rounded-tarjeta border border-borde bg-tarjeta p-0 text-texto shadow-flotante backdrop:bg-oscuro/50"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (puedeEnviar && !enviando) alEnviar();
        }}
      >
        <div className="space-y-4 px-5 pt-5">
          <h2 id={`${id}-titulo`} className="text-seccion">
            {titulo}
          </h2>
          <p className="text-cuerpo text-texto-apagado">{descripcion}</p>
          <div className="space-y-3">{children}</div>
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
          <Boton type="submit" disabled={!puedeEnviar || enviando} cargando={enviando}>
            {etiquetaEnviar}
          </Boton>
        </div>
      </form>
    </dialog>
  );
};
