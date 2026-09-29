'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { CapturaDeFoto } from '@/componentes/captura-de-foto';
import type { FotoLista } from '@/componentes/captura-de-foto';
import { Campo } from '@/componentes/ui/campo';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { ahoraLocal } from '@/lib/fechas';
import { DURACIONES } from '../../visitantes/generar-autorizacion';
import { CasillaDeLaFoto, desenlaceDe } from './casilla';

const CLASE_DE_SELECT =
  'h-11 w-full rounded-campo border border-borde bg-campo px-3 text-cuerpo text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto';

/** La misma clave para cada reintento del MISMO formulario (RN-17); una nueva por visita. */
const nuevaClave = (): string => globalThis.crypto.randomUUID();

/**
 * M-4 · «Nuevo visitante», los mismos campos y el mismo flujo que la app:
 * nombre, documento, cuándo viene y cuánto dura, placa opcional, observaciones
 * para la portería, la foto (reducida y medida en este navegador, con la misma
 * captura que «Generar autorización») y la casilla. Sin foto que sirva o sin
 * casilla no se envía nada. Un rechazo de negocio llega como 200 con motivo.
 */
export const NuevaVisita = ({
  copropiedadId,
  abierto,
  alCerrar,
  alRegistrar,
}: {
  readonly copropiedadId: string;
  readonly abierto: boolean;
  readonly alCerrar: () => void;
  readonly alRegistrar: () => void;
}): JSX.Element => {
  const inicial = ahoraLocal();
  const [nombre, setNombre] = useState('');
  const [documento, setDocumento] = useState('');
  const [fecha, setFecha] = useState(inicial.fecha);
  const [hora, setHora] = useState(inicial.hora);
  const [duracion, setDuracion] = useState(120);
  const [placa, setPlaca] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [foto, setFoto] = useState<FotoLista | null>(null);
  const [casilla, setCasilla] = useState(false);
  const [clave, setClave] = useState(nuevaClave);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [exito, setExito] = useState<string | null>(null);
  /** La captura se vuelve a montar para vaciarla al registrar otra. */
  const [ronda, setRonda] = useState(0);

  const placaNormalizada = placa.toUpperCase().replace(/[\s-]/g, '');
  const faltan = [
    nombre.trim().length < 3 ? 'el nombre' : null,
    documento.trim().length < 4 ? 'el documento' : null,
    fecha === '' || hora === '' ? 'cuándo viene' : null,
    placaNormalizada.length > 8 ? 'una placa de 8 caracteres o menos' : null,
    foto === null ? 'una foto que sirva' : null,
    casilla ? null : 'marcar la casilla',
  ].filter((x): x is string => x !== null);
  const completo = faltan.length === 0;

  const limpiar = (): void => {
    setNombre('');
    setDocumento('');
    setPlaca('');
    setObservaciones('');
    setFoto(null);
    setCasilla(false);
    setError(undefined);
    setClave(nuevaClave());
    setRonda((r) => r + 1);
  };

  const cerrar = (): void => {
    limpiar();
    setExito(null);
    alCerrar();
  };

  const registrar = async (): Promise<void> => {
    if (!completo || foto === null) return;
    setEnviando(true);
    setError(undefined);
    setExito(null);
    try {
      const r = desenvolver(
        await cliente.POST('/copropiedades/{id}/mi/visitas', {
          params: { path: { id: copropiedadId } },
          body: {
            nombre: nombre.trim(),
            documento: documento.trim(),
            inicio: new Date(`${fecha}T${hora}:00`).toISOString(),
            duracionMinutos: duracion,
            placa: placaNormalizada === '' ? null : placaNormalizada,
            observaciones: observaciones.trim() === '' ? null : observaciones.trim(),
            foto,
            casillaMarcada: casilla,
            claveDeIdempotencia: clave,
          },
        }),
      );
      const desenlace = desenlaceDe(r);
      if (desenlace.error !== undefined) {
        setError(desenlace.error);
        return;
      }
      setExito(desenlace.exito ?? null);
      limpiar();
      alRegistrar();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No hay conexión con el servidor.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogoDeFormulario
      abierto={abierto}
      titulo="Nuevo visitante"
      descripcion="La visita queda autorizada al registrarla y la portería ya puede verla."
      etiquetaEnviar={enviando ? 'Registrando…' : 'Registrar visita'}
      enviando={enviando}
      error={error}
      puedeEnviar={completo && !enviando}
      alEnviar={() => void registrar()}
      alCancelar={cerrar}
    >
      {exito !== null ? (
        <p role="status" className="rounded-md border border-borde p-3 text-secundario text-texto">
          {exito}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          etiqueta="Nombre del visitante"
          name="nombre"
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          ayuda="Como aparece en su documento."
        />
        <Campo
          etiqueta="Número de documento"
          name="documento"
          required
          value={documento}
          onChange={(e) => setDocumento(e.target.value)}
          ayuda="Con él, el conjunto comprueba que no esté en la lista negra."
        />
        <Campo
          etiqueta="Fecha de la visita"
          name="fecha"
          type="date"
          required
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
        <Campo
          etiqueta="Hora de llegada"
          name="hora"
          type="time"
          required
          value={hora}
          onChange={(e) => setHora(e.target.value)}
        />
        <label className="block space-y-1.5">
          <span className="block text-secundario font-medium text-texto">Duración</span>
          <select
            name="duracion"
            value={duracion}
            onChange={(e) => setDuracion(Number(e.target.value))}
            className={CLASE_DE_SELECT}
          >
            {DURACIONES.map((d) => (
              <option key={d.minutos} value={d.minutos}>
                {d.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <Campo
          etiqueta="Placa (opcional)"
          name="placa"
          value={placa}
          onChange={(e) => setPlaca(e.target.value.toUpperCase())}
          ayuda="Sólo si entra en vehículo. Se guarda en mayúsculas, sin espacios ni guiones."
        />
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="block text-secundario font-medium text-texto">
            Observaciones para la portería (opcional)
          </span>
          <textarea
            name="observaciones"
            rows={3}
            maxLength={1000}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            className="w-full rounded-campo border border-borde bg-campo px-3 py-2 text-cuerpo text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
          />
        </label>
        <div className="sm:col-span-2">
          <CapturaDeFoto key={ronda} alCambiar={setFoto} />
        </div>
        <div className="sm:col-span-2">
          <CasillaDeLaFoto nombre={nombre} marcada={casilla} alCambiar={setCasilla} />
        </div>
        {!completo ? (
          <p className="text-secundario text-texto-apagado sm:col-span-2">
            Falta: {faltan.join(', ')}.
          </p>
        ) : null}
      </div>
    </DialogoDeFormulario>
  );
};
