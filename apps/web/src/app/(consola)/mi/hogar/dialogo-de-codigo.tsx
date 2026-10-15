'use client';

import type { JSX } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { BotonCompartir } from './boton-compartir';

/**
 * 15-Y2 · enseña un código de un solo uso (el de traspaso de un menor que ya
 * cumplió 18) y lo deja compartir. Vive sólo en memoria mientras el diálogo
 * está abierto: no se guarda en ningún almacén del navegador ni se registra.
 */
export const DialogoDeCodigo = ({
  codigo,
  titulo,
  explicacion,
  textoParaCompartir,
  alCerrar,
}: {
  readonly codigo: string | null;
  readonly titulo: string;
  readonly explicacion: string;
  readonly textoParaCompartir: string;
  readonly alCerrar: () => void;
}): JSX.Element => {
  const referencia = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [aviso, setAviso] = useState<string | null>(null);
  const abierto = codigo !== null;

  useEffect(() => {
    const dialogo = referencia.current;
    if (dialogo === null) return;
    if (abierto && !dialogo.open) {
      setAviso(null);
      dialogo.showModal();
    }
    if (!abierto && dialogo.open) dialogo.close();
  }, [abierto]);

  return (
    <dialog
      ref={referencia}
      aria-labelledby={`${id}-titulo`}
      onCancel={(e) => {
        e.preventDefault();
        alCerrar();
      }}
      className="w-[min(28rem,calc(100vw-2rem))] rounded-tarjeta border border-borde bg-tarjeta p-0 text-texto shadow-flotante backdrop:bg-oscuro/50"
    >
      <div className="space-y-3 px-5 pt-5">
        <h2 id={`${id}-titulo`} className="text-seccion">
          {titulo}
        </h2>
        <p className="text-cuerpo text-texto-apagado">{explicacion}</p>
        {codigo !== null ? (
          <p className="select-all rounded-md bg-neutro-suave px-3 py-2 text-center font-mono text-seccion text-texto">
            {codigo}
          </p>
        ) : null}
        {aviso !== null ? (
          <p role="status" className="text-secundario text-exito-texto">
            {aviso}
          </p>
        ) : null}
      </div>
      <div className="mt-5 flex justify-end gap-2 border-t border-borde bg-lienzo px-5 py-3">
        {codigo !== null ? (
          <BotonCompartir texto={textoParaCompartir} codigo={codigo} alResultado={setAviso} />
        ) : null}
        <Boton type="button" variante="secundario" onClick={alCerrar}>
          Cerrar
        </Boton>
      </div>
    </dialog>
  );
};
