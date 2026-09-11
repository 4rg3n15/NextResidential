'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useVehiculos, useViviendas } from '@/lib/api/consultas';
import { cn } from '@/lib/cn';

/**
 * Buscador global de la cabecera — «Buscar casa, placa o residente».
 *
 * Hasta la 09-B estaba **deshabilitado con el texto «disponible en la ETAPA
 * 09-B»**, porque las pantallas que busca no existían. Ya existen.
 *
 * **Busca sobre lo que ya está cargado, no contra un endpoint nuevo.** La API
 * no tiene búsqueda transversal y ninguna HU la pide; inventar
 * `GET /busqueda` habría añadido superficie de servidor —y una barrera de
 * aislamiento más que vigilar— para un atajo de navegación. Las dos consultas
 * que usa son las mismas que alimentan Viviendas y Vehículos, así que React
 * Query las comparte por clave: abrir el buscador tras haber visitado una de
 * esas pantallas no dispara ninguna petición.
 *
 * Su función es **llevarte a la pantalla**, no sustituirla. Por eso cada
 * resultado navega al filtro correspondiente en vez de abrir un detalle aquí.
 */
const MAXIMO_POR_GRUPO = 4;

interface Resultado {
  readonly clave: string;
  readonly titulo: string;
  readonly contexto: string;
  readonly grupo: 'Viviendas' | 'Vehículos';
  readonly destino: string;
}

