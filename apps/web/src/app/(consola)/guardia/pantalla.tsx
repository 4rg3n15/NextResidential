'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mic, MicOff, PhoneCall, Siren } from 'lucide-react';
import { ControlesDeAudio } from '@/componentes/controles-de-audio';
import { EquiposEnVivo } from './equipos-en-vivo';
import { cliente, desenvolver, ErrorDeApi } from '@/lib/api/cliente';
import { useColaDeAtencion } from '@/lib/api/consultas';
import { useAtencion } from '@/lib/atencion/use-atencion';
import { ETIQUETA_DE_DISPARADOR } from '@/lib/atencion/seleccion';
import { useAtencionEnVivo } from '@/componentes/atencion-en-vivo';
import { EvidenciaDeEvento } from '@/componentes/evidencia-de-evento';
import { TEXTO_MOTIVO } from '@/lib/motivos';
import type { MotivoAcceso } from '@ncr/contracts';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import { resultadoDeOrden } from '@/componentes/resultado-de-orden';
import type { OrdenConResultado } from '@/componentes/resultado-de-orden';
import { CabeceraDeTarjeta, CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { DialogoDeMotivo } from '@/componentes/dialogo-motivo';
import {
  EstadoCargando,
  EstadoSinPermiso,
  EstadoVacio,
  estadoSegunCodigo,
} from '@/componentes/estados';
import { AYUDA_GUARDIA_REMOTA, MENSAJE_GUARDIA_REMOTA } from '@/lib/guardia-remota';

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
 *     intento y del texto. El envío a la app del residente no está cableado
 *     (O6, 15-N): la consola lo dice en vez de prometerlo.
 *  2. **El residente niega** → es una negación con motivo, el mismo diálogo:
 *     el operador escribe que la vivienda no confirma.
 *  3. **El operador está ocupado en otra copropiedad** → el canal de audio es
 *     exclusivo por dispositivo (ADR-01) y la consola muestra el puesto en la
 *     cola en vez de rechazar. Conmutar de copropiedad no lo suelta.
 *  4. **No hay operador disponible** → la emergencia escala igual, y la cola
 *     marca en rojo lo que pasa del umbral de espera.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * G2 (15-N) · LA ATENCIÓN SE ABRE SOLA, Y NO SE LA QUITA A QUIEN YA ATIENDE
 *
 * Si el operador no atiende a nadie, lo primero de la cola pasa solo a
 * «Atención»: el selector de video cambia a ESE equipo y la vista en vivo se
 * abre sin clic, con su evidencia, la vivienda si se conoce, la espera y
 * Abrir / Negar con motivo sobre ese equipo. Si ya atiende a alguien, el nuevo
 * espera en la cola con su contador (`useAtencion`). La llamada del
 * videoportero es un elemento más de la cola (G3): ya no hay un aviso aparte
 * que se ponga delante.
 */

/** El motivo del motor en palabras; el de un evento de equipo ya viene en el título. */
const motivoEnPalabras = (motivo: string | null): string | null =>
  motivo === null ? null : (TEXTO_MOTIVO[motivo as MotivoAcceso] ?? motivo);

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
  atender,
}: {
  readonly copropiedadId: string;
  readonly nombreDeCopropiedad: string;
  /** G2 · el elemento que trae el aviso de otra pantalla (`?atender=…`). */
  readonly atender?: string | undefined;
}): JSX.Element => {
  const cola = useColaDeAtencion(copropiedadId);
  const clienteDeConsulta = useQueryClient();
  const { actual, enCola, atender: elegir } = useAtencion(cola.data, atender);
  const { llamadaDe } = useAtencionEnVivo();
  const [pidiendo, setPidiendo] = useState<'abrir' | 'negar' | 'emergencia' | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  // H-SITIO-13 · lo que el equipo contestó a la última orden, dicho sin adorno.
  const [ultimaOrden, setUltimaOrden] = useState<OrdenConResultado | null>(null);

  const lista = cola.data?.cola ?? [];

  /**
   * Lo que se atiende: el elemento de la cola en «Atención». Una llamada trae
   * la vivienda que declaró el equipo por el canal en vivo; un acceso, la del
   * padrón. El audio, la apertura y el aviso al residente van sobre SU equipo.
   */
  const llamada = actual?.disparador === 'llamada' ? llamadaDe(actual.dispositivoId) : undefined;
  const vivienda =
    actual === undefined
      ? null
      : (llamada?.vivienda ??
        (actual.viviendaId === null ? null : `Vivienda ${actual.viviendaId}`));
  const foco =
    actual === undefined
      ? undefined
      : {
          dispositivoId: actual.dispositivoId,
          viviendaId: actual.viviendaId ?? llamada?.viviendaId ?? null,
          eventoId: actual.eventoId as string | undefined,
          descripcion: `${ETIQUETA_DE_DISPARADOR[actual.disparador]} · ${
            vivienda ?? 'vivienda sin identificar'
          } · esperando ${String(actual.esperaSegundos)} s`,
        };

  const canal = useQuery({
    queryKey: ['guardia', copropiedadId, 'canal', foco?.dispositivoId],
    enabled: foco !== undefined,
    refetchInterval: 5000,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/guardia/intercom/{dispositivoId}', {
          params: { path: { id: copropiedadId, dispositivoId: foco?.dispositivoId ?? '' } },
        }),
      ),
  });

  const invalidar = (): void => {
    void clienteDeConsulta.invalidateQueries({ queryKey: ['guardia', copropiedadId] });
  };

  const alFallar = (e: unknown): void => {
    setError(e instanceof ErrorDeApi ? e.message : 'No se pudo completar. Vuelve a intentarlo.');
  };

  /**
   * Otros fallos (15-M) · el equipo viaja con la acción: al terminar una
   * llamada se suelta el canal del equipo de ESA llamada, aunque el foco ya
   * haya cambiado cuando la petición sale.
   */
  const audio = useMutation({
    mutationFn: async ({
      accion,
      dispositivoId,
    }: {
      accion: 'abrir' | 'cerrar';
      dispositivoId: string;
    }) =>
      desenvolver(
        accion === 'abrir'
          ? await cliente.POST('/copropiedades/{id}/guardia/intercom/abrir', {
              params: { path: { id: copropiedadId } },
              body: { dispositivoId },
            })
          : await cliente.POST('/copropiedades/{id}/guardia/intercom/cerrar', {
              params: { path: { id: copropiedadId } },
              body: { dispositivoId },
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
            dispositivoId: foco?.dispositivoId ?? '',
            accion: entrada.accion,
            motivo: entrada.motivo,
            // `exactOptionalPropertyTypes`: el campo se omite si no hay evento,
            // en vez de viajar como `undefined`. El DTO lo declara opcional, no
            // «opcional o nulo», y la diferencia la comprueba el compilador.
            ...(foco?.eventoId === undefined ? {} : { eventoId: foco.eventoId }),
          },
        }),
      ),
    onSuccess: (orden) => {
      setPidiendo(null);
      setError(undefined);
      setUltimaOrden(orden);
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
            ...(foco?.dispositivoId === undefined ? {} : { dispositivoId: foco.dispositivoId }),
          },
        }),
      ),
    onSuccess: () => {
      setPidiendo(null);
      setError(undefined);
    },
    onError: alFallar,
  });

  // O3 (15-N) · DT-15M-05 · a nombre de SU vivienda y del equipo que se
  // atiende. Sin vivienda no hay a quién avisar: el botón se apaga (antes se
  // mandaba la copropiedad como si fuera una vivienda).
  const viviendaDelFoco = foco?.viviendaId ?? null;
  const avisar = useMutation({
    mutationFn: async (viviendaId: string) =>
      desenvolver(
        await cliente.POST('/copropiedades/{id}/guardia/avisar-residente', {
          params: { path: { id: copropiedadId } },
          body: {
            viviendaId,
            ...(foco?.dispositivoId === undefined ? {} : { dispositivoId: foco.dispositivoId }),
            texto: 'Tienes una visita esperando en la portería',
          },
        }),
      ),
    onError: alFallar,
  });

  if (cola.isPending) return <EstadoCargando etiqueta="Cargando la guardia virtual" />;
  if (cola.isError) {
    const estado = cola.error instanceof ErrorDeApi ? cola.error.estado : 0;
    // H4 (15-L) · al portero fuera de las IP permitidas, el texto EXACTO de la API.
    if (estado === 403 && cola.error.message === MENSAJE_GUARDIA_REMOTA) {
      return (
        <EstadoSinPermiso titulo={MENSAJE_GUARDIA_REMOTA} descripcion={AYUDA_GUARDIA_REMOTA} />
      );
    }
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
            descripcion={
              actual === undefined
                ? `${String(cola.data?.total ?? 0)} esperando · más antigua ${String(cola.data?.esperaMaxima ?? 0)} s`
                : `${String(enCola)} en cola mientras atiendes · más antigua ${String(cola.data?.esperaMaxima ?? 0)} s`
            }
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
                descripcion="Las llamadas del videoportero, las personas y placas sin autorización, la lista negra y lo dudoso aparecen aquí, en vivo, la que más lleva esperando arriba."
              />
            ) : (
              <ul className="space-y-2">
                {lista.map((e) => (
                  <li key={e.eventoId}>
                    <button
                      type="button"
                      onClick={() => elegir(e.eventoId)}
                      aria-current={e.eventoId === actual?.eventoId}
                      className={
                        e.eventoId === actual?.eventoId
                          ? 'w-full rounded-boton border border-marca-texto bg-marca-suave px-3 py-2 text-left transition-colors duration-150 ease-salida motion-reduce:transition-none'
                          : 'w-full rounded-boton border border-borde px-3 py-2 text-left transition-colors duration-150 ease-salida [@media(hover:hover)and(pointer:fine)]:hover:border-marca-texto motion-reduce:transition-none'
                      }
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-secundario text-texto">
                          {ETIQUETA_DE_DISPARADOR[e.disparador]}
                          {e.placaDetectada === null ? '' : ` · ${e.placaDetectada}`}
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
                      <span
                        className={
                          e.urgencia === 'critica'
                            ? 'mt-1 block truncate text-distintivo text-peligro-texto'
                            : 'mt-1 block truncate text-distintivo text-texto-apagado'
                        }
                      >
                        {motivoEnPalabras(e.motivo) ?? e.titulo}
                      </span>
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
                foco === undefined ? 'Elige a quién atender en la cola.' : foco.descripcion
              }
              accion={
                actual === undefined ? undefined : (
                  <Distintivo tono={actual.urgencia === 'critica' ? 'peligro' : 'marca'}>
                    {actual.titulo}
                  </Distintivo>
                )
              }
            />
            <CuerpoDeTarjeta>
              {foco === undefined || actual === undefined ? (
                <EstadoVacio titulo="Nadie seleccionado" descripcion="La cola está vacía." />
              ) : (
                <div className="space-y-4">
                  {/* ── G2 · qué es, dónde, cuánto espera y con qué prueba ── */}
                  <dl className="grid gap-3 sm:grid-cols-3">
                    <DatoDeAtencion etiqueta="Qué pasa">
                      {motivoEnPalabras(actual.motivo) ?? actual.titulo}
                    </DatoDeAtencion>
                    <DatoDeAtencion etiqueta="Vivienda">
                      {vivienda ?? 'Sin vivienda identificada'}
                    </DatoDeAtencion>
                    <DatoDeAtencion etiqueta="Esperando">
                      <span className={actual.demorado ? 'font-semibold text-peligro-texto' : ''}>
                        {String(actual.esperaSegundos)} s
                      </span>
                    </DatoDeAtencion>
                    {actual.placaDetectada === null ? null : (
                      <DatoDeAtencion etiqueta="Placa leída">
                        <span className="font-mono tracking-wider">{actual.placaDetectada}</span>
                      </DatoDeAtencion>
                    )}
                  </dl>
                  {actual.conEvidencia ? (
                    <EvidenciaDeEvento copropiedadId={copropiedadId} eventoId={actual.eventoId} />
                  ) : actual.disparador === 'llamada' ? (
                    <p className="text-secundario text-texto-apagado">
                      La llamada no trae foto: la vista en vivo de ese equipo está abajo.
                    </p>
                  ) : null}

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
                      onClick={() =>
                        // Otros fallos (15-M) · «Salir de la cola» SUELTA el puesto
                        // en la cola; antes volvía a pedir el canal y el operador
                        // seguía esperando su turno.
                        audio.mutate({
                          accion: tienePalabra || esperandoTurno ? 'cerrar' : 'abrir',
                          dispositivoId: foco.dispositivoId,
                        })
                      }
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

                  {/* ── A4 · el audio en sí, sólo con la palabra y con transporte ── */}
                  {tienePalabra && canal.data?.transporte === 'equipo' ? (
                    <ControlesDeAudio
                      copropiedadId={copropiedadId}
                      dispositivoId={foco.dispositivoId}
                      formatoAnunciado={canal.data.formatoDeAudio}
                    />
                  ) : tienePalabra ? (
                    <p className="text-distintivo text-aviso-texto" role="status">
                      Tienes la palabra y no hay audio:{' '}
                      {canal.data?.detalleTransporte ?? 'sin transporte'}.
                    </p>
                  ) : null}

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
                      disabled={viviendaDelFoco === null}
                      {...(viviendaDelFoco === null
                        ? { title: 'Este elemento no tiene vivienda: no hay a quién avisar' }
                        : {})}
                      onClick={() => {
                        if (viviendaDelFoco !== null) avisar.mutate(viviendaDelFoco);
                      }}
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
                      Aviso registrado en Alertas. Todavía no le llega a la app del residente:
                      avísele por teléfono o por el citófono.
                    </p>
                  ) : null}
                  {emergencia.isSuccess ? (
                    <p aria-live="polite" className="text-secundario text-peligro-texto">
                      Emergencia escalada con severidad crítica.
                    </p>
                  ) : null}
                  {ultimaOrden !== null ? (
                    <p role="status" className="text-secundario text-texto-apagado">
                      Última orden: {resultadoDeOrden(ultimaOrden).texto}
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

          {/*
            C10 (15-M) · el VIDEO ya no cuelga del foco: cualquier cámara,
            terminal o videoportero activo, con apertura por equipo y motivo,
            y la línea de tiempo del equipo elegido. G2 (15-N) · lo que está en
            «Atención» propone SU equipo, y la vista en vivo se abre sin clic.
          */}
          <EquiposEnVivo
            copropiedadId={copropiedadId}
            propuesto={foco?.dispositivoId}
            eventoId={foco?.eventoId}
          />
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

const DatoDeAtencion = ({
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
