'use client';

import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { LineaDeTiempo, Rol } from '@ncr/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { TablaDeDatos } from '@/componentes/tabla-datos';
import { Boton } from '@/componentes/ui/boton';
import { EstadoCargando, estadoSegunCodigo } from '@/componentes/estados';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { useAlertasAbiertas, useNombresDeEquipos } from '@/lib/api/consultas';
import { fechaYHora } from '@/lib/fechas';
import { horaEnZona } from '@/lib/hora-en-zona';
import { abrirCanal } from '@/lib/sse/canal';
import type { EstadoDelCanal } from '@/lib/sse/canal';
import { AlertasAbiertas } from './alertas-abiertas';
import { BarraDeFiltros } from './barra-de-filtros';
import { columnasDeEventos } from './columnas';
import type { FiltrosDeEventos } from './filtros';
import {
  SIN_FILTROS,
  filtrosDeAcceso,
  filtrosDeLaUrl,
  rangoDeLaVista,
  urlDeExportacion,
  urlDeFiltros,
} from './filtros';
import { useOperadoresVistos } from './operadores-vistos';
import { useVistaDelPortero } from './vista-del-portero';

/** Quién lee el padrón (viviendas y personas) en la API. */
const ROLES_CON_PADRON: readonly Rol[] = ['administrador', 'superadministrador'];

/**
 * Eventos y alertas · ETAPA 15-L (Bloque B) · buscador y vistas D-145.
 *
 * **Una sola línea de tiempo**, filtrable por fecha y hora de Bogotá, tipo,
 * equipo, vivienda, persona, zona, resultado, motivo, placa, operador, método
 * e identificación. Los filtros viven en la URL: un enlace reproduce la
 * búsqueda. Se refresca sola cuando el canal en vivo trae algo nuevo.
 *
 * **Se conservan todos los eventos** (RN-03, CA-23, ADR-05). Al portero se le
 * limpia la VISTA: su día y, si pulsó «Limpiar», desde ese instante. La
 * administración, la superadministración y la central lo ven todo, sin corte.
 *
 * **El banner de alertas críticas va arriba y no se puede descartar** (CA-18).
 * Ni el corte del portero ni «Limpiar» lo tocan: una alerta abierta sigue
 * abierta hasta que alguien la atiende.
 *
 * **La exportación es de ACCESOS** (HU-32), con el mismo rango y filtros.
 */
