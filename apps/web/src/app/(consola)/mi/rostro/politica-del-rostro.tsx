'use client';

import type { JSX } from 'react';
import { CabeceraDeTarjeta, CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import type { PoliticaDelRostro as Politica } from '@/lib/api/residente';
import type { TextosDelRostro } from '@/lib/rostro';

const Casilla = ({
  texto,
  marcada,
  deshabilitada,
  alCambiar,
}: {
  readonly texto: string;
  readonly marcada: boolean;
  readonly deshabilitada: boolean;
  readonly alCambiar: (v: boolean) => void;
}): JSX.Element => (
  <label className="flex cursor-pointer items-start gap-3 py-1 text-cuerpo text-texto">
    <input
      type="checkbox"
      className="mt-1"
      checked={marcada}
      disabled={deshabilitada}
      onChange={(e) => alCambiar(e.target.checked)}
    />
    <span>{texto}</span>
  </label>
);

/**
 * 15-Y3 · la política del tratamiento del rostro (Ley 1581 de 2012), con su
 * versión, la casilla de aceptación y, para un menor, las dos declaraciones
 * del representante legal (ADR-039). El texto es PROVISIONAL (P-39) y llega
 * de la API: aquí no se escribe ni una frase de la política.
 */
export const PoliticaDelRostro = ({
  politica,
  textos,
  acepta,
  declarado,
  deshabilitada,
  alAceptar,
  alDeclarar,
}: {
  readonly politica: Politica;
  readonly textos: TextosDelRostro;
  readonly acepta: boolean;
  readonly declarado: readonly boolean[];
  readonly deshabilitada: boolean;
  readonly alAceptar: (v: boolean) => void;
  readonly alDeclarar: (indice: number, v: boolean) => void;
}): JSX.Element => (
  <Tarjeta>
    <CabeceraDeTarjeta
      titulo="Tratamiento de su rostro"
      descripcion={`Versión ${politica.version}. Léala antes de aceptar.`}
    />
    <CuerpoDeTarjeta className="space-y-2">
      <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-borde-suave bg-neutro-suave p-3 text-secundario text-texto">
        {politica.texto}
      </div>
      <Casilla
        texto={textos.acepto}
        marcada={acepta}
        deshabilitada={deshabilitada}
        alCambiar={alAceptar}
      />
      {textos.declaraciones.map((d, i) => (
        <Casilla
          key={d}
          texto={d}
          marcada={declarado[i] ?? false}
          deshabilitada={deshabilitada}
          alCambiar={(v) => alDeclarar(i, v)}
        />
      ))}
    </CuerpoDeTarjeta>
  </Tarjeta>
);
