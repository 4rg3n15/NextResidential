'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DoorOpen, ShieldAlert, ShieldX } from 'lucide-react';
import type { MotivoAcceso } from '@ncr/contracts';
import { cliente, desenvolver, ErrorDeApi } from '@/lib/api/cliente';
import { useAtencion } from '@/lib/atencion/use-atencion';
import { ETIQUETA_DE_DISPARADOR } from '@/lib/atencion/seleccion';
import { useAtencionEnVivo } from '@/componentes/atencion-en-vivo';
import { EvidenciaDeEvento } from '@/componentes/evidencia-de-evento';
import { TEXTO_MOTIVO } from '@/lib/motivos';
import { useColaDeAtencion, useOrdenesManuales } from '@/lib/api/consultas';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import { resultadoDeOrden } from '@/componentes/resultado-de-orden';
import type { OrdenConResultado } from '@/componentes/resultado-de-orden';
import { CabeceraDeTarjeta, CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { DialogoDeMotivo } from '@/componentes/dialogo-motivo';
import { EstadoCargando, EstadoVacio, estadoSegunCodigo } from '@/componentes/estados';
import { EquiposEnVivo } from '../guardia/equipos-en-vivo';

/**
 * Consola de PORTERÍA — HU-21 a HU-24.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNA PANTALLA PARA MIRAR, NO PARA NAVEGAR
 *
 * El portero no explora: atiende. Por eso la pantalla no tiene pestañas ni
 * filtros —el evento que importa es el de arriba— y las dos acciones viven
 * junto al evento, no en una barra. Cada clic que se ahorra es un segundo con
 * alguien esperando en la puerta.
 *
 * **El evento actual ocupa el sitio, y los demás son una lista.** El mockup
 * dibujaba una tabla; una tabla obliga a decidir cuál mirar, y esa decisión ya
 * la toma la cola por espera (CU-03).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ABRIR Y NEGAR PESAN LO MISMO
 *
 * Los dos exigen motivo y los dos abren el mismo diálogo. Negar sin motivo
 * parece inofensivo —«no pasó nada»— y es justo el hecho que un incidente
 * necesita reconstruir. Lo que los diferencia es el color y el verbo, no la
 * fricción.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * G2 (15-N) · EL EVENTO ACTUAL SE QUEDA HASTA QUE SE ATIENDE
 *
 * Antes, «actual» era siempre el primero de la cola, y la cola se reordena en
 * cada consulta: una lista negra recién llegada le quitaba la pantalla al
 * portero que hablaba con otro visitante. Ahora lo que está en pantalla se
 * queda hasta que sale de la cola; si no hay nada, lo primero pasa solo, con
 * la vista en vivo de SU equipo. La llamada del videoportero es un elemento
 * más (G3), ya no una tarjeta aparte.
 */

const CUANDO = (iso: string): string =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

const MOTIVOS_FRECUENTES = [
  'Visitante esperado por la vivienda, confirmado por teléfono',
  'Residente sin credencial a mano, identificado por documento',
  'Proveedor con autorización vigente en papel',
];

const MOTIVOS_DE_NEGACION = [
  'No figura en ninguna autorización vigente',
  'La vivienda no confirma la visita',
  'No presenta documento de identidad',
];

export const PantallaDePorteria = ({
  copropiedadId,
  atender,
}: {
  readonly copropiedadId: string;
  /** G2 · el elemento que trae el aviso de otra pantalla (`?atender=…`). */
  readonly atender?: string | undefined;
}): JSX.Element => {
  const cola = useColaDeAtencion(copropiedadId);
  const { actual, enCola, atender: elegir } = useAtencion(cola.data, atender);
  const { llamadaDe } = useAtencionEnVivo();
  const ordenes = useOrdenesManuales(copropiedadId);
  const clienteDeConsulta = useQueryClient();
  /**
   * Una orden nace de un elemento de la cola —un acceso o, desde la 15-N, lo
   * que emite un equipo, como la llamada—, y lleva su id: así sale de la cola.
   * Lleva siempre el equipo y el motivo (RN-08, CA-16).
   */
  const [pidiendo, setPidiendo] = useState<{
    accion: 'abrir' | 'negar';
    dispositivoId: string;
    eventoId?: string;
  } | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  // H-SITIO-13 · lo que el equipo contestó a la última orden, dicho sin adorno.
  const [ultimaOrden, setUltimaOrden] = useState<OrdenConResultado | null>(null);

  const ordenar = useMutation({
    mutationFn: async (entrada: {
      accion: 'abrir' | 'negar';
      dispositivoId: string;
      eventoId?: string;
      motivo: string;
    }) =>
      desenvolver(
        await cliente.POST('/copropiedades/{id}/guardia/ordenes', {
          params: { path: { id: copropiedadId } },
          body: {
            dispositivoId: entrada.dispositivoId,
            accion: entrada.accion,
            motivo: entrada.motivo,
            ...(entrada.eventoId === undefined ? {} : { eventoId: entrada.eventoId }),
          },
        }),
      ),
    onSuccess: (orden) => {
      setPidiendo(null);
      setError(undefined);
      setUltimaOrden(orden);
      void clienteDeConsulta.invalidateQueries({ queryKey: ['guardia', copropiedadId] });
    },
    onError: (e) => {
      // El motivo se conserva: perder lo escrito porque el servidor dijo que no
      // es la forma más rápida de que la siguiente vez sea «abro» a secas.
      setError(
        e instanceof ErrorDeApi ? e.message : 'No se pudo ejecutar la orden. Vuelve a intentarlo.',
      );
    },
  });

  if (cola.isPending) return <EstadoCargando etiqueta="Cargando la portería" />;
  if (cola.isError) {
    const estado = cola.error instanceof ErrorDeApi ? cola.error.estado : 0;
    return estadoSegunCodigo(
      cola.error instanceof ErrorDeApi ? cola.error : estado,
      'No se pudo cargar la portería.',
      () => {
        void cola.refetch();
      },
    );
  }

  const lista = cola.data?.cola ?? [];
  const enEsperaAhora = lista.filter((e) => e.eventoId !== actual?.eventoId);
  const llamada = actual?.disparador === 'llamada' ? llamadaDe(actual.dispositivoId) : undefined;

  return (
    <>
      <EncabezadoDePantalla
        titulo="Portería"
        descripcion="Lo que está pasando en las puertas ahora mismo. Toda apertura o negación queda con tu nombre y su motivo."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Tarjeta>
          <CabeceraDeTarjeta
            titulo="Evento actual"
            descripcion={
              actual === undefined
                ? 'Sin nadie esperando en las puertas.'
                : `${ETIQUETA_DE_DISPARADOR[actual.disparador]} · esperando ${String(actual.esperaSegundos)} s · ${CUANDO(actual.ocurridoEn)}`
            }
            accion={
              actual === undefined ? undefined : (
                <Distintivo tono={actual.urgencia === 'critica' ? 'peligro' : 'neutro'}>
                  {actual.urgencia === 'critica' ? 'Atención inmediata' : 'En espera'}
                </Distintivo>
              )
            }
          />
          <CuerpoDeTarjeta>
            {actual === undefined ? (
              <EstadoVacio
                titulo="Nada que atender"
                descripcion="Cuando alguien llame o una cámara lea una placa, aparecerá aquí con su evidencia."
              />
            ) : (
              <div className="space-y-4">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <Dato etiqueta="Qué pasa">
                    <Distintivo tono={actual.urgencia === 'critica' ? 'peligro' : 'marca'}>
                      {actual.titulo}
                    </Distintivo>
                  </Dato>
                  <Dato etiqueta="Motivo">
                    {actual.motivo === null
                      ? actual.resultado === null
                        ? 'Lo emitió el equipo'
                        : 'Sin motivo de denegación'
                      : (TEXTO_MOTIVO[actual.motivo as MotivoAcceso] ?? actual.motivo)}
                  </Dato>
                  <Dato etiqueta="Vivienda destino">
                    {llamada?.vivienda ?? actual.viviendaId ?? 'Sin vivienda asociada'}
                  </Dato>
                  <Dato etiqueta="Placa leída">
                    {actual.placaDetectada === null ? (
                      'Sin lectura de placa'
                    ) : (
                      <span className="font-mono tracking-wider">{actual.placaDetectada}</span>
                    )}
                  </Dato>
                </dl>

                {/*
                  La EVIDENCIA. La miniatura se pide con URL firmada de vida
                  corta al abrir el evento, no en la lista: pedir una por fila
                  las expondría en el historial del navegador de forma masiva y
                  sin que nadie las mire (RN-21).
                */}
                {actual.conEvidencia ? (
                  <EvidenciaDeEvento copropiedadId={copropiedadId} eventoId={actual.eventoId} />
                ) : (
                  <p className="text-secundario text-texto-apagado">
                    {actual.disparador === 'llamada'
                      ? 'La llamada no trae foto: la vista en vivo de ese equipo está al lado.'
                      : 'Sin foto de este evento: la vista en vivo de ese equipo está al lado.'}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Boton
                    variante="exito"
                    onClick={() => {
                      setError(undefined);
                      setPidiendo({
                        accion: 'abrir',
                        dispositivoId: actual.dispositivoId,
                        eventoId: actual.eventoId,
                      });
                    }}
                  >
                    <DoorOpen className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
                    Abrir con motivo
                  </Boton>
                  <Boton
                    variante="peligro"
                    onClick={() => {
                      setError(undefined);
                      setPidiendo({
                        accion: 'negar',
                        dispositivoId: actual.dispositivoId,
                        eventoId: actual.eventoId,
                      });
                    }}
                  >
                    <ShieldX className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
                    Negar con motivo
                  </Boton>
                </div>
              </div>
            )}
          </CuerpoDeTarjeta>
        </Tarjeta>

        <div className="space-y-4">
          {/* C10 (15-M) · cualquier equipo en vivo; G2 · lo que está en pantalla propone el suyo. */}
          <EquiposEnVivo
            copropiedadId={copropiedadId}
            propuesto={actual?.dispositivoId}
            eventoId={actual?.eventoId}
          />

          <Tarjeta>
            <CabeceraDeTarjeta
              titulo="En espera"
              descripcion={`${String(enCola)} en la cola · ${String(cola.data?.criticos ?? 0)} de atención inmediata`}
            />
            <CuerpoDeTarjeta>
              {enEsperaAhora.length === 0 ? (
                <p className="text-secundario text-texto-apagado">Nadie más esperando.</p>
              ) : (
                <ul className="space-y-2">
                  {enEsperaAhora.slice(0, 6).map((e) => (
                    <li key={e.eventoId}>
                      <button
                        type="button"
                        onClick={() => elegir(e.eventoId)}
                        className="flex w-full items-center justify-between gap-3 rounded-boton border border-borde px-3 py-2 text-left"
                      >
                        <span className="min-w-0 truncate text-secundario text-texto">
                          {ETIQUETA_DE_DISPARADOR[e.disparador]}
                          {e.placaDetectada === null ? '' : ` · ${e.placaDetectada}`}
                        </span>
                        <span
                          className={
                            e.demorado
                              ? 'text-distintivo text-peligro-texto'
                              : 'text-distintivo text-texto-apagado'
                          }
                        >
                          {e.esperaSegundos} s
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CuerpoDeTarjeta>
          </Tarjeta>

          <Tarjeta>
            <CabeceraDeTarjeta
              titulo="Historial inmediato"
              descripcion="Lo que se abrió o se negó a mano en esta portería."
            />
            <CuerpoDeTarjeta>
              {ultimaOrden !== null ? (
                <p role="status" className="mb-2 text-secundario text-texto-apagado">
                  Última orden: {resultadoDeOrden(ultimaOrden).texto}
                </p>
              ) : null}
              {ordenes.data === undefined || ordenes.data.ordenes.length === 0 ? (
                <p className="text-secundario text-texto-apagado">
                  Todavía no se ha accionado nada a mano.
                </p>
              ) : (
                <ul className="space-y-2">
                  {ordenes.data.ordenes.slice(0, 6).map((o) => (
                    <li key={o.id} className="border-b border-borde pb-2 last:border-b-0 last:pb-0">
                      <div className="flex items-center gap-2">
                        {/* H-SITIO-13 · lo que CONTESTÓ el equipo; nunca «Abierta». */}
                        <Distintivo tono={resultadoDeOrden(o).tono}>
                          {resultadoDeOrden(o).texto}
                        </Distintivo>
                        <span className="text-distintivo text-texto-apagado">
                          {CUANDO(o.momento)}
                        </span>
                      </div>
                      <p className="mt-1 text-secundario text-texto-apagado">{o.motivo}</p>
                      {o.accion === 'abrir' && o.resultado !== 'aceptada' && o.detalle !== null ? (
                        <p className="mt-1 text-secundario text-peligro-texto">{o.detalle}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CuerpoDeTarjeta>
          </Tarjeta>

          <Tarjeta>
            <CabeceraDeTarjeta
              titulo="Alertas y listas negras"
              descripcion="Lo que hay que revisar antes de abrir."
            />
            <CuerpoDeTarjeta>
              <div className="flex items-start gap-2 text-secundario text-texto-apagado">
                <ShieldAlert
                  className="mt-0.5 h-4 w-4 shrink-0 text-aviso-texto"
                  aria-hidden="true"
                  strokeWidth={1.75}
                />
                <p>
                  La lista negra manda sobre cualquier autorización: una persona o una placa vetada
                  no entra aunque tenga visita autorizada, y el intento llega aquí marcado como de
                  atención inmediata.
                </p>
              </div>
            </CuerpoDeTarjeta>
          </Tarjeta>
        </div>
      </div>

      {pidiendo !== null ? (
        <DialogoDeMotivo
          titulo={pidiendo.accion === 'abrir' ? 'Abrir la puerta' : 'Negar el acceso'}
          descripcion={
            pidiendo.accion === 'abrir'
              ? 'Sin motivo la puerta no se acciona. Lo que escribas queda con tu nombre y la hora.'
              : 'Una negación también queda registrada: es lo que un incidente necesita reconstruir.'
          }
          etiquetaAccion={pidiendo.accion === 'abrir' ? 'Abrir' : 'Negar'}
          variante={pidiendo.accion === 'abrir' ? 'primario' : 'peligro'}
          sugerencias={pidiendo.accion === 'abrir' ? MOTIVOS_FRECUENTES : MOTIVOS_DE_NEGACION}
          cargando={ordenar.isPending}
          error={error}
          alCancelar={() => {
            setPidiendo(null);
            setError(undefined);
          }}
          alConfirmar={(motivo) => {
            ordenar.mutate({
              accion: pidiendo.accion,
              dispositivoId: pidiendo.dispositivoId,
              ...(pidiendo.eventoId === undefined ? {} : { eventoId: pidiendo.eventoId }),
              motivo,
            });
          }}
        />
      ) : null}
    </>
  );
};

const Dato = ({
  etiqueta,
  children,
}: {
  readonly etiqueta: string;
  readonly children: React.ReactNode;
}): JSX.Element => (
  <div>
    <dt className="text-etiqueta uppercase tracking-wide text-texto-apagado">{etiqueta}</dt>
    <dd className="mt-0.5 text-cuerpo text-texto">{children}</dd>
  </div>
);
