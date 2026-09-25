'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DoorOpen, ShieldAlert, ShieldX } from 'lucide-react';
import { AvisoDeLlamada } from '@/componentes/aviso-de-llamada';
import type { LlamadaEntrante } from '@/lib/sse/llamadas';
import { cliente, desenvolver, ErrorDeApi } from '@/lib/api/cliente';
import { useColaDeAtencion, useOrdenesManuales } from '@/lib/api/consultas';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import { CabeceraDeTarjeta, CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { DialogoDeMotivo } from '@/componentes/dialogo-motivo';
import { EstadoCargando, EstadoVacio, estadoSegunCodigo } from '@/componentes/estados';

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
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const cola = useColaDeAtencion(copropiedadId);
  const ordenes = useOrdenesManuales(copropiedadId);
  const clienteDeConsulta = useQueryClient();
  /**
   * A4 · una orden nace de un evento de la cola O de una llamada del
   * videoportero. La llamada no tiene `eventoId`: no es un acceso todavía. La
   * orden sí lleva siempre el equipo y el motivo (RN-08, CA-16).
   */
  const [pidiendo, setPidiendo] = useState<{
    accion: 'abrir' | 'negar';
    dispositivoId: string;
    eventoId?: string;
  } | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [llamada, setLlamada] = useState<LlamadaEntrante | null>(null);

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
    onSuccess: () => {
      setPidiendo(null);
      setError(undefined);
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
    return estadoSegunCodigo(estado, 'No se pudo cargar la portería.', () => {
      void cola.refetch();
    });
  }

  const lista = cola.data?.cola ?? [];
  const actual = lista[0];

  return (
    <>
      <EncabezadoDePantalla
        titulo="Portería"
        descripcion="Lo que está pasando en las puertas ahora mismo. Toda apertura o negación queda con tu nombre y su motivo."
      />

      {llamada !== null ? (
        <Tarjeta>
          <CabeceraDeTarjeta
            titulo={`${llamada.clase === 'timbre' ? 'Timbre' : 'Llamada'} desde ${llamada.vivienda ?? 'vivienda sin identificar'}`}
            descripcion={`${llamada.origen ?? 'Sin origen declarado'} · ${CUANDO(llamada.ocurridoEn)} · equipo ${llamada.dispositivoId.slice(0, 8)}`}
            accion={
              <Boton variante="secundario" tamano="sm" onClick={() => setLlamada(null)}>
                Cerrar
              </Boton>
            }
          />
          <CuerpoDeTarjeta>
            <div className="flex flex-wrap gap-2">
              <Boton
                variante="exito"
                onClick={() => {
                  setError(undefined);
                  setPidiendo({ accion: 'abrir', dispositivoId: llamada.dispositivoId });
                }}
              >
                <DoorOpen className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
                Abrir con motivo
              </Boton>
              <Boton
                variante="peligro"
                onClick={() => {
                  setError(undefined);
                  setPidiendo({ accion: 'negar', dispositivoId: llamada.dispositivoId });
                }}
              >
                <ShieldX className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
                Negar con motivo
              </Boton>
            </div>
            {llamada.viviendaId === null ? (
              <p className="mt-3 text-distintivo text-aviso-texto">
                El padrón no reconoce la unidad que declara el equipo; la apertura queda igualmente
                con tu nombre y el motivo.
              </p>
            ) : null}
          </CuerpoDeTarjeta>
        </Tarjeta>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Tarjeta>
          <CabeceraDeTarjeta
            titulo="Evento actual"
            descripcion={
              actual === undefined
                ? 'Sin nadie esperando en las puertas.'
                : `Esperando ${String(actual.esperaSegundos)} s · ${CUANDO(actual.ocurridoEn)}`
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
                  <Dato etiqueta="Resultado del motor">
                    <Distintivo tono={actual.resultado === 'permitido' ? 'exito' : 'peligro'}>
                      {actual.resultado === 'permitido' ? 'Permitido' : 'Denegado'}
                    </Distintivo>
                  </Dato>
                  <Dato etiqueta="Motivo">{actual.motivo ?? 'Sin motivo de denegación'}</Dato>
                  <Dato etiqueta="Vivienda destino">
                    {actual.viviendaId ?? 'Sin vivienda asociada'}
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
                <Evidencia copropiedadId={copropiedadId} eventoId={actual.eventoId} />

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
          <Tarjeta>
            <CabeceraDeTarjeta
              titulo="En espera"
              descripcion={`${String(cola.data?.total ?? 0)} en la cola · ${String(cola.data?.criticos ?? 0)} de atención inmediata`}
            />
            <CuerpoDeTarjeta>
              {lista.length <= 1 ? (
                <p className="text-secundario text-texto-apagado">Nadie más esperando.</p>
              ) : (
                <ul className="space-y-2">
                  {lista.slice(1, 6).map((e) => (
                    <li
                      key={e.eventoId}
                      className="flex items-center justify-between gap-3 rounded-boton border border-borde px-3 py-2"
                    >
                      <span className="min-w-0 truncate text-secundario text-texto">
                        {e.placaDetectada ?? e.viviendaId ?? 'Llamada al intercom'}
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
                    </li>
                  ))}
                </ul>
              )}
            </CuerpoDeTarjeta>
          </Tarjeta>

          <Tarjeta>
            <CabeceraDeTarjeta
              titulo="Historial inmediato"
              descripcion="Lo accionado a mano en esta portería (HU-23)."
            />
            <CuerpoDeTarjeta>
              {ordenes.data === undefined || ordenes.data.ordenes.length === 0 ? (
                <p className="text-secundario text-texto-apagado">
                  Todavía no se ha accionado nada a mano.
                </p>
              ) : (
                <ul className="space-y-2">
                  {ordenes.data.ordenes.slice(0, 6).map((o) => (
                    <li key={o.id} className="border-b border-borde pb-2 last:border-b-0 last:pb-0">
                      <div className="flex items-center gap-2">
                        <Distintivo tono={o.accion === 'abrir' ? 'exito' : 'peligro'}>
                          {o.accion === 'abrir' ? 'Abierta' : 'Negada'}
                        </Distintivo>
                        <span className="text-distintivo text-texto-apagado">
                          {CUANDO(o.momento)}
                        </span>
                      </div>
                      <p className="mt-1 text-secundario text-texto-apagado">{o.motivo}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CuerpoDeTarjeta>
          </Tarjeta>

          <Tarjeta>
            <CabeceraDeTarjeta
              titulo="Alertas y listas negras"
              descripcion="Lo que exige mirar antes de abrir (HU-24)."
            />
            <CuerpoDeTarjeta>
              <div className="flex items-start gap-2 text-secundario text-texto-apagado">
                <ShieldAlert
                  className="mt-0.5 h-4 w-4 shrink-0 text-aviso-texto"
                  aria-hidden="true"
                  strokeWidth={1.75}
                />
                <p>
                  Las listas negras vetan por sí solas: el motor las aplica con precedencia sobre
                  cualquier autorización vigente (RN-06), y un evento vetado llega aquí marcado como
                  de atención inmediata.
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

      <AvisoDeLlamada
        copropiedadId={copropiedadId}
        alAtender={(entrante) => {
          setError(undefined);
          setLlamada(entrante);
        }}
      />
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

/**
 * La evidencia, pedida **al abrir el evento** y no antes.
 *
 * Es una imagen del bucket privado servida con URL firmada de 60 s. La CSP
 * admite ese origen desde esta etapa (`img-src`); hasta ahora no lo listaba
 * porque ninguna pantalla la pintaba, y la primera miniatura habría salido rota
 * con la queja en un sitio que nadie mira.
 */
const Evidencia = ({
  copropiedadId,
  eventoId,
}: {
  readonly copropiedadId: string;
  readonly eventoId: string;
}): JSX.Element => {
  const [estado, setEstado] = useState<'pidiendo' | 'lista' | 'sin-evidencia'>('pidiendo');
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    void cliente
      .GET('/copropiedades/{id}/eventos/{eventoId}/evidencia', {
        params: { path: { id: copropiedadId, eventoId } },
      })
      .then((r) => {
        // `vigente` evita escribir estado sobre un componente que ya cambió de
        // evento: el operador pasa al siguiente antes de que llegue la firma, y
        // sin esto la miniatura del anterior aparecería sobre el nuevo.
        if (!vigente) return;
        const enlace = (r.data as { url?: string } | undefined)?.url;
        if (typeof enlace === 'string' && enlace !== '') {
          setUrl(enlace);
          setEstado('lista');
        } else {
          setEstado('sin-evidencia');
        }
      })
      .catch(() => {
        if (vigente) setEstado('sin-evidencia');
      });
    return () => {
      vigente = false;
    };
  }, [copropiedadId, eventoId]);

  if (estado === 'pidiendo') {
    return (
      <div className="h-40 w-full animate-pulse rounded-tarjeta bg-borde-suave motion-reduce:animate-none" />
    );
  }
  if (estado === 'sin-evidencia' || url === null) {
    return (
      <p className="rounded-tarjeta border border-borde bg-lienzo px-4 py-3 text-secundario text-texto-apagado">
        Este evento no trae evidencia fotográfica. La cámara puede no haberla enviado, o el enlace
        firmado puede haber caducado: vuelve a abrir el evento para pedir uno nuevo.
      </p>
    );
  }
  return (
    <img
      src={url}
      alt="Evidencia fotográfica del evento"
      className="max-h-64 w-full rounded-tarjeta border border-borde object-cover"
    />
  );
};
