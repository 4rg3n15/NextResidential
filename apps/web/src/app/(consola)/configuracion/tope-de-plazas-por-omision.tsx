'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CampoDeMotivo, motivoParaEnviar, motivoValido } from '@/componentes/campo-de-motivo';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { cliente, desenvolver, mensajeDeFallo } from '@/lib/api/cliente';
import { TOPE_MAXIMO_DE_PLAZAS, topeValido } from '@/lib/validacion/tope-de-plazas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * PLAZAS POR VIVIENDA, CONTANDO AL TITULAR · RONDA 15-W
 *
 * El tope con el que nace cada vivienda de la copropiedad: cuántas plazas —la
 * del titular incluida— puede crear su hogar. Sólo el superadministrador lo
 * cambia, siempre con motivo, por una ruta propia y no por el PATCH de la
 * configuración general: lleva motivo y queda en la bitácora.
 *
 * Lo que la pantalla tiene que decir y el número solo no dice: **bajarlo nunca
 * quita plazas**. Las viviendas que ya tienen más quedan con un tope propio
 * igual a las que tienen (lo hace la base), y las que ya tenían tope propio no
 * cambian. Sin esa frase, «bajar a 3» se lee como «echar a la cuarta persona».
 *
 * Sin caché: un tope es un derecho, y se pregunta cada vez que se muestra.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const claveDelTope = (copropiedadId: string) =>
  ['residentes', copropiedadId, 'tope-por-omision'] as const;

export const TopeDePlazasPorOmision = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const consultas = useQueryClient();
  const consulta = useQuery({
    queryKey: claveDelTope(copropiedadId),
    gcTime: 0,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/tope-de-plazas', {
          params: { path: { id: copropiedadId } },
        }),
      ),
  });
  const [abierto, setAbierto] = useState(false);
  const [numero, setNumero] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const abrir = (tope: number): void => {
    setNumero(String(tope));
    setMotivo('');
    setError(undefined);
    setGuardado(false);
    setAbierto(true);
  };

  const guardar = async (): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      const nuevo = desenvolver(
        await cliente.PUT('/copropiedades/{id}/tope-de-plazas', {
          params: { path: { id: copropiedadId } },
          body: { tope: Number(numero), motivo: motivoParaEnviar(motivo) },
        }),
      );
      consultas.setQueryData(claveDelTope(copropiedadId), nuevo);
      setGuardado(true);
      setAbierto(false);
    } catch (e) {
      setError(mensajeDeFallo(e));
    } finally {
      setEnviando(false);
    }
  };

  if (consulta.isPending) {
    return (
      <p role="status" className="text-secundario text-texto-apagado">
        Consultando el tope de plazas…
      </p>
    );
  }
  if (consulta.isError) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-2 text-secundario text-peligro-texto"
      >
        <span>No se pudo consultar el tope de plazas. {mensajeDeFallo(consulta.error)}</span>
        <Boton variante="secundario" tamano="sm" onClick={() => void consulta.refetch()}>
          Reintentar
        </Boton>
      </div>
    );
  }

  const numeroValido = topeValido(numero);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="tabular-nums">{`${String(consulta.data.tope)} por vivienda`}</span>
      <Boton variante="secundario" tamano="sm" onClick={() => abrir(consulta.data.tope)}>
        Cambiar tope
      </Boton>
      {guardado ? (
        <span role="status" className="text-distintivo text-exito-texto">
          Guardado y anotado en la auditoría.
        </span>
      ) : null}
      <DialogoDeFormulario
        abierto={abierto}
        titulo="Plazas por vivienda"
        descripcion="Cuántas plazas puede tener cada vivienda, contando la del titular, salvo las que tienen un tope propio. Bajarlo nunca quita plazas: las viviendas que ya tienen más quedan con un tope propio igual a las que tienen. Queda en la bitácora con tu nombre y el motivo."
        etiquetaEnviar="Guardar"
        enviando={enviando}
        error={error}
        puedeEnviar={numeroValido && motivoValido(motivo)}
        alEnviar={() => void guardar()}
        alCancelar={() => setAbierto(false)}
      >
        <Campo
          etiqueta="Plazas por vivienda (contando al titular)"
          name="tope"
          inputMode="numeric"
          maxLength={2}
          required
          value={numero}
          onChange={(e) => setNumero(e.target.value.trim())}
          ayuda={`De 1 a ${String(TOPE_MAXIMO_DE_PLAZAS)}.`}
          error={
            numero !== '' && !numeroValido
              ? `Escribe un número de 1 a ${String(TOPE_MAXIMO_DE_PLAZAS)}`
              : undefined
          }
        />
        <CampoDeMotivo valor={motivo} cambiar={setMotivo} />
      </DialogoDeFormulario>
    </div>
  );
};
