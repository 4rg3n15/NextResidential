'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Equipo, ResultadoDeSondeo, TipoDeEquipo } from '@ncr/contracts';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { motivoDeRechazo } from '@/lib/equipos/caracteres-admitidos';
import { FichaDeEquipo } from './ficha-del-equipo';

/**
 * Alta de un equipo desde la consola — A.1, A.3, A.4 y A.5.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE SE PIDE POR TIPO, Y POR QUÉ NO SE PIDE TODO SIEMPRE
 *
 * Una cámara LPR no tiene canal de audio y un videoportero no tiene número de
 * relé. Enseñar los seis campos a todo el mundo obliga a adivinar cuáles
 * aplican, y lo que se rellena por si acaso se rellena mal.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA CLAVE NO VUELVE, Y LA PANTALLA LO DICE
 *
 * El contrato no declara `secreto` en la respuesta, así que aquí no hay nada
 * que ocultar: no llega. La consecuencia práctica —que para volver a probar la
 * conexión hay que teclearla otra vez— se explica en pantalla en vez de
 * dejar que parezca un fallo.
 */

const TIPOS: readonly (readonly [TipoDeEquipo, string])[] = [
  ['camara_lpr', 'Cámara LPR — lee placas y reporta'],
  ['terminal_facial', 'Terminal facial — reconoce rostros'],
  ['intercom', 'Videoportero — audio y video con la central'],
  ['rele', 'Relé o barrera — abre y cierra'],
  ['controlador_io', 'Controlador de entradas y salidas'],
];

/** Qué campo específico pide cada tipo. Uno, y el que corresponde. */
const ESPECIFICO: Readonly<
  Record<
    TipoDeEquipo,
    {
      readonly clave: 'canalBarrera' | 'numeroDePuerta' | 'canalDeAudio';
      readonly etiqueta: string;
      readonly ayuda: string;
    } | null
  >
> = {
  camara_lpr: {
    clave: 'canalBarrera',
    etiqueta: 'Canal de la barrera',
    ayuda: 'Cuál de las barreras del equipo manda esta cámara. Normalmente 1.',
  },
  rele: {
    clave: 'numeroDePuerta',
    etiqueta: 'Número de puerta o relé',
    ayuda: 'El número que el equipo asigna a la salida que abre. Normalmente 1.',
  },
  terminal_facial: {
    clave: 'numeroDePuerta',
    etiqueta: 'Número de puerta',
    ayuda: 'La puerta que abre la terminal cuando el sistema lo autoriza.',
  },
  intercom: {
    clave: 'canalDeAudio',
    etiqueta: 'Canal de audio',
    ayuda: 'El canal de audio bidireccional del videoportero. Normalmente 1.',
  },
  controlador_io: null,
};

const VERDE = 'border-exito bg-exito-suave text-exito-texto';
const ROJO = 'border-peligro bg-peligro-suave text-peligro-texto';
const AMBAR = 'border-aviso bg-aviso-suave text-aviso-texto';

/** Cada clase de resultado con su color y su palabra. El color no va solo. */
const TONO: Readonly<Record<string, string>> = {
  alcanzado: VERDE,
  decide_solo: ROJO,
  credencial: ROJO,
  inalcanzable: AMBAR,
};

const numero = (texto: string): number | undefined => {
  const n = Number(texto.trim());
  return texto.trim() === '' || !Number.isFinite(n) ? undefined : n;
};

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * O4 · EL MISMO DIÁLOGO DA DE ALTA Y EDITA
 *
 * Con `equipo` es edición: los campos llegan rellenos, la clave se deja en
 * blanco para CONSERVAR la guardada —el sistema sondea con ella en el servidor,
 * sin que nadie la vea— y sólo se reescribe para rotarla. Un segundo formulario
 * habría duplicado los seis campos y sus avisos, y uno de los dos se quedaría
 * atrás en la primera corrección.
 */
