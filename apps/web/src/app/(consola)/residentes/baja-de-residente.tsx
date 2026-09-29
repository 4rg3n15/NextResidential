'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CuentaDeResidente } from '@ncr/contracts';
import { Campo } from '@/componentes/ui/campo';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';

/**
 * C9 (15-M) · «ELIMINAR» UN RESIDENTE ES DARLO DE BAJA CON MOTIVO (RN-19, CA-02).
 *
 * Superadministrador y administrador. Lo que la API hace y esta pantalla sólo
 * cuenta: la cuenta y su rol quedan inactivos —sin nuevos tokens: la sesión no
 * sobrevive al siguiente refresco—, sus vínculos de vivienda se cierran, sus
 * plantillas biométricas se suprimen (RN-11) y las autorizaciones vigentes se
 * conservan sin que nazcan nuevas (RN-13). Nada se borra.
 */
export const LONGITUD_MINIMA_DEL_MOTIVO = 5;

export const DialogoDeBajaDeResidente = ({
  copropiedadId,
  cuenta,
  alCerrar,
  alDarDeBaja,
}: {
  readonly copropiedadId: string;
  readonly cuenta: Pick<CuentaDeResidente, 'usuarioId' | 'nombre'> | null;
  readonly alCerrar: () => void;
  readonly alDarDeBaja?: (aviso: string) => void;
}): JSX.Element => {
  const consultas = useQueryClient();
  const [motivo, setMotivo] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (cuenta === null) return;
    setMotivo('');
    setConfirmado(false);
    setError(undefined);
  }, [cuenta]);

  const limpio = motivo.normalize('NFC').replace(/\s+/g, ' ').trim();
  const motivoVale = limpio.length >= LONGITUD_MINIMA_DEL_MOTIVO && limpio.length <= 300;

  const enviar = async (): Promise<void> => {
    if (cuenta === null) return;
    setEnviando(true);
    setError(undefined);
    try {
      const r = desenvolver(
        await cliente.POST('/copropiedades/{id}/residentes/cuentas/{usuarioId}/baja', {
          params: { path: { id: copropiedadId, usuarioId: cuenta.usuarioId } },
          body: { motivo: limpio },
        }),
      );
      await consultas.invalidateQueries({ queryKey: ['residentes', copropiedadId] });
      const plantillas =
        r.plantillasSuprimidas > 0
          ? ` Se suprimieron ${String(r.plantillasSuprimidas)} plantilla(s) biométrica(s).`
          : '';
      alDarDeBaja?.(
        `${cuenta.nombre} quedó de baja: su sesión ya no sirve y sus visitas vigentes se conservan.${plantillas}`,
      );
      alCerrar();
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo dar de baja al residente.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogoDeFormulario
      abierto={cuenta !== null}
      titulo={`Dar de baja a ${cuenta?.nombre ?? ''}`}
      descripcion="No se borra nada: la cuenta deja de entrar, se cierran sus vínculos de vivienda y se suprimen sus datos biométricos. Sus visitas vigentes se conservan y no podrá crear nuevas. Queda con tu nombre, la hora y el motivo."
      etiquetaEnviar="Dar de baja"
      enviando={enviando}
      error={error}
      puedeEnviar={motivoVale && confirmado}
      alEnviar={() => void enviar()}
      alCancelar={alCerrar}
    >
      <Campo
        etiqueta="Motivo de la baja"
        name="motivo"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        maxLength={300}
        ayuda={`Obligatorio, al menos ${String(LONGITUD_MINIMA_DEL_MOTIVO)} caracteres. Queda en la auditoría.`}
        error={
          motivo !== '' && !motivoVale
            ? `Escribe al menos ${String(LONGITUD_MINIMA_DEL_MOTIVO)} caracteres`
            : undefined
        }
      />
      <label className="flex items-start gap-2 text-secundario text-texto">
        <input
          type="checkbox"
          name="confirmacion"
          checked={confirmado}
          onChange={(e) => setConfirmado(e.target.checked)}
          className="mt-1"
        />
        <span>Confirmo la baja de «{cuenta?.nombre ?? ''}» en esta copropiedad.</span>
      </label>
    </DialogoDeFormulario>
  );
};
