'use client';

import type { JSX } from 'react';
import Link from 'next/link';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import type { MenorDelHogar } from '@/lib/api/residente';
import { detalleDeMenor, yaEsMayor } from '@/lib/hogar';
import { explicacionDelRostroDelMenor, rostroDelMenorEnLaWeb } from '@/lib/rostro';

export const AVISO_DE_MAYORIA =
  'Ya cumplió 18 años: puede crear su propia cuenta con un código que genera el titular.';

/**
 * 15-Y2 · la fila de un menor en «Mi familia», como en la app: nombre, detalle
 * (parentesco · edad · documento enmascarado · plaza), «Sin cuenta», y las
 * acciones de cualquier adulto (editar, dar de baja). A los 18 (ADR-038) se
 * avisa, y sólo el titular ve «Código para su cuenta». 15-Y3 · su rostro
 * (ADR-039): de 15 a 17 el titular lo registra; los demás leen por qué no.
 */
export const FilaDeMenor = ({
  menor,
  esTitular,
  alEditar,
  alDarDeBaja,
  alPedirCodigo,
}: {
  readonly menor: MenorDelHogar;
  readonly esTitular: boolean;
  readonly alEditar: (m: MenorDelHogar) => void;
  readonly alDarDeBaja: (m: MenorDelHogar) => void;
  readonly alPedirCodigo: (m: MenorDelHogar) => void;
}): JSX.Element => {
  const m = menor;
  const mayor = yaEsMayor(m);
  const rostro = rostroDelMenorEnLaWeb(m, esTitular);
  const explicacionDelRostro = explicacionDelRostroDelMenor(rostro);
  return (
    <li
      aria-label={m.nombreCompleto}
      className="space-y-2 border-b border-borde-suave px-5 py-3 last:border-b-0"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutro-suave font-bold text-neutro-texto"
        >
          {m.nombreCompleto.trim() === '' ? '?' : m.nombreCompleto.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-texto">{m.nombreCompleto}</p>
          <p className="text-secundario text-texto-apagado">{detalleDeMenor(m)}</p>
        </div>
        <Distintivo tono="neutro">Sin cuenta</Distintivo>
      </div>
      {mayor ? <p className="text-secundario text-texto">{AVISO_DE_MAYORIA}</p> : null}
      {explicacionDelRostro !== null ? (
        <p className="text-secundario text-texto-apagado">{explicacionDelRostro}</p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        {rostro === 'gestionar' ? (
          <Link
            href={`/mi/rostro?menor=${m.residenteId}`}
            prefetch={false}
            className="inline-flex h-9 items-center rounded-campo border border-borde px-3 text-secundario font-medium text-texto"
          >
            {m.tieneRostro ? 'Ver su rostro' : 'Registrar rostro'}
          </Link>
        ) : null}
        {mayor && esTitular ? (
          <Boton type="button" variante="secundario" tamano="sm" onClick={() => alPedirCodigo(m)}>
            Código para su cuenta
          </Boton>
        ) : null}
        <Boton type="button" variante="fantasma" tamano="sm" onClick={() => alEditar(m)}>
          Editar
        </Boton>
        <Boton type="button" variante="fantasma" tamano="sm" onClick={() => alDarDeBaja(m)}>
          Dar de baja
        </Boton>
      </div>
    </li>
  );
};
