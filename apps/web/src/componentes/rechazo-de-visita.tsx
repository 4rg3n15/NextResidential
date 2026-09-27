'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Visita } from '@ncr/contracts';
import { DialogoDeMotivo } from '@/componentes/dialogo-motivo';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { clavesDeVisitas } from '@/lib/api/visitas';

/** Quién puede rechazar una visita autoaprobada: lo decide también la API. */
export const ROLES_QUE_RECHAZAN: ReadonlySet<string> = new Set(['portero', 'superadministrador']);

/** Sólo se rechaza lo que todavía puede abrir una puerta. */
export const sePuedeRechazar = (v: Pick<Visita, 'estado'>): boolean =>
  v.estado === 'vigente' || v.estado === 'programada';

/**
 * F2 (15-L) · el rechazo de una visita, con motivo. Anula la autorización y
 * retira la foto de los equipos en la misma operación; al volver dice cuántos
 * equipos la soltaron y cuántos quedan pendientes de responder.
 */
export const RechazoDeVisita = ({
  copropiedadId,
  visita,
  alTerminar,
}: {
  readonly copropiedadId: string;
  readonly visita: Visita;
  readonly alTerminar: (resumen: string | null) => void;
}): JSX.Element => {
  const consultas = useQueryClient();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const rechazar = async (motivo: string): Promise<void> => {
    setCargando(true);
    setError(undefined);
    try {
      const r = desenvolver(
        await cliente.POST('/copropiedades/{id}/visitas/{autorizacionId}/rechazo', {
          params: { path: { id: copropiedadId, autorizacionId: visita.autorizacionId } },
          body: { motivo },
        }),
      );
      await consultas.invalidateQueries({ queryKey: clavesDeVisitas.raiz(copropiedadId) });
      alTerminar(
        r.equiposPendientes > 0
          ? `Visita rechazada. La foto salió de ${String(r.equiposRetirados)} equipos; ${String(r.equiposPendientes)} no respondieron y se reintentará.`
          : `Visita rechazada. La foto salió de ${String(r.equiposRetirados)} equipos.`,
      );
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No hay conexión con el servidor.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <DialogoDeMotivo
      titulo={`Rechazar la visita de ${visita.visitante}`}
      descripcion={`${visita.vivienda}. La autorización queda anulada y la foto se borra de todos los equipos.`}
      etiquetaAccion="Rechazar visita"
      variante="peligro"
      sugerencias={['El residente no espera a esta persona', 'Datos del visitante incorrectos']}
      cargando={cargando}
      error={error}
      alConfirmar={(m) => void rechazar(m)}
      alCancelar={() => alTerminar(null)}
    />
  );
};