const normalizar = (texto: string): string =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const BuscadorGlobal = ({
  copropiedadId,
}: {
  readonly copropiedadId: string | null;
}): React.JSX.Element => {
  const router = useRouter();
  const idListado = useId();
  const [consulta, setConsulta] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);

  /**
   * Solo se consulta cuando hay al menos dos caracteres. Con uno, cualquier
   * término casa con medio padrón y la lista deja de orientar.
   */
  const activo = consulta.trim().length >= 2 && copropiedadId !== null;
  /**
   * Las consultas **no salen hasta que hay algo que buscar**. Es la corrección
   * de un defecto propio: sin la puerta, el buscador —que vive en la cabecera
   * de todas las pantallas— disparaba dos peticiones en cada carga de la
   * consola, y con la copropiedad todavía sin resolver la URL salía mal
   * formada. Se veía en el recorrido del navegador como una petición fallida
   * en cada página, sin que ninguna pantalla se rompiera: exactamente el tipo
   * de fallo que no rompe nada y está mal.
   */
  const viviendas = useViviendas(copropiedadId ?? '', { estado: '', busqueda: '' }, activo);
  const vehiculos = useVehiculos(copropiedadId ?? '', activo);

  const resultados = useMemo<readonly Resultado[]>(() => {
    if (!activo) return [];
    const aguja = normalizar(consulta.trim());

    const deViviendas: Resultado[] = (viviendas.data?.viviendas ?? [])
      .filter(
        (v) =>
          normalizar(v.identificador).includes(aguja) ||
          normalizar(v.manzana ?? '').includes(aguja) ||
          normalizar(v.direccion ?? '').includes(aguja),
      )
      .slice(0, MAXIMO_POR_GRUPO)
      .map((v) => ({
        clave: `vivienda-${v.id}`,
        titulo: v.identificador,
        contexto:
          [v.manzana, v.direccion].filter(Boolean).join(' · ') ||
          `${v.residentes} residentes · ${v.vehiculos} vehículos`,
        grupo: 'Viviendas' as const,
        destino: `/viviendas?busqueda=${encodeURIComponent(v.identificador)}`,
      }));

    const dePlacas: Resultado[] = (vehiculos.data ?? [])
      .filter(
        (v) =>
          normalizar(v.placa).includes(aguja) ||
          normalizar(v.propietarioNombre ?? '').includes(aguja) ||
          normalizar(v.viviendaIdentificador).includes(aguja),
      )
      .slice(0, MAXIMO_POR_GRUPO)
      .map((v) => ({
        clave: `vehiculo-${v.id}`,
        titulo: v.placa,
        contexto:
          [[v.marca, v.modelo].filter(Boolean).join(' '), v.viviendaIdentificador]
            .filter(Boolean)
            .join(' · ') || 'Vehículo registrado',
        grupo: 'Vehículos' as const,
        destino: `/vehiculos?busqueda=${encodeURIComponent(v.placa)}`,
      }));

    return [...deViviendas, ...dePlacas];
  }, [activo, consulta, viviendas.data, vehiculos.data]);

  useEffect(() => setResaltado(0), [consulta]);

  // Cerrar al pulsar fuera. Sin esto, la lista se queda abierta tapando la
  // pantalla a la que el usuario acaba de decidir ir por otro camino.
  useEffect(() => {
    if (!abierto) return undefined;
    const alPulsar = (e: MouseEvent): void => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', alPulsar);
    return () => document.removeEventListener('mousedown', alPulsar);
  }, [abierto]);

  const ir = (destino: string): void => {
    setAbierto(false);
    setConsulta('');
    router.push(destino);
  };

  const cargando = activo && (viviendas.isLoading || vehiculos.isLoading);
  const mostrarPanel = abierto && activo;

  return (
    <div ref={contenedor} className="relative min-w-0 flex-1">
      <label htmlFor="buscador-global" className="sr-only">
        Buscar casa, placa o residente
      </label>
      <div className="relative max-w-md">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-apagado"
          strokeWidth={1.75}
        />
        <input
          id="buscador-global"
          type="search"
          role="combobox"
          aria-expanded={mostrarPanel}
          aria-controls={idListado}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={copropiedadId === null}
          placeholder="Buscar casa, placa o residente…"
          value={consulta}
          onChange={(e) => {
            setConsulta(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setAbierto(false);
              return;
            }
            if (resultados.length === 0) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setResaltado((i) => (i + 1) % resultados.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setResaltado((i) => (i - 1 + resultados.length) % resultados.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const elegido = resultados[resaltado];
              if (elegido !== undefined) ir(elegido.destino);
            }
          }}
          className="h-10 w-full rounded-campo border border-borde bg-lienzo pl-9 pr-3 text-cuerpo text-texto placeholder:text-texto-apagado focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      {mostrarPanel ? (
        <div
          className={cn(
            /**
             * `origin-top`: el panel escala DESDE su disparador, no desde su
             * propio centro. Con el origen en el centro parece que llega de
             * otro sitio; con el origen arriba, sale del campo que lo abrió,
             * que es lo que de verdad ocurrió.
             */
            'absolute left-0 top-full z-30 mt-1 w-full max-w-md origin-top overflow-hidden rounded-tarjeta border border-borde bg-tarjeta shadow-flotante',
            /**
             * Aparición de 120 ms con desplazamiento mínimo. `ease-out`, que es
             * la curva de una entrada: arranca y frena, en vez de acelerar
             * hacia el final como haría `ease-in` —el error que `animate`
             * señala como el más frecuente—. Y se anula por completo con
             * `prefers-reduced-motion`.
             */
            'motion-safe:animate-desplegar',
          )}
        >
          <ul id={idListado} role="listbox" aria-label="Resultados de la búsqueda" className="py-1">
            {cargando ? (
              <li className="px-3 py-2 text-secundario text-texto-apagado">Buscando…</li>
            ) : resultados.length === 0 ? (
              <li className="px-3 py-2 text-secundario text-texto-apagado">
                Sin resultados para «{consulta.trim()}». Busca por número de casa, placa o nombre.
              </li>
            ) : (
              resultados.map((r, indice) => {
                const primeroDeGrupo = indice === 0 || resultados[indice - 1]?.grupo !== r.grupo;
                return (
                  <li key={r.clave}>
                    {primeroDeGrupo ? (
                      <p className="px-3 pb-1 pt-2 text-etiqueta uppercase tracking-wide text-texto-apagado">
                        {r.grupo}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      role="option"
                      aria-selected={indice === resaltado}
                      onMouseEnter={() => setResaltado(indice)}
                      onClick={() => ir(r.destino)}
                      className={cn(
                        'flex w-full items-baseline gap-2 px-3 py-2 text-left transition-colors duration-100 ease-salida motion-reduce:transition-none',
                        indice === resaltado ? 'bg-lienzo' : 'bg-transparent',
                      )}
                    >
                      <span
                        className={cn(
                          'text-cuerpo text-texto',
                          r.grupo === 'Vehículos' ? 'font-mono' : 'font-medium',
                        )}
                      >
                        {r.titulo}
                      </span>
                      <span className="truncate text-secundario text-texto-apagado">
                        {r.contexto}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
};