export const AltaDeEquipo = ({
  copropiedadId,
  abierto,
  alCerrar,
  equipo = null,
}: {
  readonly copropiedadId: string;
  readonly abierto: boolean;
  readonly alCerrar: () => void;
  /** Con un equipo, el diálogo EDITA. */
  readonly equipo?: Equipo | null;
}): JSX.Element => {
  const clientes = useQueryClient();
  const editando = equipo !== null;
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoDeEquipo>('camara_lpr');
  const [host, setHost] = useState('');
  const [puerto, setPuerto] = useState('80');
  const [protocolo, setProtocolo] = useState<'http' | 'https'>('http');
  const [usuario, setUsuario] = useState('');
  const [secreto, setSecreto] = useState('');
  const [especifico, setEspecifico] = useState('1');
  const [fabricante, setFabricante] = useState('');
  const [modoDeTerminal, setModoDeTerminal] = useState<'reporta_y_espera' | 'decide_el_equipo'>(
    'reporta_y_espera',
  );
  const [canalDeAudioHabilitado, setCanalDeAudioHabilitado] = useState(false);
  const [sondeo, setSondeo] = useState<ResultadoDeSondeo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // Al abrir en edición, los campos se rellenan con lo guardado (nunca la clave).
  useEffect(() => {
    if (!abierto) return;
    setNombre(equipo?.nombre ?? '');
    setTipo(equipo?.tipo ?? 'camara_lpr');
    // La dirección, el puerto, el protocolo y el usuario NO llegan al navegador
    // (§7.1): al editar arrancan en blanco y en blanco significan «conserva lo
    // guardado». Sólo se escriben para cambiarlos.
    setHost('');
    setPuerto(editando ? '' : '80');
    setProtocolo('http');
    setUsuario('');
    setSecreto('');
    setFabricante(equipo?.fabricante ?? '');
    setModoDeTerminal(equipo?.modoDeTerminal ?? 'reporta_y_espera');
    setCanalDeAudioHabilitado(equipo?.canalDeAudioHabilitado ?? false);
    setEspecifico(
      String(equipo?.canalBarrera ?? equipo?.numeroDePuerta ?? equipo?.canalDeAudio ?? 1),
    );
    setSondeo(null);
    setError(undefined);
  }, [abierto, equipo]);

  const campoEspecifico = ESPECIFICO[tipo];

  const cuerpo = (): Record<string, unknown> => ({
    nombre: nombre.trim(),
    tipo,
    // Al editar, lo vacío no viaja: el servidor conserva lo guardado (§6.1).
    ...(editando && host.trim() === '' ? {} : { host: host.trim() }),
    ...(editando && puerto.trim() === '' ? {} : { puerto: numero(puerto) ?? 80 }),
    ...(editando && host.trim() === '' ? {} : { protocolo }),
    ...(editando && usuario.trim() === '' ? {} : { usuario: usuario.trim() }),
    ...(secreto === '' ? {} : { secreto }),
    ...(campoEspecifico === null ? {} : { [campoEspecifico.clave]: numero(especifico) ?? 1 }),
    ...(fabricante.trim() === '' ? {} : { fabricante: fabricante.trim() }),
    ...(tipo === 'terminal_facial' ? { modoDeTerminal } : {}),
    ...(tipo === 'intercom' ? { canalDeAudioHabilitado } : {}),
  });

  /**
   * Se comprueba AQUÍ lo que el equipo va a rechazar. No es cortesía de UX: un
   * carácter no admitido llega como «el equipo rechazó la credencial», que es
   * el mensaje de una clave equivocada, y el operador vuelve a intentarlo —
   * hasta que el aparato le bloquea la cuenta.
   */
  const rechazoDeNombre = nombre === '' ? null : motivoDeRechazo('nombre', nombre.trim());
  const rechazoDeUsuario = usuario === '' ? null : motivoDeRechazo('usuario', usuario.trim());
  const rechazoDeClave = secreto === '' ? null : motivoDeRechazo('clave', secreto);

  const completo =
    nombre.trim() !== '' &&
    // Al editar, dirección, usuario y clave en blanco CONSERVAN lo guardado.
    (editando || host.trim() !== '') &&
    (editando || usuario.trim() !== '') &&
    (editando || secreto !== '') &&
    rechazoDeNombre === null &&
    rechazoDeUsuario === null &&
    rechazoDeClave === null;

  const probar = async (): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      setSondeo(
        desenvolver(
          await cliente.POST('/copropiedades/{id}/equipos/prueba-de-conexion', {
            params: { path: { id: copropiedadId } },
            body: cuerpo() as never,
          }),
        ),
      );
    } catch (e) {
      setSondeo(null);
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo probar la conexión');
    } finally {
      setEnviando(false);
    }
  };

  const guardar = async (): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      // Ya se probó: no se vuelve a sondear al guardar. Un segundo intento
      // con la credencial equivocada acerca el bloqueo de la cuenta.
      const body = { ...cuerpo(), probarConexion: sondeo === null } as never;
      desenvolver(
        equipo === null
          ? await cliente.POST('/copropiedades/{id}/equipos', {
              params: { path: { id: copropiedadId } },
              body,
            })
          : await cliente.PUT('/copropiedades/{id}/equipos/{equipoId}', {
              params: { path: { id: copropiedadId, equipoId: equipo.id } },
              body,
            }),
      );
      await clientes.invalidateQueries({ queryKey: ['dispositivos', copropiedadId] });
      setSondeo(null);
      setSecreto('');
      alCerrar();
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo guardar el equipo');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogoDeFormulario
      abierto={abierto}
      titulo={editando ? `Editar ${equipo.nombre}` : 'Agregar equipo'}
      descripcion={
        editando
          ? 'Deje la clave en blanco para conservar la guardada: al guardar, el servidor vuelve a sondear el equipo con ella. Escríbala sólo para rotarla.'
          : 'Los datos de conexión del aparato. La clave se guarda cifrada y el sistema no vuelve a mostrarla.'
      }
      etiquetaEnviar={editando ? 'Guardar cambios' : 'Guardar equipo'}
      enviando={enviando}
      error={error}
      puedeEnviar={completo}
      alEnviar={() => void guardar()}
      alCancelar={() => {
        setSondeo(null);
        alCerrar();
      }}
    >
      <Campo
        etiqueta="Nombre del equipo"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        ayuda="Cómo lo llaman aquí: «Cámara de la entrada», «Torniquete del gimnasio»."
        required
        {...(rechazoDeNombre === null ? {} : { error: rechazoDeNombre })}
      />

      <div className="space-y-1.5">
        <label htmlFor="tipo-de-equipo" className="block text-secundario font-medium text-texto">
          Tipo de equipo
        </label>
        <select
          id="tipo-de-equipo"
          value={tipo}
          onChange={(e) => {
            setTipo(e.target.value as TipoDeEquipo);
            setSondeo(null);
          }}
          className="h-11 w-full rounded-campo border border-borde bg-campo px-3 text-cuerpo text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
        >
          {TIPOS.map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <Campo
          etiqueta={editando ? 'Nueva dirección del equipo (opcional)' : 'Dirección del equipo'}
          value={host}
          onChange={(e) => setHost(e.target.value)}
          ayuda={
            editando
              ? 'La guardada no se muestra: el navegador nunca conoce la red del conjunto. En blanco se conserva.'
              : 'La IP fija del aparato en la red del conjunto. No vuelve a mostrarse: con el equipo habla el servidor.'
          }
          required={!editando}
        />
        <Campo
          etiqueta="Puerto"
          type="number"
          min={1}
          max={65535}
          value={puerto}
          onChange={(e) => setPuerto(e.target.value)}
        />
      </div>

      <fieldset className="space-y-1.5">
        <legend className="block text-secundario font-medium text-texto">Protocolo</legend>
        <div className="flex gap-4">
          {(
            [
              ['http', 'HTTP — es lo que usan estos equipos'],
              ['https', 'HTTPS — solo si el modelo lo trae'],
            ] as const
          ).map(([valor, texto]) => (
            <label key={valor} className="flex items-center gap-2 text-secundario text-texto">
              <input
                type="radio"
                name="protocolo-del-equipo"
                checked={protocolo === valor}
                onChange={() => {
                  setProtocolo(valor);
                  setSondeo(null);
                }}
              />
              {texto}
            </label>
          ))}
        </div>
      </fieldset>

      <Campo
        etiqueta={editando ? 'Nuevo usuario del equipo (opcional)' : 'Usuario del equipo'}
        value={usuario}
        onChange={(e) => setUsuario(e.target.value)}
        ayuda={
          editando
            ? 'En blanco se conserva el guardado.'
            : 'Use un usuario de servicio con el mínimo privilegio, no el de fábrica: la guía del fabricante define un perfil de OPERADOR, y es el que hace falta.'
        }
        required={!editando}
        {...(rechazoDeUsuario === null ? {} : { error: rechazoDeUsuario })}
      />
      <Campo
        etiqueta={editando ? 'Nueva clave del equipo (opcional)' : 'Clave del equipo'}
        type="password"
        autoComplete="new-password"
        value={secreto}
        onChange={(e) => setSecreto(e.target.value)}
        ayuda={
          editando
            ? 'En blanco conserva la guardada. El sistema nunca la muestra: para sondear usa la que tiene en el servidor.'
            : 'Se guarda cifrada y no vuelve a mostrarse. Para volver a sondear el equipo más adelante el sistema usa la guardada.'
        }
        required={!editando}
        {...(rechazoDeClave === null ? {} : { error: rechazoDeClave })}
      />
      <Campo
        etiqueta="Fabricante (informativo)"
        value={fabricante}
        onChange={(e) => setFabricante(e.target.value)}
        ayuda="Sólo se muestra y se audita. Ninguna decisión del sistema mira la marca: mira lo que el equipo declara poder hacer."
      />
      {tipo === 'terminal_facial' ? (
        <fieldset className="space-y-1.5">
          <legend className="block text-secundario font-medium text-texto">
            Quién decide en la terminal
          </legend>
          {(
            [
              ['reporta_y_espera', 'Reporta y espera el veredicto de la plataforma (lo exigido)'],
              [
                'decide_el_equipo',
                'Decide el equipo — declarado a sabiendas; la traza queda incompleta',
              ],
            ] as const
          ).map(([valor, texto]) => (
            <label key={valor} className="flex items-start gap-2 text-secundario text-texto">
              <input
                type="radio"
                name="modo-de-terminal"
                checked={modoDeTerminal === valor}
                onChange={() => setModoDeTerminal(valor)}
              />
              {texto}
            </label>
          ))}
        </fieldset>
      ) : null}
      {tipo === 'intercom' ? (
        <label className="flex items-start gap-2 text-secundario text-texto">
          <input
            type="checkbox"
            checked={canalDeAudioHabilitado}
            onChange={(e) => setCanalDeAudioHabilitado(e.target.checked)}
            className="mt-1 h-4 w-4 accent-marca"
          />
          <span>
            Una persona habilitó el canal de audio EN EL APARATO (ADR-01)
            <span className="block text-texto-apagado">
              El sistema no lo habilita solo; el sondeo comprueba si el equipo lo declara.
            </span>
          </span>
        </label>
      ) : null}

      {campoEspecifico === null ? null : (
        <Campo
          etiqueta={campoEspecifico.etiqueta}
          type="number"
          min={1}
          max={16}
          value={especifico}
          onChange={(e) => setEspecifico(e.target.value)}
          ayuda={campoEspecifico.ayuda}
        />
      )}

      {/*
        A.5 · EL AVISO QUE TIENE QUE ESTAR EN LA PANTALLA, NO EN UNA GUÍA.
        Quien rellena esto está delante del formulario, no leyendo documentación.
      */}
      <aside className="rounded-md border border-borde bg-lienzo px-3 py-2 text-secundario text-texto-apagado">
        <p className="font-medium text-texto">Quién tiene que alcanzar el equipo</p>
        <p>
          No es este navegador: es el <strong>servidor</strong> de Next Control. Hoy eso exige que
          el servidor esté en la misma red que el aparato; si está fuera, la conexión pasa por el
          Edge Gateway del conjunto.
        </p>
        <p className="mt-1">
          El equipo necesita <strong>dirección IP fija</strong>. Con IP asignada automáticamente, el
          aparato cambia de dirección al reiniciar el router y el sistema deja de encontrarlo.
        </p>
        <p className="mt-1">
          Estos equipos traen <strong>HTTPS activo de fábrica con certificado autofirmado</strong>.
          Next Control lo tolera <em>para este equipo</em> sin desactivar la verificación de
          certificados en el resto del proceso: apagarla globalmente por un aparato dejaría sin
          protección todas las demás conexiones salientes.
        </p>
      </aside>

      <div className="flex items-center gap-2">
        <Boton
          variante="secundario"
          tamano="sm"
          type="button"
          disabled={!completo || enviando || editando}
          onClick={() => void probar()}
        >
          Probar conexión
        </Boton>
        <span className="text-secundario text-texto-apagado">
          {editando
            ? 'Al guardar, el servidor vuelve a sondear el equipo con lo guardado y lo que cambie aquí.'
            : 'La prueba la hace el servidor, no este navegador.'}
        </span>
      </div>

      {sondeo === null ? null : (
        <p
          role="status"
          className={`rounded-md border px-3 py-2 text-secundario ${TONO[sondeo.clase] ?? AMBAR}`}
        >
          {sondeo.detalle}
          {sondeo.clase === 'alcanzado' || sondeo.clase === 'decide_solo' ? null : (
            <span className="mt-1 block">
              Puede guardarlo igualmente: quedará marcado como <strong>no verificado</strong> con
              este mismo motivo, y se comprueba cuando el equipo esté disponible.
            </span>
          )}
        </p>
      )}

      {/*
        LA FICHA · qué hay que cambiar, campo por campo.
        No lleva botón de corrección: el equipo todavía no está guardado, así que
        no hay contra qué identificarlo ni dónde dejar constancia de quién lo
        corrigió. Se corrige desde su ficha, ya dado de alta.
      */}
      {sondeo?.ficha === undefined ? null : <FichaDeEquipo ficha={sondeo.ficha} />}
    </DialogoDeFormulario>
  );
};
