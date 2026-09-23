'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ResultadoDeSondeo, TipoDeEquipo } from '@ncr/contracts';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';

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

export const AltaDeEquipo = ({
  copropiedadId,
  abierto,
  alCerrar,
}: {
  readonly copropiedadId: string;
  readonly abierto: boolean;
  readonly alCerrar: () => void;
}): JSX.Element => {
  const clientes = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoDeEquipo>('camara_lpr');
  const [host, setHost] = useState('');
  const [puerto, setPuerto] = useState('80');
  const [protocolo, setProtocolo] = useState<'http' | 'https'>('http');
  const [usuario, setUsuario] = useState('');
  const [secreto, setSecreto] = useState('');
  const [especifico, setEspecifico] = useState('1');
  const [sondeo, setSondeo] = useState<ResultadoDeSondeo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const campoEspecifico = ESPECIFICO[tipo];

  const cuerpo = (): Record<string, unknown> => ({
    nombre: nombre.trim(),
    tipo,
    host: host.trim(),
    puerto: numero(puerto) ?? 80,
    protocolo,
    usuario: usuario.trim(),
    ...(secreto === '' ? {} : { secreto }),
    ...(campoEspecifico === null ? {} : { [campoEspecifico.clave]: numero(especifico) ?? 1 }),
  });

  const completo =
    nombre.trim() !== '' && host.trim() !== '' && usuario.trim() !== '' && secreto !== '';

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
      desenvolver(
        await cliente.POST('/copropiedades/{id}/equipos', {
          params: { path: { id: copropiedadId } },
          // Ya se probó: no se vuelve a sondear al guardar. Un segundo intento
          // con la credencial equivocada acerca el bloqueo de la cuenta.
          body: { ...cuerpo(), probarConexion: sondeo === null } as never,
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
      titulo="Agregar equipo"
      descripcion="Los datos de conexión del aparato. La clave se guarda cifrada y el sistema no vuelve a mostrarla."
      etiquetaEnviar="Guardar equipo"
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
          etiqueta="Dirección del equipo"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          ayuda="La IP fija del aparato en la red del conjunto."
          required
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
        etiqueta="Usuario del equipo"
        value={usuario}
        onChange={(e) => setUsuario(e.target.value)}
        ayuda="Use un usuario de servicio con el mínimo privilegio, no el de fábrica."
        required
      />
      <Campo
        etiqueta="Clave del equipo"
        type="password"
        autoComplete="new-password"
        value={secreto}
        onChange={(e) => setSecreto(e.target.value)}
        ayuda="Se guarda cifrada y no vuelve a mostrarse. Para volver a probar la conexión más adelante habrá que escribirla otra vez."
        required
      />

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
      </aside>

      <div className="flex items-center gap-2">
        <Boton
          variante="secundario"
          tamano="sm"
          type="button"
          disabled={!completo || enviando}
          onClick={() => void probar()}
        >
          Probar conexión
        </Boton>
        <span className="text-secundario text-texto-apagado">
          La prueba la hace el servidor, no este navegador.
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
    </DialogoDeFormulario>
  );
};
