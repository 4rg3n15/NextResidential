'use client';

import type { JSX } from 'react';
import { useEffect, useId, useState } from 'react';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { mensajeDeFallo } from '@/lib/api/cliente';
import { useViviendasSinTitular } from './consultas';
import type { ViviendaSinTitular } from './consultas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ELEGIR UNA VIVIENDA SIN TITULAR · RONDA 15-W
 *
 * El alta de un titular y la vivienda de una cuenta antigua exigen una vivienda
 * ACTIVA que todavía no tenga titular. Nadie teclea su identificador: se busca
 * por número o agrupación —la búsqueda la hace el SERVIDOR, que devuelve 50
 * como mucho— y se elige de la lista que él devuelve.
 *
 * Un `<select>` nativo y no un combo hecho a mano: con 50 opciones como mucho,
 * el desplegable del navegador ya trae teclado, foco y anuncio por lector de
 * pantalla, y no hay nada que reinventar.
 *
 * La vivienda elegida SE CONSERVA entre las opciones aunque una búsqueda
 * posterior no la traiga. Si desapareciera, el desplegable enseñaría «Elige una
 * vivienda» mientras el formulario seguiría enviando la anterior: lo que se ve
 * y lo que viaja dejarían de ser lo mismo.
 *
 * El componente se monta sólo con el diálogo abierto: al cerrarlo se desmonta,
 * y como su consulta no guarda caché, cada apertura pregunta de nuevo quién
 * está libre.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** Espera antes de preguntar: escribir «Torre 3» no son siete peticiones. */
const ESPERA_MS = 250;
/** El tope de filas de la API: con 50, quizá falten viviendas y hay que afinar. */
const TOPE_DE_LA_API = 50;

/** «B · 42», o «42» sin agrupación: el formato con que la API nombra la vivienda de una cuenta. */
export const etiquetaDeVivienda = (
  v: Pick<ViviendaSinTitular, 'identificador' | 'agrupacion'>,
): string =>
  v.agrupacion === null || v.agrupacion.trim() === ''
    ? v.identificador
    : `${v.agrupacion.trim()} · ${v.identificador}`;

const estadoDeLaLista = (cuantas: number, busqueda: string): string => {
  if (cuantas === 0) {
    return busqueda === ''
      ? 'No queda ninguna vivienda activa sin titular: en las demás, el hogar entra con un código de plaza.'
      : `Ninguna vivienda sin titular coincide con «${busqueda}».`;
  }
  if (cuantas >= TOPE_DE_LA_API) {
    return `Se muestran las primeras ${String(TOPE_DE_LA_API)}: si no está la que buscas, afina la búsqueda.`;
  }
  return cuantas === 1 ? '1 vivienda sin titular.' : `${String(cuantas)} viviendas sin titular.`;
};

export const SelectorDeViviendaSinTitular = ({
  copropiedadId,
  elegida,
  alElegir,
}: {
  readonly copropiedadId: string;
  readonly elegida: ViviendaSinTitular | null;
  readonly alElegir: (vivienda: ViviendaSinTitular | null) => void;
}): JSX.Element => {
  const id = useId();
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    const espera = setTimeout(() => setBusqueda(texto.trim()), ESPERA_MS);
    return () => clearTimeout(espera);
  }, [texto]);

  const consulta = useViviendasSinTitular(copropiedadId, busqueda);
  const encontradas = consulta.data ?? [];
  const opciones =
    elegida === null || encontradas.some((v) => v.id === elegida.id)
      ? encontradas
      : [elegida, ...encontradas];

  return (
    <div className="space-y-3">
      <Campo
        etiqueta="Buscar vivienda"
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Número o agrupación"
        maxLength={60}
        autoComplete="off"
      />
      <div className="space-y-1.5">
        <label htmlFor={id} className="block text-secundario font-medium text-texto">
          Vivienda sin titular
        </label>
        <select
          id={id}
          name="viviendaId"
          required
          value={elegida?.id ?? ''}
          onChange={(e) => alElegir(opciones.find((v) => v.id === e.target.value) ?? null)}
          aria-describedby={`${id}-estado`}
          className="h-11 w-full rounded-campo border border-borde bg-campo px-3 text-cuerpo text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
        >
          <option value="">Elige una vivienda</option>
          {opciones.map((v) => (
            <option key={v.id} value={v.id}>
              {etiquetaDeVivienda(v)}
            </option>
          ))}
        </select>
        {consulta.isError ? (
          <div
            id={`${id}-estado`}
            role="alert"
            className="flex flex-wrap items-center gap-2 text-secundario text-peligro-texto"
          >
            <span>No se pudieron consultar las viviendas. {mensajeDeFallo(consulta.error)}</span>
            <Boton
              type="button"
              variante="secundario"
              tamano="sm"
              onClick={() => void consulta.refetch()}
            >
              Reintentar
            </Boton>
          </div>
        ) : (
          <p id={`${id}-estado`} role="status" className="text-secundario text-texto-apagado">
            {/* Con la lista anterior en pantalla mientras llega la nueva, contarla
                con el término nuevo sería describir resultados que no son. */}
            {consulta.isPending || consulta.isPlaceholderData
              ? 'Buscando viviendas sin titular…'
              : estadoDeLaLista(encontradas.length, busqueda)}
          </p>
        )}
      </div>
    </div>
  );
};
