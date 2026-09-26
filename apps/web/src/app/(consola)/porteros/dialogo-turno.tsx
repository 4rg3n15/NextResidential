'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Portero, TurnoDePorteria, TurnoGuardado } from '@ncr/contracts';
import { Campo } from '@/componentes/ui/campo';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { cliente, desenvolver } from '@/lib/api/cliente';

const SELECT =
  'w-full rounded-campo border border-borde bg-campo px-3 py-2 text-cuerpo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto';
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * ASIGNAR O EDITAR UN TURNO (B4). El día y las horas son de la copropiedad; si
 * la hora de fin no es posterior a la de inicio, el turno termina al día
 * siguiente y el formulario lo dice. Un turno EXTRA exige motivo. Los solapes
 * con otro portero de la misma portería se permiten: la respuesta los cuenta
 * y el panel los enseña, porque un relevo que se cruza es normal y uno que se
 * cruza por error se ve ahí.
 */
export const DialogoDeTurno = ({
  copropiedadId,
  abierto,
  turno,
  diaInicial,
  porteros,
  alCerrar,
  alGuardar,
}: {
  readonly copropiedadId: string;
  readonly abierto: boolean;
  readonly turno: TurnoDePorteria | null;
  readonly diaInicial: string;
  readonly porteros: readonly Portero[];
  readonly alCerrar: () => void;
  readonly alGuardar: (r: TurnoGuardado) => void;
}): JSX.Element => {
  const consultas = useQueryClient();
  const [porteroId, setPorteroId] = useState('');
  const [dia, setDia] = useState(diaInicial);
  const [inicio, setInicio] = useState('06:00');
  const [fin, setFin] = useState('14:00');
  const [tipo, setTipo] = useState<'programado' | 'extra'>('programado');
  const [motivo, setMotivo] = useState('');
  const [porteria, setPorteria] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setPorteroId(turno?.porteroId ?? porteros[0]?.usuarioId ?? '');
    setDia(turno?.dia ?? diaInicial);
    setInicio(turno?.horaInicio ?? '06:00');
    setFin(turno?.horaFin ?? '14:00');
    setTipo(turno?.tipo ?? 'programado');
    setMotivo(turno?.motivo ?? '');
    setPorteria(turno?.porteria ?? '');
    setError(undefined);
  }, [abierto, turno, diaInicial, porteros]);

  const cruza = HORA.test(inicio) && HORA.test(fin) && fin <= inicio;
  const valido =
    porteroId !== '' &&
    /^\d{4}-\d{2}-\d{2}$/.test(dia) &&
    HORA.test(inicio) &&
    HORA.test(fin) &&
    inicio !== fin &&
    (tipo === 'programado' || motivo.trim().length >= 5);

  const enviar = async (): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    const cuerpo = {
      porteroId,
      dia,
      horaInicio: inicio,
      horaFin: fin,
      tipo,
      ...(motivo.trim() === '' ? {} : { motivo: motivo.trim() }),
      ...(porteria.trim() === '' ? {} : { porteria: porteria.trim() }),
    };
    try {
      const r =
        turno === null
          ? desenvolver(
              await cliente.POST('/copropiedades/{id}/turnos', {
                params: { path: { id: copropiedadId } },
                body: cuerpo,
              }),
            )
          : desenvolver(
              await cliente.PUT('/copropiedades/{id}/turnos/{turnoId}', {
                params: { path: { id: copropiedadId, turnoId: turno.id } },
                body: cuerpo,
              }),
            );
      await consultas.invalidateQueries({ queryKey: ['porteria', copropiedadId] });
      alGuardar(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el turno.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogoDeFormulario
      abierto={abierto}
      titulo={turno === null ? 'Asignar turno' : 'Editar turno'}
      descripcion="Horas de la copropiedad. Sólo el superadministrador asigna turnos, y queda en la bitácora."
      etiquetaEnviar={turno === null ? 'Asignar' : 'Guardar'}
      enviando={enviando}
      error={error}
      puedeEnviar={valido}
      alEnviar={() => void enviar()}
      alCancelar={alCerrar}
    >
      <div className="space-y-3">
        <label className="block space-y-1.5">
          <span className="block text-secundario font-medium">Portero</span>
          <select
            value={porteroId}
            onChange={(e) => setPorteroId(e.target.value)}
            className={SELECT}
          >
            {porteros.map((p) => (
              <option key={p.usuarioId} value={p.usuarioId}>
                {p.nombre}
                {p.usuario === null ? '' : ` · ${p.usuario}`}
              </option>
            ))}
          </select>
        </label>
        <Campo
          etiqueta="Día"
          name="dia"
          type="date"
          required
          value={dia}
          onChange={(e) => setDia(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Campo
            etiqueta="Desde"
            name="horaInicio"
            type="time"
            required
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
          <Campo
            etiqueta="Hasta"
            name="horaFin"
            type="time"
            required
            value={fin}
            onChange={(e) => setFin(e.target.value)}
            ayuda={cruza ? 'Cruza la medianoche: termina al día siguiente.' : undefined}
          />
        </div>
        <label className="block space-y-1.5">
          <span className="block text-secundario font-medium">Tipo</span>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as 'programado' | 'extra')}
            className={SELECT}
          >
            <option value="programado">Programado</option>
            <option value="extra">Extra (con motivo)</option>
          </select>
        </label>
        {tipo === 'extra' ? (
          <Campo
            etiqueta="Motivo del turno extra"
            name="motivo"
            required
            maxLength={300}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            ayuda="Al menos 5 caracteres. Queda en la bitácora."
          />
        ) : null}
        <Campo
          etiqueta="Portería"
          name="porteria"
          value={porteria}
          onChange={(e) => setPorteria(e.target.value)}
          ayuda="Vacío: la del perfil del portero."
        />
      </div>
    </DialogoDeFormulario>
  );
};
