'use client';

import type { JSX } from 'react';
import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Boton } from './ui/boton';
import { Campo } from './ui/campo';
import { EstadoCargando, EstadoVacio } from './estados';

/**
 * Tabla de datos con buscador, filtros y paginación — §5.5 del catálogo.
 *
 * Es genérica en la fila y **no** conoce ningún dominio: la 09-B monta sobre
 * ella viviendas, vehículos y visitantes sin tocarla. Lo que sí impone son tres
 * cosas que se repetirían mal en cada pantalla:
 *
 *  - **Semántica real de tabla** (`<table>`, `<th scope="col">`, `<caption>`).
 *    Una rejilla de `div` se ve igual y es ilegible con lector de pantalla: sin
 *    encabezados asociados, cada celda se anuncia sin decir de qué columna es.
 *  - **El estado vacío distingue «no hay datos» de «el filtro no encuentra
 *    nada»**. Son dos situaciones distintas y la salida también: en la primera
 *    hay que crear algo; en la segunda, borrar el filtro.
 *  - **Paginación anunciada** con `aria-live`, para que quien no ve la tabla
 *    sepa que cambió de página.
 */

export interface Columna<T> {
  readonly clave: string;
  readonly titulo: string;
  readonly celda: (fila: T) => ReactNode;
  /** Texto plano para el buscador; sin él, la columna no se busca. */
  readonly texto?: (fila: T) => string;
  readonly alineacion?: 'izquierda' | 'derecha';
  readonly className?: string;
}

export interface PropiedadesDeTabla<T> {
  readonly titulo: string;
  readonly columnas: readonly Columna<T>[];
  readonly filas: readonly T[];
  readonly claveDeFila: (fila: T) => string;
  readonly cargando?: boolean;
  readonly vacio?: {
    readonly titulo: string;
    readonly descripcion: string;
    readonly accion?: ReactNode;
  };
  readonly porPagina?: number;
  readonly buscador?: { readonly marcador: string } | undefined;
  readonly filtros?: ReactNode;
  readonly alPulsarFila?: ((fila: T) => void) | undefined;
}

export const TablaDeDatos = <T,>({
  titulo,
  columnas,
  filas,
  claveDeFila,
  cargando = false,
  vacio,
  porPagina = 10,
  buscador,
  filtros,
  alPulsarFila,
}: PropiedadesDeTabla<T>): JSX.Element => {
  const [consulta, setConsulta] = useState('');
  const [pagina, setPagina] = useState(0);
  const idResumen = useId();

  const filtradas = useMemo(() => {
    const termino = consulta.trim().toLocaleLowerCase('es');
    if (termino === '') return filas;
    return filas.filter((fila) =>
      columnas.some((c) => c.texto?.(fila).toLocaleLowerCase('es').includes(termino) === true),
    );
  }, [filas, columnas, consulta]);

  const paginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
  // La página se acota al renderizar en vez de guardarse corregida: si el
  // filtro reduce el conjunto, la página actual puede quedar fuera de rango y
  // la tabla se vería vacía teniendo datos.
  const paginaActual = Math.min(pagina, paginas - 1);
  const visibles = filtradas.slice(paginaActual * porPagina, paginaActual * porPagina + porPagina);

  if (cargando) return <EstadoCargando etiqueta={`Cargando ${titulo.toLocaleLowerCase('es')}`} />;

  return (
    <div>
      {buscador !== undefined || filtros !== undefined ? (
        <div className="flex flex-wrap items-end gap-3 px-5 pb-4">
          {buscador !== undefined ? (
            <div className="min-w-[16rem] flex-1">
              <Campo
                etiqueta="Buscar"
                type="search"
                placeholder={buscador.marcador}
                value={consulta}
                onChange={(e) => {
                  setConsulta(e.target.value);
                  setPagina(0);
                }}
              />
            </div>
          ) : null}
          {filtros}
        </div>
      ) : null}

      {filtradas.length === 0 ? (
        consulta.trim() === '' ? (
          <EstadoVacio
            titulo={vacio?.titulo ?? 'Todavía no hay datos'}
            descripcion={vacio?.descripcion ?? 'Cuando existan registros, aparecerán aquí.'}
            {...(vacio?.accion === undefined ? {} : { accion: vacio.accion })}
          />
        ) : (
          <EstadoVacio
            titulo="Sin resultados"
            descripcion={`Ningún registro coincide con «${consulta.trim()}».`}
            accion={
              <Boton variante="secundario" tamano="sm" onClick={() => setConsulta('')}>
                Quitar el filtro
              </Boton>
            }
          />
        )
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-cuerpo">
              <caption className="sr-only">{titulo}</caption>
              <thead>
                <tr className="border-y border-borde bg-lienzo">
                  {columnas.map((c) => (
                    <th
                      key={c.clave}
                      scope="col"
                      className={cn(
                        'whitespace-nowrap px-5 py-2.5 text-etiqueta uppercase text-texto-apagado',
                        c.alineacion === 'derecha' ? 'text-right' : 'text-left',
                      )}
                    >
                      {c.titulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map((fila) => (
                  <tr
                    key={claveDeFila(fila)}
                    className={cn(
                      'h-fila border-b border-borde-suave last:border-b-0',
                      alPulsarFila !== undefined && 'cursor-pointer hover:bg-lienzo',
                    )}
                    {...(alPulsarFila === undefined
                      ? {}
                      : {
                          onClick: () => alPulsarFila(fila),
                          tabIndex: 0,
                          role: 'button',
                          onKeyDown: (e) => {
                            // Enter y espacio: una fila pulsable con el ratón
                            // que no responde al teclado no es accesible.
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              alPulsarFila(fila);
                            }
                          },
                        })}
                  >
                    {columnas.map((c) => (
                      <td
                        key={c.clave}
                        className={cn(
                          'px-5 py-2.5 align-middle',
                          c.alineacion === 'derecha' ? 'text-right' : 'text-left',
                          c.className,
                        )}
                      >
                        {c.celda(fila)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {paginas > 1 ? (
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              <p id={idResumen} aria-live="polite" className="text-secundario text-texto-apagado">
                Página {paginaActual + 1} de {paginas} · {filtradas.length} registros
              </p>
              <div className="flex gap-2">
                <Boton
                  variante="secundario"
                  tamano="sm"
                  disabled={paginaActual === 0}
                  onClick={() => setPagina(paginaActual - 1)}
                  aria-describedby={idResumen}
                >
                  Anterior
                </Boton>
                <Boton
                  variante="secundario"
                  tamano="sm"
                  disabled={paginaActual >= paginas - 1}
                  onClick={() => setPagina(paginaActual + 1)}
                  aria-describedby={idResumen}
                >
                  Siguiente
                </Boton>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};
