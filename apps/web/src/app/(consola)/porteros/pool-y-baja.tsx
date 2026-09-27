'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Portero } from '@ncr/contracts';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { DialogoDeConfirmacion } from '@/componentes/dialogo-confirmacion';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { cliente, desenvolver } from '@/lib/api/cliente';
import { usePoolDePorteros } from './consultas';

/**
 * H1 · H2 (15-L) · LOS NÚMEROS DE PORTERO DE LA COPROPIEDAD Y SU CUPO.
 *
 * El rango lo asigna el sistema a la copropiedad y no se edita; el cupo —cuántos
 * porteros activos admite— sí, entre 0 y 999, y queda en el rastro de seguridad.
 * Un número dado de baja no vuelve al rango: por eso «siguiente» sólo avanza.
 */
export const ResumenDelPool = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element | null => {
  const pool = usePoolDePorteros(copropiedadId);
  const consultas = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [cupo, setCupo] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (abierto) {
      setCupo(String(pool.data?.cupo ?? ''));
      setError(undefined);
    }
  }, [abierto, pool.data?.cupo]);

  if (!pool.isSuccess) return null;
  const p = pool.data;
  const valor = Number(cupo);
  const cupoValido = /^[0-9]{1,3}$/.test(cupo.trim()) && valor >= 0 && valor <= 999;

  const guardar = async (): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.PUT('/copropiedades/{id}/porteros/cupo', {
          params: { path: { id: copropiedadId } },
          body: { cupo: valor },
        }),
      );
      await consultas.invalidateQueries({ queryKey: ['porteria', copropiedadId] });
      setAbierto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el cupo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Tarjeta>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-seccion">Números de portero</h2>
          <p className="mt-1 text-secundario text-texto-apagado">
            Del {p.inicio} al {p.fin}. El próximo portero recibirá el {p.siguiente}. {p.activos}{' '}
            activos de un cupo de {p.cupo}.
          </p>
        </div>
        <Boton variante="secundario" tamano="sm" onClick={() => setAbierto(true)}>
          Cambiar cupo
        </Boton>
      </div>
      <DialogoDeFormulario
        abierto={abierto}
        titulo="Cupo de porteros activos"
        descripcion="Cuántos porteros activos admite la copropiedad, de 0 a 999. Si ya hay más activos, no se da de baja a nadie: sólo no se admiten altas nuevas."
        etiquetaEnviar="Guardar"
        enviando={enviando}
        error={error}
        puedeEnviar={cupoValido}
        alEnviar={() => void guardar()}
        alCancelar={() => setAbierto(false)}
      >
        <Campo
          etiqueta="Cupo"
          name="cupo"
          inputMode="numeric"
          required
          value={cupo}
          onChange={(e) => setCupo(e.target.value)}
          error={cupo !== '' && !cupoValido ? 'Un número de 0 a 999.' : undefined}
        />
      </DialogoDeFormulario>
    </Tarjeta>
  );
};

/** La baja de un portero, con motivo: cierra sus sesiones y su número no se reutiliza. */
export const DialogoDeBaja = ({
  copropiedadId,
  portero,
  alCerrar,
}: {
  readonly copropiedadId: string;
  readonly portero: Portero | null;
  readonly alCerrar: () => void;
}): JSX.Element => {
  const consultas = useQueryClient();
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => setError(undefined), [portero]);

  const dar = async (motivo: string): Promise<void> => {
    if (portero === null) return;
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.POST('/copropiedades/{id}/porteros/{usuarioId}/baja', {
          params: { path: { id: copropiedadId, usuarioId: portero.usuarioId } },
          body: { motivo },
        }),
      );
      await consultas.invalidateQueries({ queryKey: ['porteria', copropiedadId] });
      alCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo dar de baja.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogoDeConfirmacion
      abierto={portero !== null}
      titulo={`Dar de baja a ${portero?.nombre ?? ''}`}
      descripcion={`Deja de poder entrar y su sesión abierta se cierra ahora. El número ${String(portero?.numero ?? '—')} no se asigna a nadie más: lo que hizo sigue a su nombre.`}
      etiquetaConfirmar="Dar de baja"
      minimoMotivo={3}
      sugerencias={['Terminó su contrato', 'Cambio de empresa de vigilancia']}
      enviando={enviando}
      error={error}
      alConfirmar={(motivo) => void dar(motivo)}
      alCancelar={alCerrar}
    />
  );
};
