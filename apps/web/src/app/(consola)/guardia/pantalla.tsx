'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mic, MicOff, PhoneCall, Siren, Video } from 'lucide-react';
import type { EnAtencion } from '@ncr/contracts';
import { cliente, desenvolver, ErrorDeApi } from '@/lib/api/cliente';
import { useColaDeAtencion } from '@/lib/api/consultas';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import { CabeceraDeTarjeta, CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { DialogoDeMotivo } from '@/componentes/dialogo-motivo';
import { EstadoCargando, EstadoVacio, estadoSegunCodigo } from '@/componentes/estados';

/**
 * Consola de GUARDIA VIRTUAL — CU-03, HU-25 a HU-29.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ES OTRA CONSOLA, NO LA PORTERÍA CON MÁS BOTONES (C-12)
 *
 * El portero atiende **una** puerta y la tiene delante. El operador de central
 * atiende **varias copropiedades** y no ve ninguna: todo lo que sabe se lo dice
 * la pantalla. De ahí las dos diferencias que gobiernan este diseño:
 *
 *  · La **cola manda**. En portería el evento actual es el que hay; aquí es una
 *    elección entre varios, y por eso la cola es la columna principal y no un
 *    apéndice.
 *  · El **tiempo de espera es un dato de primera clase**, no un detalle: es lo
 *    único que distingue a alguien que acaba de llamar de alguien al que se
 *    está dejando en la calle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LOS CUATRO FLUJOS ALTERNOS DE CU-03, Y DÓNDE ESTÁ CADA UNO
 *
 *  1. **El residente no responde** → «Avisar al residente» deja constancia del
 *     intento y del texto. El envío por FCM llega en la ETAPA 11.
 *  2. **El residente niega** → es una negación con motivo, el mismo diálogo:
 *     el operador escribe que la vivienda no confirma.
 *  3. **El operador está ocupado en otra copropiedad** → el canal de audio es
 *     exclusivo por dispositivo (ADR-01) y la consola muestra el puesto en la
 *     cola en vez de rechazar. Conmutar de copropiedad no lo suelta.
 *  4. **No hay operador disponible** → la emergencia escala igual, y la cola
 *     marca en rojo lo que pasa del umbral de espera.
 */

const MOTIVOS_DE_APERTURA = [
  'La vivienda confirma la visita por el intercom',
  'Servicio de emergencia identificado',
  'Residente identificado por documento en cámara',
];

const MOTIVOS_DE_NEGACION = [
  'La vivienda no confirma la visita',
  'El residente niega el acceso',
  'No se logra identificar a la persona en cámara',
];

export const PantallaDeGuardiaVirtual = ({
  copropiedadId,
  nombreDeCopropiedad,
}: {
  readonly copropiedadId: string;
  readonly nombreDeCopropiedad: string;
}): JSX.Element => {
  const cola = useColaDeAtencion(copropiedadId);
  const clienteDeConsulta = useQueryClient();
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [pidiendo, setPidiendo] = useState<'abrir' | 'negar' | 'emergencia' | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  const lista = cola.data?.cola ?? [];
  const actual: EnAtencion | undefined = lista.find((e) => e.eventoId === seleccionado) ?? lista[0];

  const canal = useQuery({
    queryKey: ['guardia', copropiedadId, 'canal', actual?.dispositivoId],
    enabled: actual !== undefined,
    refetchInterval: 5000,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/guardia/intercom/{dispositivoId}', {
          params: { path: { id: copropiedadId, dispositivoId: actual?.dispositivoId ?? '' } },
        }),
      ),
  });

  const invalidar = (): void => {
    void clienteDeConsulta.invalidateQueries({ queryKey: ['guardia', copropiedadId] });
  };

  const alFallar = (e: unknown): void => {
    setError(e instanceof ErrorDeApi ? e.message : 'No se pudo completar. Vuelve a intentarlo.');
  };

  const audio = useMutation({
    mutationFn: async (accion: 'abrir' | 'cerrar') =>
      desenvolver(
        accion === 'abrir'
          ? await cliente.POST('/copropiedades/{id}/guardia/intercom/abrir', {
              params: { path: { id: copropiedadId } },
              body: { dispositivoId: actual?.dispositivoId ?? '' },
            })
          : await cliente.POST('/copropiedades/{id}/guardia/intercom/cerrar', {
              params: { path: { id: copropiedadId } },
              body: { dispositivoId: actual?.dispositivoId ?? '' },
            }),
      ),
    onSuccess: invalidar,
    onError: alFallar,
  });

  const ordenar = useMutation({
    mutationFn: async (entrada: { accion: 'abrir' | 'negar'; motivo: string }) =>
      desenvolver(
        await cliente.POST('/copropiedades/{id}/guardia/ordenes', {
          params: { path: { id: copropiedadId } },
          body: {
            dispositivoId: actual?.dispositivoId ?? '',
            accion: entrada.accion,
            motivo: entrada.motivo,
            // `exactOptionalPropertyTypes`: el campo se omite si no hay evento,
            // en vez de viajar como `undefined`. El DTO lo declara opcional, no
            // «opcional o nulo», y la diferencia la comprueba el compilador.
            ...(actual?.eventoId === undefined ? {} : { eventoId: actual.eventoId }),
          },
        }),
      ),
    onSuccess: () => {
      setPidiendo(null);
      setError(undefined);
      invalidar();
    },
    onError: alFallar,
  });

  const emergencia = useMutation({
    mutationFn: async (motivo: string) =>
      desenvolver(
        await cliente.POST('/copropiedades/{id}/guardia/emergencia', {
          params: { path: { id: copropiedadId } },
          body: {
            motivo,
            ...(actual?.dispositivoId === undefined ? {} : { dispositivoId: actual.dispositivoId }),
          },
        }),
      ),
    onSuccess: () => {
      setPidiendo(null);
      setError(undefined);
    },
    onError: alFallar,
  });

  const avisar = useMutation({
    mutationFn: async () =>
      desenvolver(
        await cliente.POST('/copropiedades/{id}/guardia/avisar-residente', {
          params: { path: { id: copropiedadId } },
          body: {
            viviendaId: actual?.viviendaId ?? copropiedadId,
            texto: 'Tienes una visita esperando en la portería',
          },
        }),
      ),
    onError: alFallar,
  });

  if (cola.isPending) return <EstadoCargando etiqueta="Cargando la guardia virtual" />;
  if (cola.isError) {
    const estado = cola.error instanceof ErrorDeApi ? cola.error.estado : 0;
    return estadoSegunCodigo(estado, 'No se pudo cargar la guardia virtual.', () => {
      void cola.refetch();
    });
  }

  const tienePalabra = canal.data?.estado === 'abierta';
  const esperandoTurno = canal.data?.estado === 'en_espera';

  return (
    <>
      <EncabezadoDePantalla
        titulo="Guardia virtual"
        descripcion={`Atendiendo ${nombreDeCopropiedad}. Conmuta de copropiedad en la cabecera; el canal de audio no se lleva contigo.`}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* ── La cola manda: es la columna, no un apéndice ── */}
        <Tarjeta>
          <CabeceraDeTarjeta
            titulo="Cola de atención"
            descripcion={`${String(cola.data?.total ?? 0)} esperando · más antigua ${String(cola.data?.esperaMaxima ?? 0)} s`}
            accion={
              (cola.data?.criticos ?? 0) > 0 ? (
                <Distintivo tono="peligro">{cola.data?.criticos} urgente(s)</Distintivo>
              ) : undefined
            }
          />
          <CuerpoDeTarjeta>
            {lista.length === 0 ? (
              <EstadoVacio
                titulo="Sin nadie en cola"
                descripcion="Las llamadas al intercom y las lecturas dudosas aparecen aquí, la que más lleva esperando arriba."
              />
            ) : (
              <ul className="space-y-2">
                {lista.map((e) => (
                  <li key={e.eventoId}>
                    <button
                      type="button"
                      onClick={() => setSeleccionado(e.eventoId)}
                      aria-current={e.eventoId === actual?.eventoId}
                      className={
                        e.eventoId === actual?.eventoId
                          ? 'w-full rounded-boton border border-marca-texto bg-marca-suave px-3 py-2 text-left transition-colors duration-150 ease-salida motion-reduce:transition-none'
                          : 'w-full rounded-boton border border-borde px-3 py-2 text-left transition-colors duration-150 ease-salida [@media(hover:hover)and(pointer:fine)]:hover:border-marca-texto motion-reduce:transition-none'
                      }
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-secundario text-texto">
                          {e.placaDetectada ?? e.viviendaId ?? 'Llamada al intercom'}
                        </span>
                        <span
                          className={
                            e.demorado
                              ? 'shrink-0 text-distintivo font-semibold text-peligro-texto'
                              : 'shrink-0 text-distintivo text-texto-apagado'
                          }
                        >
                          {e.esperaSegundos} s
                        </span>
                      </span>
                      {e.urgencia === 'critica' ? (
                        <span className="mt-1 block text-distintivo text-peligro-texto">
                          {e.motivo}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CuerpoDeTarjeta>
        </Tarjeta>

        <div className="space-y-4">
          <Tarjeta>
            <CabeceraDeTarjeta
              titulo="Atención"
              descripcion={
                actual === undefined
                  ? 'Elige a quién atender en la cola.'
                  : `Vivienda ${actual.viviendaId ?? 'sin asociar'} · esperando ${String(actual.esperaSegundos)} s`
              }
            />
            <CuerpoDeTarjeta>
              {actual === undefined ? (
                <EstadoVacio titulo="Nadie seleccionado" descripcion="La cola está vacía." />
              ) : (
                <div className="space-y-4">
                  {/*
                    VIDEO EN VIVO. El puente RTSP→WebRTC (go2rtc) llega con el
                    hardware en la ETAPA 15, y el navegador **exige contexto
                    seguro** para reproducir una cámara: por IP sin TLS no se
                    puede demostrar. Se dice aquí en vez de dejar un recuadro
                    negro que parezca una cámara caída.
                  */}
                  <div className="flex aspect-video w-full items-center justify-center rounded-tarjeta border border-borde bg-oscuro text-center">
                    <div className="px-6">
                      <Video
                        className="mx-auto h-8 w-8 text-texto-invertidoApagado"
                        aria-hidden="true"
                        strokeWidth={1.5}
                      />
                      <p className="mt-2 text-secundario text-texto-invertido">
                        Video en vivo del equipo {actual.dispositivoId.slice(0, 8)}
                      </p>
                      <p className="mt-1 text-distintivo text-texto-invertidoApagado">
                        El puente RTSP → WebRTC llega con la ETAPA 15. Requiere HTTPS: el navegador
                        no reproduce cámara fuera de un contexto seguro.
                      </p>
                    </div>
                  </div>

                  {/* ── Audio: exclusivo por dispositivo (ADR-01) ── */}
                  <div className="flex flex-wrap items-center gap-2 rounded-tarjeta border border-borde px-3 py-2">
                    <Distintivo tono={tienePalabra ? 'exito' : esperandoTurno ? 'aviso' : 'neutro'}>
                      {tienePalabra
                        ? 'Tienes la palabra'
                        : esperandoTurno
                          ? `En cola · ${String(canal.data?.porDelante ?? 0)} por delante`
                          : 'Canal libre'}
                    </Distintivo>
                    <Boton
                      variante={tienePalabra ? 'secundario' : 'primario'}
                      tamano="sm"
                      cargando={audio.isPending}
                      onClick={() => audio.mutate(tienePalabra ? 'cerrar' : 'abrir')}
                    >
                      {tienePalabra ? (
                        <>
                          <MicOff className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
                          Colgar
                        </>
                      ) : (
                        <>
                          <Mic className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
                          {esperandoTurno ? 'Salir de la cola' : 'Hablar'}
                        </>
                      )}
                    </Boton>
                    <span className="text-distintivo text-texto-apagado">
                      El canal admite una conversación a la vez y se libera solo tras{' '}
                      {String(canal.data?.timeoutSegundos ?? 90)} s sin actividad.
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Boton
                      variante="exito"
                      onClick={() => {
                        setError(undefined);
                        setPidiendo('abrir');
                      }}
                    >
                      Abrir con motivo
                    </Boton>
                    <Boton
                      variante="peligro"
                      onClick={() => {
                        setError(undefined);
                        setPidiendo('negar');
                      }}
                    >
                      Negar con motivo
                    </Boton>
                    <Boton
                      variante="secundario"
                      cargando={avisar.isPending}
                      onClick={() => avisar.mutate()}
                    >
                      <PhoneCall className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
                      Avisar al residente
                    </Boton>
                    <Boton
                      variante="peligro"
                      onClick={() => {
                        setError(undefined);
                        setPidiendo('emergencia');
                      }}
                    >
                      <Siren className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
                      Emergencia
                    </Boton>
                  </div>

                  {avisar.isSuccess ? (
                    <p aria-live="polite" className="text-secundario text-exito-texto">
                      Aviso registrado. El envío por FCM llega con la ETAPA 11.
                    </p>
                  ) : null}
                  {emergencia.isSuccess ? (
                    <p aria-live="polite" className="text-secundario text-peligro-texto">
                      Emergencia escalada con severidad crítica.
                    </p>
                  ) : null}
                  {error !== undefined && pidiendo === null ? (
                    <p role="alert" className="text-secundario text-peligro-texto">
                      {error}
                    </p>
                  ) : null}
                </div>
              )}
            </CuerpoDeTarjeta>
          </Tarjeta>
        </div>
      </div>

      {pidiendo !== null ? (
        <DialogoDeMotivo
          titulo={
            pidiendo === 'emergencia'
              ? 'Declarar emergencia'
              : pidiendo === 'abrir'
                ? 'Abrir la puerta'
                : 'Negar el acceso'
          }
          descripcion={
            pidiendo === 'emergencia'
              ? 'Escala con severidad crítica a todos los operadores conectados. Di qué ocurre.'
              : 'Queda con tu nombre, la hora y la copropiedad que estás atendiendo.'
          }
          etiquetaAccion={
            pidiendo === 'emergencia' ? 'Declarar' : pidiendo === 'abrir' ? 'Abrir' : 'Negar'
          }
          variante={pidiendo === 'abrir' ? 'primario' : 'peligro'}
          sugerencias={pidiendo === 'abrir' ? MOTIVOS_DE_APERTURA : MOTIVOS_DE_NEGACION}
          cargando={ordenar.isPending || emergencia.isPending}
          error={error}
          alCancelar={() => {
            setPidiendo(null);
            setError(undefined);
          }}
          alConfirmar={(motivo) => {
            if (pidiendo === 'emergencia') emergencia.mutate(motivo);
            else ordenar.mutate({ accion: pidiendo, motivo });
          }}
        />
      ) : null}
    </>
  );
};
