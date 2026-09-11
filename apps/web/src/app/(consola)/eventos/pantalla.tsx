'use client';

import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import type { EventoRegistrado, PaginaDeEventos } from '@ncr/contracts';
import { useQuery } from '@tanstack/react-query';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { TablaDeDatos } from '@/componentes/tabla-datos';
import type { Columna } from '@/componentes/tabla-datos';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import { EstadoCargando, estadoSegunCodigo } from '@/componentes/estados';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { useAlertasAbiertas } from '@/lib/api/consultas';

const TIPOS = ['ingreso', 'salida', 'manual', 'denegado', 'alerta'] as const;
type Tipo = (typeof TIPOS)[number];

const haceDias = (dias: number): string =>
  new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);

/**
 * Eventos y alertas.
 *
 * **El banner de alertas críticas va arriba y no se puede descartar.** Una
 * alerta sin resolver que se cierra con una «x» deja de verse y sigue sin
 * resolverse; aquí desaparece cuando alguien la atiende en el sistema, que es
 * lo único que la hace desaparecer de verdad (CA-18).
 *
 * **La exportación no pasa por el cliente tipado**: es un fichero binario, no
 * JSON. Se abre la URL del proxy directamente para que el navegador la
 * descargue con su nombre y su tipo. El cliente generado intentaría
 * deserializar el cuerpo, y por eso el contrato la declara como binaria.
 */
export const PantallaDeEventos = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const [desde, setDesde] = useState(haceDias(7));
  const [hasta, setHasta] = useState(haceDias(0));
  const [tipo, setTipo] = useState<'' | Tipo>('');
  const [dispositivoId, setDispositivoId] = useState('');

  const rango = useMemo(
    () => ({
      desde: new Date(`${desde}T00:00:00`).toISOString(),
      // El fin es EXCLUSIVO en el dominio, así que se pide el día siguiente:
      // pedir `hasta` a las 00:00 dejaría fuera el día que el usuario eligió.
      hasta: new Date(new Date(`${hasta}T00:00:00`).getTime() + 86_400_000).toISOString(),
    }),
    [desde, hasta],
  );

  const consulta = useQuery<PaginaDeEventos>({
    queryKey: ['eventos', copropiedadId, rango.desde, rango.hasta, tipo, dispositivoId],
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/eventos', {
          params: {
            path: { id: copropiedadId },
            query: {
              desde: rango.desde,
              hasta: rango.hasta,
              tamanoPagina: 100,
              ...(tipo === '' ? {} : { tipo }),
              ...(dispositivoId === '' ? {} : { dispositivoId }),
            },
          },
        }),
      ),
  });

  const alertas = useAlertasAbiertas(copropiedadId);
  const criticas = (alertas.data ?? []).filter(
    (a) => a.severidad === 'critica' || a.severidad === 'alta',
  );

  const exportar = (formato: 'csv' | 'excel' | 'pdf'): void => {
    const parametros = new URLSearchParams({
      desde: rango.desde,
      hasta: rango.hasta,
      formato,
      ...(tipo === '' ? {} : { tipo }),
      ...(dispositivoId === '' ? {} : { dispositivoId }),
    });
    // Navegación directa y no `fetch`: la descarga la gestiona el navegador con
    // la cabecera `Content-Disposition` que envía la API. Traerla por `fetch`
    // obligaría a reconstruir el nombre del fichero en el cliente.
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

  const columnas: readonly Columna<EventoRegistrado>[] = [
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
      clave: 'tipo',
      titulo: 'Tipo',
      texto: (e) => e.tipo,
      celda: (e) => <Distintivo tono="neutro">{e.tipo}</Distintivo>,
    },
    {
      clave: 'resultado',
      titulo: 'Resultado',
      texto: (e) => `${e.resultado} ${e.motivo ?? ''}`,
      celda: (e) => (
        <div>
          <Distintivo tono={e.resultado === 'permitido' ? 'exito' : 'peligro'}>
            {e.resultado === 'permitido' ? 'Permitido' : 'Negado'}
          </Distintivo>
          {e.motivo !== null ? (
            <p className="mt-0.5 text-secundario text-texto-apagado">{e.motivo}</p>
          ) : null}
        </div>
      ),
    },
    {
      clave: 'dispositivo',
      titulo: 'Dispositivo · método',
      texto: (e) => `${e.dispositivoId} ${e.metodo}`,
      celda: (e) => (
        <div>
          <p className="text-secundario text-texto">{e.dispositivoId}</p>
          <p className="text-secundario text-texto-apagado">{e.metodo}</p>
        </div>
      ),
    },
    {
      clave: 'origen',
      titulo: 'Origen',
      celda: (e) => (
        <span className="text-secundario text-texto-apagado">
          {e.decididoPorEdge ? 'Edge (autónomo)' : 'Nube'} · reglas v{e.versionReglas}
        </span>
      ),
    },
  ];

  return (
    <>
      <EncabezadoDePantalla
        titulo="Eventos y alertas"
        descripcion="Historial inmutable de accesos. Ningún evento se modifica ni se borra: lo impide la base de datos (RN-03, CA-23)."
        acciones={
          <>
            <Boton variante="secundario" onClick={() => exportar('csv')}>
              CSV
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

      {consulta.isLoading ? <EstadoCargando etiqueta="Cargando historial" /> : null}

      <TablaDeDatos
        titulo="Historial de eventos"
        columnas={columnas}
        filas={consulta.data?.filas ?? []}
        claveDeFila={(e) => e.id}
        cargando={consulta.isLoading}
        porPagina={20}
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
                onChange={(e) => setTipo(e.target.value as '' | Tipo)}
                className="rounded-campo border border-borde bg-campo px-2 py-1.5 text-cuerpo"
              >
                <option value="">Todos</option>
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-secundario">
              <span className="text-texto-apagado">Dispositivo</span>
              <input
                type="text"
                value={dispositivoId}
                onChange={(e) => setDispositivoId(e.target.value)}
                placeholder="Identificador"
                aria-label="Filtrar por dispositivo"
                className="w-48 rounded-campo border border-borde bg-campo px-2 py-1.5 text-cuerpo"
              />
            </label>
          </>
        }
        vacio={{
          titulo: 'Sin eventos en el rango',
          descripcion:
            'No se registró ningún acceso con estos filtros. Amplía el rango de fechas o quita el filtro de tipo.',
        }}
      />
    </>
  );
};
