'use client';

import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import { BuscadorDePersonas } from '@/componentes/buscador-personas';
import type { PersonaElegida } from '@/componentes/buscador-personas';
import { Boton } from '@/componentes/ui/boton';
import { useViviendas, useZonas } from '@/lib/api/consultas';
import { TEXTO_MOTIVO } from '@/lib/motivos';
import type { FiltrosDeEventos } from './filtros';
import { METODOS, hayFiltros, placaParaBuscar } from './filtros';
import { TIPOS_DE_LA_LINEA } from './tipos-de-evento';

/**
 * D-145 · la barra de filtros del buscador de eventos.
 *
 * Cada control cambia UN campo de los filtros; la pantalla los lleva a la URL
 * y a la consulta. Nadie escribe un identificador (D-72): vivienda, zona,
 * equipo y operador se eligen por nombre, y la persona con el buscador del
 * padrón —aquí SIN alta: filtrar no es registrar a nadie—.
 *
 * El operador se elige entre los que aparecen en lo consultado: la consola no
 * tiene un listado de usuarios para la portería, y un operador que no abrió
 * nada en el rango no tiene nada que filtrar.
 */
const CLASE_CAMPO = 'rounded-campo border border-borde bg-campo px-2 py-1.5 text-cuerpo';

const Seleccion = ({
  etiqueta,
  valor,
  alCambiar,
  todos = 'Todos',
  children,
}: {
  readonly etiqueta: string;
  readonly valor: string;
  readonly alCambiar: (v: string) => void;
  readonly todos?: string;
  readonly children: ReactNode;
}): JSX.Element => (
  <label className="flex items-center gap-2 text-secundario">
    <span className="text-texto-apagado">{etiqueta}</span>
    <select value={valor} onChange={(e) => alCambiar(e.target.value)} className={CLASE_CAMPO}>
      <option value="">{todos}</option>
      {children}
    </select>
  </label>
);

export interface PropiedadesDeBarra {
  readonly copropiedadId: string;
  readonly filtros: FiltrosDeEventos;
  readonly cambiar: (parcial: Partial<FiltrosDeEventos>) => void;
  readonly borrar: () => void;
  /** Al portero no se le ofrecen fechas: ve su día (D-145). */
  readonly delPortero: boolean;
  /**
   * Vivienda y persona salen del padrón, que sólo lee la administración
   * (`padron/viviendas` y `padron/personas`): al portero y a la central se les
   * negaría con 403. Sin padrón no se ofrecen; los demás filtros, sí.
   */
  readonly conPadron: boolean;
  readonly rangoAjustado: boolean;
  readonly equipos: readonly { readonly id: string; readonly nombre: string }[];
  readonly operadores: readonly { readonly id: string; readonly nombre: string }[];
}

