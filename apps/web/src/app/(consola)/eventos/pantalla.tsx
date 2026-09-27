'use client';

import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { ElementoDeLineaDeTiempo, LineaDeTiempo } from '@ncr/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { TablaDeDatos } from '@/componentes/tabla-datos';
import type { Columna } from '@/componentes/tabla-datos';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import type { TonoDeDistintivo } from '@/componentes/ui/distintivo';
import { EstadoCargando, estadoSegunCodigo } from '@/componentes/estados';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { useAlertasAbiertas, useEquipos } from '@/lib/api/consultas';
import { abrirCanal } from '@/lib/sse/canal';
import type { EstadoDelCanal } from '@/lib/sse/canal';
import { ORIGEN, TIPOS_DE_LA_LINEA } from './tipos-de-evento';

const haceDias = (dias: number): string =>
  new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);

/** El color acompaña al texto, nunca lo sustituye (el distintivo lleva icono). */
const tonoDe = (e: ElementoDeLineaDeTiempo): TonoDeDistintivo => {
  if (!e.enVivo) return 'neutro';
  if (e.origen === 'acceso') return e.resultado === 'permitido' ? 'exito' : 'peligro';
  if (/forzada|sabotaje|coaccion|fuera_de_linea|la_camara_decidio|lista_negra/.test(e.tipo)) {
    return 'peligro';
  }
  if (e.origen === 'plataforma') return 'marca';
  return 'aviso';
};

/**
 * Eventos y alertas · ETAPA 15-L (Bloque B).
 *
 * **Una sola línea de tiempo.** Arriba, lo último que pasó en cualquier equipo:
 * el acceso que decidió el motor, la puerta que se abrió o se forzó, el botón
 * de salida, el timbre, la llamada, el sabotaje, el equipo que se cayó, la
 * apertura que ordenó un portero con lo que contestó el equipo, y lo que nadie
 * catalogó. Se refresca sola cuando el canal en vivo trae algo nuevo.
 *
 * **El banner de alertas críticas va arriba y no se puede descartar.** Una
 * alerta sin resolver que se cierra con una «x» deja de verse y sigue sin
 * resolverse; aquí desaparece cuando alguien la atiende (CA-18).
 *
 * **La exportación es de ACCESOS** (HU-32): es un fichero binario que el
 * navegador descarga con su nombre, no pasa por el cliente tipado.
 */