export const PantallaDeEventos = ({
  copropiedadId,
  rol,
  parametros = '',
}: {
  readonly copropiedadId: string;
  readonly rol: Rol;
  /** La consulta de la URL con la que se abrió la página. */
  readonly parametros?: string;
}): JSX.Element => {
  const conPadron = ROLES_CON_PADRON.includes(rol);
  // Un enlace con vivienda o persona, abierto por quien no lee el padrón, no
  // deja un filtro activo que no puede ver ni quitar.
  const [filtros, setFiltros] = useState<FiltrosDeEventos>(() => {
    const f = filtrosDeLaUrl(parametros);
    return conPadron ? f : { ...f, viviendaId: '', personaId: '' };
  });
  const [enVivo, setEnVivo] = useState<EstadoDelCanal>('conectando');
  const vista = useVistaDelPortero(copropiedadId, rol);
  const clientes = useQueryClient();

  // Los filtros, a la URL: sin recargar y sin apilar una entrada por tecla.
  useEffect(() => {
    window.history.replaceState(null, '', `${window.location.pathname}${urlDeFiltros(filtros)}`);
  }, [filtros]);

  const rango = rangoDeLaVista(filtros, vista, vista.ahora);
  const desde = rango.desde.toISOString();
  const hasta = rango.hasta.toISOString();
  const deAcceso = filtrosDeAcceso(filtros);
  const { tipo, dispositivoId } = filtros;

  const consulta = useQuery<LineaDeTiempo>({
    queryKey: ['linea-de-tiempo', copropiedadId, desde, hasta, tipo, dispositivoId, deAcceso],
    // Al cambiar un filtro se conserva lo anterior hasta que llegue lo nuevo: si
    // no, la tabla vuelve a «cargando», desmonta la barra de filtros y quien
    // escribía una placa pierde el foco a media palabra.
    placeholderData: (previa) => previa,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/eventos/linea-de-tiempo', {
          params: {
            path: { id: copropiedadId },
            query: {
              desde,
              hasta,
              limite: 200,
              ...(tipo === '' ? {} : { tipo }),
              ...(dispositivoId === '' ? {} : { dispositivoId }),
              ...deAcceso,
            },
          },
        }),
      ),
  });

  // B2 · el canal en vivo: cualquier acceso o evento de equipo nuevo vuelve a
  // pedir la línea (con sus filtros).
  useEffect(() => {
    if (typeof EventSource === 'undefined') return undefined;
    const refrescar = (): void =>
      void clientes.invalidateQueries({ queryKey: ['linea-de-tiempo', copropiedadId] });
    return abrirCanal({
      copropiedadId,
      mensajes: {
        evento: refrescar,
        eventoDeEquipo: refrescar,
        alerta: () => undefined,
        recuperados: refrescar,
        estado: (estado) => setEnVivo(estado),
      },
    });
  }, [clientes, copropiedadId]);

  // DT-15L-02 · sólo los nombres de los equipos: la lista completa es de administración.
  const equipos = useNombresDeEquipos(copropiedadId);
  const listaDeEquipos = useMemo(
    () => (equipos.data ?? []).map((e) => ({ id: e.id, nombre: e.nombre })),
    [equipos.data],
  );
  const nombres = useMemo(
    () => new Map(listaDeEquipos.map((e) => [e.id, e.nombre] as const)),
    [listaDeEquipos],
  );
  const nombreDe = (id: string): string => nombres.get(id) ?? 'Equipo sin nombre';
  const operadores = useOperadoresVistos(consulta.data?.elementos);

  const alertas = useAlertasAbiertas(copropiedadId);
  const criticas = (alertas.data ?? []).filter(
    (a) => a.severidad === 'critica' || a.severidad === 'alta',
  );

  // Navegación directa y no `fetch`: la descarga la gestiona el navegador con
  // la cabecera `Content-Disposition` que envía la API.
  const exportar = (formato: 'csv' | 'excel' | 'pdf'): void =>
    window.location.assign(urlDeExportacion(copropiedadId, rango, filtros, formato));

  if (consulta.isError) {
    const e = consulta.error;
    return estadoSegunCodigo(
      e instanceof ErrorDeApi ? e : 0,
      e instanceof Error ? e.message : 'Error inesperado',
      () => void consulta.refetch(),
    );
  }

  return (
    <>
      <EncabezadoDePantalla
        titulo="Eventos y alertas"
        descripcion="Todo lo que pasa en los equipos, en una sola línea de tiempo. Ningún evento se modifica ni se borra: lo impide la base de datos."
        acciones={
          <>
            <span className="text-secundario text-texto-apagado" aria-live="polite">
              {enVivo === 'conectado'
                ? 'En vivo'
                : enVivo === 'sin-conexion'
                  ? 'Sin conexión en vivo'
                  : 'Conectando…'}
            </span>
            {vista.delPortero ? (
              <Boton variante="secundario" onClick={vista.limpiar}>
                Limpiar
              </Boton>
            ) : null}
            <Boton variante="secundario" onClick={() => exportar('csv')}>
              Accesos en CSV
            </Boton>
            <Boton variante="secundario" onClick={() => exportar('excel')}>
              Excel
            </Boton>
            <Boton variante="secundario" onClick={() => exportar('pdf')}>
              PDF
            </Boton>
          </>
        }
      />

      {vista.delPortero ? (
        <p role="note" className="mb-3 text-secundario text-texto-apagado">
          Hoy, desde las {horaEnZona(rango.desde)}. Sólo limpia esta vista. El historial completo lo
          conserva la administración.
        </p>
      ) : null}

      {criticas.length > 0 ? (
        <div
          role="alert"
          className="mb-4 rounded-tarjeta border border-peligro bg-peligro-suave px-4 py-3"
        >
          <p className="text-cuerpo font-semibold text-peligro-texto">
            {criticas.length} alerta{criticas.length === 1 ? '' : 's'} sin resolver
          </p>
          <ul className="mt-1 space-y-0.5">
            {criticas.slice(0, 4).map((a) => (
              <li key={a.id} className="text-secundario text-peligro-texto">
                {a.tipo.replace(/_/g, ' ')} ·{' '}
                {a.dispositivoId === null ? '' : `${nombreDe(a.dispositivoId)} · `}
                {fechaYHora(a.generadaEn)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* E5 / C7 (15-M) · la cola entera, filtrable, con archivo lógico y motivo. */}
      <AlertasAbiertas copropiedadId={copropiedadId} nombreDe={nombreDe} equipos={listaDeEquipos} />

      {consulta.isLoading ? <EstadoCargando etiqueta="Cargando eventos" /> : null}

      <TablaDeDatos
        titulo="Línea de tiempo"
        columnas={columnasDeEventos(nombreDe)}
        filas={consulta.data?.elementos ?? []}
        claveDeFila={(e) => `${e.origen}-${e.id}`}
        cargando={consulta.isLoading}
        porPagina={25}
        filtros={
          <BarraDeFiltros
            copropiedadId={copropiedadId}
            filtros={filtros}
            cambiar={(parcial) => setFiltros((f) => ({ ...f, ...parcial }))}
            borrar={() => setFiltros(SIN_FILTROS)}
            delPortero={vista.delPortero}
            conPadron={conPadron}
            rangoAjustado={rango.ajustado}
            equipos={listaDeEquipos}
            operadores={operadores}
          />
        }
        vacio={
          vista.delPortero
            ? {
                titulo: 'Nada todavía',
                descripcion:
                  'No ha pasado nada desde el inicio del día o desde que limpió la vista. Lo nuevo aparece aquí solo.',
              }
            : {
                titulo: 'Sin eventos en el rango',
                descripcion:
                  'Nada coincide con estos filtros. Amplíe el rango de fechas o pulse «Borrar filtros».',
              }
        }
      />
    </>
  );
};