export const BarraDeFiltros = ({
  copropiedadId,
  filtros: f,
  cambiar,
  borrar,
  delPortero,
  conPadron,
  rangoAjustado,
  equipos,
  operadores,
}: PropiedadesDeBarra): JSX.Element => {
  const viviendas = useViviendas(copropiedadId, { estado: '', busqueda: '' }, conPadron);
  const zonas = useZonas(copropiedadId);
  // El nombre de la persona elegida sólo se conoce si se eligió aquí; si vino
  // en el enlace, la URL lleva el identificador y nada más (no datos personales).
  const [nombrePersona, setNombrePersona] = useState<PersonaElegida | null>(null);
  const elegida: PersonaElegida | null =
    f.personaId === ''
      ? null
      : nombrePersona?.id === f.personaId
        ? nombrePersona
        : { id: f.personaId, nombreCompleto: 'Persona del enlace', documento: '' };
  const placaIncompleta = f.placa.trim() !== '' && placaParaBuscar(f.placa) === null;

  return (
    <>
      {delPortero ? null : (
        <>
          {(['desde', 'hasta'] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 text-secundario">
              <span className="text-texto-apagado">{k === 'desde' ? 'Desde' : 'Hasta'}</span>
              <input
                type="datetime-local"
                value={f[k]}
                onChange={(e) => cambiar({ [k]: e.target.value })}
                className={CLASE_CAMPO}
              />
            </label>
          ))}
          {rangoAjustado ? (
            <span role="status" className="text-secundario text-aviso-texto">
              Fechas incompletas o al revés: se muestran los últimos 7 días.
            </span>
          ) : null}
        </>
      )}
      <Seleccion etiqueta="Tipo" valor={f.tipo} alCambiar={(tipo) => cambiar({ tipo })}>
        {TIPOS_DE_LA_LINEA.map((t) => (
          <option key={t.valor} value={t.valor}>
            {t.nombre}
          </option>
        ))}
      </Seleccion>
      <Seleccion
        etiqueta="Equipo"
        valor={f.dispositivoId}
        alCambiar={(dispositivoId) => cambiar({ dispositivoId })}
      >
        {equipos.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nombre}
          </option>
        ))}
      </Seleccion>
      {conPadron ? (
        <Seleccion
          etiqueta="Vivienda"
          valor={f.viviendaId}
          alCambiar={(viviendaId) => cambiar({ viviendaId })}
          todos="Todas"
        >
          {(viviendas.data?.viviendas ?? []).map((v) => (
            <option key={v.id} value={v.id}>
              {v.identificador}
            </option>
          ))}
        </Seleccion>
      ) : null}
      <Seleccion
        etiqueta="Zona"
        valor={f.zonaId}
        alCambiar={(zonaId) => cambiar({ zonaId })}
        todos="Todas"
      >
        {(zonas.data ?? []).map((z) => (
          <option key={z.id} value={z.id}>
            {z.nombre}
          </option>
        ))}
      </Seleccion>
      <Seleccion
        etiqueta="Resultado"
        valor={f.resultado}
        alCambiar={(v) => cambiar({ resultado: v as FiltrosDeEventos['resultado'] })}
      >
        <option value="permitido">Permitido</option>
        <option value="negado">Negado</option>
      </Seleccion>
      <Seleccion
        etiqueta="Motivo"
        valor={f.motivo}
        alCambiar={(v) => cambiar({ motivo: v as FiltrosDeEventos['motivo'] })}
      >
        {Object.entries(TEXTO_MOTIVO).map(([valor, texto]) => (
          <option key={valor} value={valor}>
            {texto}
          </option>
        ))}
      </Seleccion>
      <Seleccion
        etiqueta="Método"
        valor={f.metodo}
        alCambiar={(v) => cambiar({ metodo: v as FiltrosDeEventos['metodo'] })}
      >
        {METODOS.map((m) => (
          <option key={m.valor} value={m.valor}>
            {m.nombre}
          </option>
        ))}
      </Seleccion>
      <Seleccion
        etiqueta="Identificación"
        valor={f.identificacion}
        alCambiar={(v) => cambiar({ identificacion: v as FiltrosDeEventos['identificacion'] })}
        todos="Todas"
      >
        <option value="conocida">Conocida</option>
        <option value="desconocida">Desconocida</option>
      </Seleccion>
      <Seleccion
        etiqueta="Operador"
        valor={f.operadorId}
        alCambiar={(operadorId) => cambiar({ operadorId })}
      >
        {operadores.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
      </Seleccion>
      <label className="flex items-center gap-2 text-secundario">
        <span className="text-texto-apagado">Placa</span>
        <input
          type="search"
          value={f.placa}
          maxLength={16}
          placeholder="ABC123"
          aria-invalid={placaIncompleta}
          onChange={(e) => cambiar({ placa: e.target.value })}
          className={`${CLASE_CAMPO} w-28 font-mono uppercase`}
        />
      </label>
      {placaIncompleta ? (
        <span role="status" className="text-secundario text-aviso-texto">
          Escriba la placa completa (5 a 8 letras o números) para buscarla.
        </span>
      ) : null}
      {conPadron ? (
        <div className="w-full max-w-sm">
          <BuscadorDePersonas
            copropiedadId={copropiedadId}
            etiqueta="Persona"
            ayuda="Residente o visitante, por nombre o documento."
            permitirAlta={false}
            elegida={elegida}
            alElegir={(p) => {
              setNombrePersona(p);
              cambiar({ personaId: p?.id ?? '' });
            }}
          />
        </div>
      ) : null}
      <Boton variante="secundario" onClick={borrar} disabled={!hayFiltros(f)}>
        Borrar filtros
      </Boton>
    </>
  );
};
