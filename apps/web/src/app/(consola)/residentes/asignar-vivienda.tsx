'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CuentaDeResidente } from '@ncr/contracts';
import { CampoDeMotivo, motivoParaEnviar, motivoValido } from '@/componentes/campo-de-motivo';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { cliente, desenvolver, mensajeDeFallo } from '@/lib/api/cliente';
import { clavesDeResidentes } from './consultas';
import type { ViviendaSinTitular } from './consultas';
import { SelectorDeViviendaSinTitular, etiquetaDeVivienda } from './vivienda-sin-titular';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ASIGNAR VIVIENDA A UNA CUENTA ANTIGUA · RONDA 15-W
 *
 * Antes de la 15-W la cuenta se creaba sin vivienda y el residente la declaraba
 * en su primer ingreso. Las que nunca lo hicieron se quedan «Sin vivienda», y
 * desde la 15-W ya no tienen por dónde declararla: el superadministrador se la
 * asigna aquí y la cuenta queda como TITULAR de esa vivienda, con las mismas
 * comprobaciones que el alta de un titular —vivienda activa y sin titular— y
 * con un motivo que la API guarda en la bitácora junto a su nombre.
 *
 * Quién puede recibirla lo decide el servidor (404 «Cuenta no encontrada», 409
 * «Esa cuenta ya tiene vivienda» o «ya tiene titular»), y su mensaje se enseña
 * tal cual. La pantalla sólo ofrece el botón donde puede servir: una cuenta
 * ACTIVA sin vivienda. A una de baja la API le respondería 404, y un botón que
 * siempre falla enseña a no fiarse de los botones.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const DialogoDeAsignacionDeVivienda = ({
  copropiedadId,
  cuenta,
  alCerrar,
  alAsignar,
}: {
  readonly copropiedadId: string;
  readonly cuenta: Pick<CuentaDeResidente, 'usuarioId' | 'nombre'> | null;
  readonly alCerrar: () => void;
  readonly alAsignar?: ((aviso: string) => void) | undefined;
}): JSX.Element => {
  const consultas = useQueryClient();
  const [vivienda, setVivienda] = useState<ViviendaSinTitular | null>(null);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (cuenta === null) return;
    setVivienda(null);
    setMotivo('');
    setError(undefined);
  }, [cuenta]);

  const enviar = async (): Promise<void> => {
    if (cuenta === null || vivienda === null) return;
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.POST('/copropiedades/{id}/residentes/cuentas/{usuarioId}/vivienda', {
          params: { path: { id: copropiedadId, usuarioId: cuenta.usuarioId } },
          body: { viviendaId: vivienda.id, motivo: motivoParaEnviar(motivo) },
        }),
      );
      // La lista de cuentas, la de viviendas sin titular y las plazas: todo
      // cuelga de la misma raíz, y las tres cambian con la asignación.
      await consultas.invalidateQueries({ queryKey: ['residentes', copropiedadId] });
      alAsignar?.(`${cuenta.nombre} quedó como titular de ${etiquetaDeVivienda(vivienda)}.`);
      alCerrar();
    } catch (e) {
      setError(mensajeDeFallo(e));
      void consultas.invalidateQueries({
        queryKey: clavesDeResidentes.viviendasSinTitular(copropiedadId),
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogoDeFormulario
      abierto={cuenta !== null}
      titulo={`Asignar vivienda a ${cuenta?.nombre ?? ''}`}
      descripcion="Es una cuenta anterior al alta por titular y no tiene vivienda. Queda como TITULAR de la que elijas: sólo aparecen las activas que todavía no tienen titular. Queda en la bitácora con tu nombre y el motivo."
      etiquetaEnviar="Asignar vivienda"
      enviando={enviando}
      error={error}
      puedeEnviar={vivienda !== null && motivoValido(motivo)}
      alEnviar={() => void enviar()}
      alCancelar={alCerrar}
    >
      {cuenta !== null ? (
        <SelectorDeViviendaSinTitular
          copropiedadId={copropiedadId}
          elegida={vivienda}
          alElegir={setVivienda}
        />
      ) : null}
      <CampoDeMotivo valor={motivo} cambiar={setMotivo} />
    </DialogoDeFormulario>
  );
};
