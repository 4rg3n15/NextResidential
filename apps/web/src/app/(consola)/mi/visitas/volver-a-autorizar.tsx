'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { Campo } from '@/componentes/ui/campo';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import type { VisitanteReciente } from '@/lib/api/residente';
import { ahoraLocal, fechaCorta } from '@/lib/fechas';
import { DURACIONES } from '../../visitantes/generar-autorizacion';
import { CasillaDeLaFoto, desenlaceDe } from './casilla';

const CLASE_DE_SELECT =
  'h-11 w-full rounded-campo border border-borde bg-campo px-3 text-cuerpo text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto';

/**
 * «Volver a autorizar» (F6): para quien vuelve se reutilizan nombre, documento,
 * placa y foto de su autorización anterior; sólo se dice cuándo viene y se
 * marca la casilla otra vez (C-42). El visitante viaja en la RUTA desde su
 * tarjeta: nadie teclea un identificador.
 */
export const VolverAAutorizar = ({
  copropiedadId,
  visitante,
  alCerrar,
  alRegistrar,
}: {
  readonly copropiedadId: string;
  readonly visitante: VisitanteReciente | null;
  readonly alCerrar: () => void;
  readonly alRegistrar: () => void;
}): JSX.Element => {
  const inicial = ahoraLocal();
  const [fecha, setFecha] = useState(inicial.fecha);
  const [hora, setHora] = useState(inicial.hora);
  const [duracion, setDuracion] = useState(120);
  const [casilla, setCasilla] = useState(false);
  const [clave, setClave] = useState(() => globalThis.crypto.randomUUID());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [exito, setExito] = useState<string | null>(null);

  const completo = visitante !== null && casilla && fecha !== '' && hora !== '';

  const cerrar = (): void => {
    setCasilla(false);
    setError(undefined);
    setExito(null);
    setClave(globalThis.crypto.randomUUID());
    alCerrar();
  };

  const autorizar = async (): Promise<void> => {
    if (visitante === null || !completo) return;
    setEnviando(true);
    setError(undefined);
    setExito(null);
    try {
      const r = desenvolver(
        await cliente.POST('/copropiedades/{id}/mi/visitas/{autorizacionId}/repeticion', {
          params: { path: { id: copropiedadId, autorizacionId: visitante.autorizacionId } },
          body: {
            inicio: new Date(`${fecha}T${hora}:00`).toISOString(),
            duracionMinutos: duracion,
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
      setCasilla(false);
      setClave(globalThis.crypto.randomUUID());
      alRegistrar();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No hay conexión con el servidor.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogoDeFormulario
      abierto={visitante !== null}
      titulo="Volver a autorizar"
      descripcion="Se usan de nuevo su nombre, su documento, su placa y su foto. Sólo falta decir cuándo viene."
      etiquetaEnviar={enviando ? 'Autorizando…' : 'Autorizar de nuevo'}
      enviando={enviando}
      error={error}
      puedeEnviar={completo && !enviando}
      alEnviar={() => void autorizar()}
      alCancelar={cerrar}
    >
      {visitante !== null ? (
        <div className="rounded-md border border-borde p-3">
          <p className="font-medium text-texto">{visitante.visitante}</p>
          <p className="text-secundario text-texto-apagado">
            {[
              `Documento ${visitante.documento}`,
              visitante.placa === null ? null : `placa ${visitante.placa}`,
              `vino el ${fechaCorta(visitante.ultimaVisita)}`,
            ]
              .filter((x): x is string => x !== null)
              .join(' · ')}
          </p>
        </div>
      ) : null}
      {exito !== null ? (
        <p role="status" className="rounded-md border border-borde p-3 text-secundario text-texto">
          {exito}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
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
        <label className="block space-y-1.5 sm:col-span-2">
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
        <div className="sm:col-span-2">
          <CasillaDeLaFoto
            nombre={visitante?.visitante ?? ''}
            marcada={casilla}
            alCambiar={setCasilla}
          />
        </div>
        {!casilla ? (
          <p className="text-secundario text-texto-apagado sm:col-span-2">
            Falta: marcar la casilla.
          </p>
        ) : null}
      </div>
    </DialogoDeFormulario>
  );
};
