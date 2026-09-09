'use client';

import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AlertaExpuesta, EventoRegistrado } from '@ncr/contracts';
import { CabeceraDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { TarjetaKpi } from '@/componentes/tarjeta-kpi';
import { FilaDeDispositivo } from '@/componentes/tarjeta-dispositivo';
import { FilaDeEvento } from '@/componentes/fila-evento';
import { HistogramaDeAccesos } from '@/componentes/histograma-accesos';
import { Distintivo } from '@/componentes/ui/distintivo';
import { EstadoCargando, EstadoVacio, estadoSegunCodigo } from '@/componentes/estados';
import { ErrorDeApi } from '@/lib/api/cliente';
import {
  claves,
  useAccesosPorHora,
  useDispositivos,
  useEventosRecientes,
  useIndicadores,
} from '@/lib/api/consultas';
import { abrirCanal } from '@/lib/sse/canal';
import { useCanal } from '@/lib/sse/contexto';

/**
 * Tablero operativo.
 *
 * **Cada bloque falla por su cuenta.** Cuatro consultas independientes y no una
 * agregada: la auditoría lo pide explícitamente —«una tarjeta caída no debe
 * tumbar el tablero»— y por eso la API expone tres endpoints y no uno.
 *
 * **El canal en vivo alimenta la lista y refresca el resto.** Un evento nuevo se
 * antepone a la lista al instante (KPI-25 medido en 3 ms de p99); los
 * indicadores y el histograma se invalidan para que se recalculen en el
 * servidor. La alternativa —recalcularlos aquí sumando uno— reimplementaría en
 * el navegador reglas que ya viven en el dominio, y las dos cuentas se
 * separarían en cuanto una autorización cambiara de estado.
 */
const MAXIMO_EN_VIVO = 20;

export const TableroOperativo = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const clienteDeConsultas = useQueryClient();
  const { setEstado } = useCanal();
  const [enVivo, setEnVivo] = useState<readonly EventoRegistrado[]>([]);
  const [ultimaAlerta, setUltimaAlerta] = useState<AlertaExpuesta | null>(null);

  const indicadores = useIndicadores(copropiedadId);
  const accesos = useAccesosPorHora(copropiedadId);
  const dispositivos = useDispositivos(copropiedadId);

  const ventana = indicadores.data?.ventana;
  const recientes = useEventosRecientes(
    copropiedadId,
    ventana === undefined ? undefined : { desde: ventana.desde, hasta: ventana.hasta },
  );

  const zonaHoraria = ventana?.zonaHoraria ?? 'America/Bogota';

  useEffect(() => {
    const anteponer = (nuevos: readonly EventoRegistrado[]): void => {
      setEnVivo((previos) => {
        // Deduplicado por id: la recuperación tras un corte puede traer algo
        // que ya llegó por el canal. Sin esto, un reintento pinta duplicados y
        // el operador cree que hubo dos accesos.
        const vistos = new Set(previos.map((e) => e.id));
        const añadibles = nuevos.filter((e) => !vistos.has(e.id));
        return [...añadibles, ...previos].slice(0, MAXIMO_EN_VIVO);
      });
    };

    const baja = abrirCanal({
      copropiedadId,
      mensajes: {
        estado: setEstado,
        evento: (evento) => {
          anteponer([evento]);
          // Se invalidan, no se recalculan: la cuenta la hace el servidor.
          void clienteDeConsultas.invalidateQueries({
            queryKey: claves.indicadores(copropiedadId),
          });
          void clienteDeConsultas.invalidateQueries({
            queryKey: claves.accesosPorHora(copropiedadId),
          });
        },
        alerta: (alerta) => {
          setUltimaAlerta(alerta);
          void clienteDeConsultas.invalidateQueries({
            queryKey: claves.indicadores(copropiedadId),
          });
        },
        recuperados: (eventos) => anteponer([...eventos].reverse()),
      },
    });
    return baja;
  }, [copropiedadId, clienteDeConsultas, setEstado]);

  /** El histórico cargado y lo llegado en vivo, sin duplicar. */
  const eventos = useMemo(() => {
    const historico = recientes.data?.filas ?? [];
    const vistos = new Set(enVivo.map((e) => e.id));
    return [...enVivo, ...historico.filter((e) => !vistos.has(e.id))].slice(0, MAXIMO_EN_VIVO);
  }, [enVivo, recientes.data]);

  const errorDe = (e: unknown): { descripcion: string; alReintentar: () => void } | undefined =>
    e === null || e === undefined
      ? undefined
      : {
          descripcion: e instanceof ErrorDeApi ? e.message : 'No se pudo cargar el indicador.',
          alReintentar: () => {
            void clienteDeConsultas.invalidateQueries({ queryKey: ['tablero', copropiedadId] });
          },
        };

  const datos = indicadores.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-titulo">Dashboard operativo</h1>
        <p className="mt-1 text-secundario text-texto-apagado">
          Cifras del día en la zona horaria de la copropiedad ({zonaHoraria}).
        </p>
      </div>

      {ultimaAlerta === null ? null : (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-tarjeta border border-peligro/30 bg-peligro-suave px-4 py-3"
        >
          <p className="text-cuerpo text-peligro-texto">
            Alerta {ultimaAlerta.tipo.replace(/_/g, ' ')} de severidad {ultimaAlerta.severidad}.
          </p>
          <Distintivo tono="peligro">Sin atender</Distintivo>
        </div>
      )}

      <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaKpi
          etiqueta="Residentes activos"
          valor={datos?.padron.residentesActivos ?? null}
          detalle={
            datos === undefined ? undefined : `${datos.padron.residentesAltaEnVentana} alta(s) hoy`
          }
          cargando={indicadores.isPending}
          error={errorDe(indicadores.error)}
          icono={<IconoPersonas />}
        />
        <TarjetaKpi
          etiqueta="Vehículos registrados"
          valor={datos?.padron.vehiculosActivos ?? null}
          detalle={
            datos === undefined ? undefined : `${datos.padron.vehiculosAltaEnVentana} alta(s) hoy`
          }
          tono="neutro"
          cargando={indicadores.isPending}
          error={errorDe(indicadores.error)}
          icono={<IconoVehiculo />}
        />
        <TarjetaKpi
          etiqueta="Visitantes hoy"
          valor={datos?.visitantes.autorizacionesDelDia ?? null}
          detalle={datos === undefined ? undefined : `${datos.visitantes.dentroAhora} dentro ahora`}
          tono="exito"
          cargando={indicadores.isPending}
          error={errorDe(indicadores.error)}
          icono={<IconoVisitante />}
        />
        <TarjetaKpi
          etiqueta="Alertas pendientes"
          valor={datos?.alertas.pendientes ?? null}
          detalle={
            datos === undefined
              ? undefined
              : datos.alertas.severidadMaxima === null
                ? 'Sin alertas abiertas'
                : `Máxima severidad: ${datos.alertas.severidadMaxima}`
          }
          tono={datos?.alertas.pendientes ? 'aviso' : 'neutro'}
          cargando={indicadores.isPending}
          error={errorDe(indicadores.error)}
          icono={<IconoAlerta />}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Tarjeta>
          <CabeceraDeTarjeta
            titulo="Últimos eventos en tiempo real"
            descripcion="Llegan por el canal en vivo; el estado de la conexión está en la cabecera."
          />
          {recientes.isPending ? (
            <EstadoCargando etiqueta="Cargando eventos" />
          ) : recientes.error instanceof ErrorDeApi ? (
            estadoSegunCodigo(recientes.error.estado, recientes.error.message, () => {
              void recientes.refetch();
            })
          ) : eventos.length === 0 ? (
            <EstadoVacio
              titulo="Sin eventos hoy"
              descripcion="Cuando un dispositivo reporte un acceso, aparecerá aquí al instante."
            />
          ) : (
            <ul>
              {eventos.map((e) => (
                <FilaDeEvento key={e.id} evento={e} zonaHoraria={zonaHoraria} />
              ))}
            </ul>
          )}
        </Tarjeta>

        <div className="space-y-6">
          <Tarjeta>
            <CabeceraDeTarjeta
              titulo="Accesos por hora"
              descripcion="Historial de ingresos del día de hoy"
            />
            {accesos.isPending ? (
              <EstadoCargando etiqueta="Cargando histograma" />
            ) : accesos.error instanceof ErrorDeApi ? (
              estadoSegunCodigo(accesos.error.estado, accesos.error.message, () => {
                void accesos.refetch();
              })
            ) : accesos.data === undefined ? null : (
              <HistogramaDeAccesos datos={accesos.data} />
            )}
          </Tarjeta>

          <Tarjeta>
            <CabeceraDeTarjeta
              titulo="Estado de dispositivos"
              descripcion="Derivado del último latido contra el umbral de la copropiedad"
              accion={
                dispositivos.data === undefined ? undefined : (
                  <div className="flex gap-1.5">
                    <Distintivo tono="exito">{dispositivos.data.saludables} activos</Distintivo>
                    {dispositivos.data.degradados > 0 ? (
                      <Distintivo tono="aviso">
                        {dispositivos.data.degradados} degradados
                      </Distintivo>
                    ) : null}
                    {dispositivos.data.caidos > 0 ? (
                      <Distintivo tono="peligro">{dispositivos.data.caidos} sin señal</Distintivo>
                    ) : null}
                  </div>
                )
              }
            />
            {dispositivos.isPending ? (
              <EstadoCargando etiqueta="Cargando dispositivos" />
            ) : dispositivos.error instanceof ErrorDeApi ? (
              estadoSegunCodigo(dispositivos.error.estado, dispositivos.error.message, () => {
                void dispositivos.refetch();
              })
            ) : (dispositivos.data?.dispositivos.length ?? 0) === 0 ? (
              <EstadoVacio
                titulo="Sin dispositivos registrados"
                descripcion="Registra las cámaras, terminales y relés de la copropiedad para verlos aquí."
              />
            ) : (
              <ul>
                {dispositivos.data?.dispositivos.map((d) => (
                  <FilaDeDispositivo key={d.id} dispositivo={d} />
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
      </div>
    </div>
  );
};

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7 } as const;

const IconoPersonas = (): JSX.Element => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo} aria-hidden="true">
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.2a3 3 0 0 1 0 5.6M17 19a5 5 0 0 0-2-4" />
  </svg>
);

const IconoVehiculo = (): JSX.Element => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo} aria-hidden="true">
    <path d="M4 16v-3l1.6-4.2A2 2 0 0 1 7.5 7.5h9a2 2 0 0 1 1.9 1.3L20 13v3" />
    <path d="M4 16h16M6.5 16v1.8M17.5 16v1.8M7.5 13h9" />
  </svg>
);

const IconoVisitante = (): JSX.Element => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo} aria-hidden="true">
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
  </svg>
);

const IconoAlerta = (): JSX.Element => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo} aria-hidden="true">
    <path d="M12 4 21 19H3z" strokeLinejoin="round" />
    <path d="M12 10v3.5M12 16.5h.01" strokeLinecap="round" />
  </svg>
);