export const PantallaDeEventos = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const [desde, setDesde] = useState(haceDias(7));
  const [hasta, setHasta] = useState(haceDias(0));
  const [tipo, setTipo] = useState('');
  const [dispositivoId, setDispositivoId] = useState('');
  const [enVivo, setEnVivo] = useState<EstadoDelCanal>('conectando');
  const clientes = useQueryClient();

  const rango = useMemo(
    () => ({
      desde: new Date(`${desde}T00:00:00`).toISOString(),
      // El fin es EXCLUSIVO en el dominio, así que se pide el día siguiente:
      // pedir `hasta` a las 00:00 dejaría fuera el día que el usuario eligió.
      hasta: new Date(new Date(`${hasta}T00:00:00`).getTime() + 86_400_000).toISOString(),
    }),
    [desde, hasta],
  );

  const clave = ['linea-de-tiempo', copropiedadId, rango.desde, rango.hasta, tipo, dispositivoId];
  const consulta = useQuery<LineaDeTiempo>({
    queryKey: clave,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/eventos/linea-de-tiempo', {
          params: {
            path: { id: copropiedadId },
            query: {
              desde: rango.desde,
              hasta: rango.hasta,
              limite: 200,
              ...(tipo === '' ? {} : { tipo }),
              ...(dispositivoId === '' ? {} : { dispositivoId }),
            },
          },
        }),
      ),
  });

  // B2 · el canal en vivo que ya usa la consola: cualquier acceso o evento de
  // equipo nuevo vuelve a pedir la línea (con sus filtros).
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

  const equipos = useEquipos(copropiedadId);
  const nombres = useMemo(
    () => new Map((equipos.data?.equipos ?? []).map((e) => [e.id, e.nombre] as const)),
    [equipos.data],
  );
  const nombreDe = (id: string): string => nombres.get(id) ?? 'Equipo sin nombre';

  const alertas = useAlertasAbiertas(copropiedadId);
  const criticas = (alertas.data ?? []).filter(
    (a) => a.severidad === 'critica' || a.severidad === 'alta',
  );

  const exportar = (formato: 'csv' | 'excel' | 'pdf'): void => {
    const parametros = new URLSearchParams({
      desde: rango.desde,
      hasta: rango.hasta,
      formato,
      ...(dispositivoId === '' ? {} : { dispositivoId }),
    });
    // Navegación directa y no `fetch`: la descarga la gestiona el navegador con
    // la cabecera `Content-Disposition` que envía la API.
    window.location.assign(
      `/api/ncr/copropiedades/${copropiedadId}/eventos/exportacion?${parametros.toString()}`,
    );
  };

  if (consulta.isError) {
    const e = consulta.error;
    return estadoSegunCodigo(
      e instanceof ErrorDeApi ? e.estado : 0,
      e instanceof Error ? e.message : 'Error inesperado',
      () => void consulta.refetch(),
    );
  }

  const columnas: readonly Columna<ElementoDeLineaDeTiempo>[] = [
    {
      clave: 'momento',
      titulo: 'Fecha y hora',
      texto: (e) => e.ocurridoEn,
      celda: (e) => (
        <span className="tabular-nums text-secundario">
          {new Date(e.ocurridoEn).toLocaleString('es-CO', {
            dateStyle: 'short',
            timeStyle: 'medium',
          })}
        </span>
      ),
    },
    {
      clave: 'que',
      titulo: 'Qué pasó',
      texto: (e) => e.titulo,
      celda: (e) => <Distintivo tono={tonoDe(e)}>{e.titulo}</Distintivo>,
    },
    {
      clave: 'equipo',
      titulo: 'Equipo',
      texto: (e) => nombreDe(e.dispositivoId),
      celda: (e) => <span className="text-secundario text-texto">{nombreDe(e.dispositivoId)}</span>,
    },
    {
      clave: 'origen',
      titulo: 'Origen',
      texto: (e) => ORIGEN[e.origen],
      celda: (e) => (
        <span className="text-secundario text-texto-apagado">
          {ORIGEN[e.origen]}
          {e.enVivo ? '' : ' · histórico del equipo'}
        </span>
      ),
    },
  ];

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
                {a.tipo} · {new Date(a.generadaEn).toLocaleString('es-CO')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {consulta.isLoading ? <EstadoCargando etiqueta="Cargando eventos" /> : null}

      <TablaDeDatos
        titulo="Línea de tiempo"
        columnas={columnas}
        filas={consulta.data?.elementos ?? []}
        claveDeFila={(e) => `${e.origen}-${e.id}`}
        cargando={consulta.isLoading}
        porPagina={25}
        filtros={
          <>
            <label className="flex items-center gap-2 text-secundario">
              <span className="text-texto-apagado">Desde</span>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="rounded-campo border border-borde bg-campo px-2 py-1.5 text-cuerpo"
              />
            </label>
            <label className="flex items-center gap-2 text-secundario">
              <span className="text-texto-apagado">Hasta</span>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="rounded-campo border border-borde bg-campo px-2 py-1.5 text-cuerpo"
              />
            </label>
            <label className="flex items-center gap-2 text-secundario">
              <span className="text-texto-apagado">Tipo</span>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="rounded-campo border border-borde bg-campo px-2 py-1.5 text-cuerpo"
              >
                <option value="">Todos</option>
                {TIPOS_DE_LA_LINEA.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-secundario">
              <span className="text-texto-apagado">Equipo</span>
              <select
                value={dispositivoId}
                onChange={(e) => setDispositivoId(e.target.value)}
                aria-label="Filtrar por equipo"
                className="rounded-campo border border-borde bg-campo px-2 py-1.5 text-cuerpo"
              >
                <option value="">Todos</option>
                {(equipos.data?.equipos ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
        vacio={{
          titulo: 'Sin eventos en el rango',
          descripcion:
            'Ningún equipo reportó nada con estos filtros. Amplía el rango de fechas o quita el filtro de tipo o de equipo.',
        }}
      />
    </>
  );
};
