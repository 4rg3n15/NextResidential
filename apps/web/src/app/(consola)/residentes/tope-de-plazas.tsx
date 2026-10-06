'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CampoDeMotivo, motivoParaEnviar, motivoValido } from '@/componentes/campo-de-motivo';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Distintivo } from '@/componentes/ui/distintivo';
import { cliente, desenvolver, mensajeDeFallo } from '@/lib/api/cliente';
import { TOPE_MAXIMO_DE_PLAZAS, topeValido } from '@/lib/validacion/tope-de-plazas';
import { clavesDeResidentes, useTopeDePlazas } from './consultas';
import type { TopeDePlazas } from './consultas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL TOPE DE PLAZAS DE UNA VIVIENDA · RONDA 15-W
 *
 * Desde la 15-W el titular crea las plazas de su hogar desde la app, y cada
 * plaza es un código con el que otra persona hace «Crear cuenta». El tope dice
 * cuántas puede tener la vivienda CONTANDO LA DEL TITULAR: el de la
 * copropiedad (Configuración) o uno propio que pone aquí el superadministrador,
 * con motivo, a petición del hogar.
 *
 * «Plazas: 3 de 4» se lee de la API y no se calcula: `activas` incluye la
 * plaza del titular y sólo la base sabe cuántas están vivas. Tampoco se decide
 * aquí que el tope no baje de las activas: lo garantiza la base bajo su
 * bloqueo y responde 409; la consola lo EXPLICA en el diálogo y enseña el
 * rechazo tal cual. La cota 1 a 20 sí se comprueba antes de enviar, pero sólo
 * para ahorrar el viaje: la regla es del servidor.
 *
 * «Volver al tope de la copropiedad» (`tope: null`) sólo se ofrece cuando la
 * vivienda tiene tope propio: si ya usa el de la copropiedad, no hay a dónde
 * volver.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const DialogoDeCambioDeTope = ({
  copropiedadId,
  viviendaId,
  actual,
  abierto,
  alCerrar,
}: {
  readonly copropiedadId: string;
  readonly viviendaId: string;
  readonly actual: TopeDePlazas;
  readonly abierto: boolean;
  readonly alCerrar: () => void;
}): JSX.Element => {
  const consultas = useQueryClient();
  const [delaCopropiedad, setDeLaCopropiedad] = useState(false);
  const [numero, setNumero] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  // Sólo al ABRIR, y por eso `actual.tope` no está entre las dependencias: si
  // una recarga trajera otro tope con el diálogo abierto, no debe pisar lo que
  // se está escribiendo.
  useEffect(() => {
    if (!abierto) return;
    setDeLaCopropiedad(false);
    setNumero(String(actual.tope));
    setMotivo('');
    setError(undefined);
  }, [abierto]);

  const numeroValido = topeValido(numero);

  const enviar = async (): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      const nuevo = desenvolver(
        await cliente.PUT('/copropiedades/{id}/viviendas/{viviendaId}/tope-de-plazas', {
          params: { path: { id: copropiedadId, viviendaId } },
          body: {
            tope: delaCopropiedad ? null : Number(numero),
            motivo: motivoParaEnviar(motivo),
          },
        }),
      );
      // La respuesta ES el estado nuevo: se pinta sin otra consulta.
      consultas.setQueryData(clavesDeResidentes.topeDePlazas(copropiedadId, viviendaId), nuevo);
      alCerrar();
    } catch (e) {
      setError(mensajeDeFallo(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogoDeFormulario
      abierto={abierto}
      titulo="Cambiar el tope de plazas"
      descripcion={`Cuántas plazas puede tener esta vivienda, contando la del titular. Hoy tiene ${String(actual.activas)} activas, y el tope no puede quedar por debajo. Queda en la bitácora con tu nombre y el motivo.`}
      etiquetaEnviar="Guardar tope"
      enviando={enviando}
      error={error}
      puedeEnviar={(delaCopropiedad || numeroValido) && motivoValido(motivo)}
      alEnviar={() => void enviar()}
      alCancelar={alCerrar}
    >
      {actual.propio ? (
        <fieldset className="space-y-2">
          <legend className="text-secundario font-medium text-texto">Tope de esta vivienda</legend>
          <label className="flex items-center gap-2 text-cuerpo text-texto">
            <input
              type="radio"
              name="clase-de-tope"
              checked={!delaCopropiedad}
              onChange={() => setDeLaCopropiedad(false)}
            />
            Un número propio
          </label>
          <label className="flex items-center gap-2 text-cuerpo text-texto">
            <input
              type="radio"
              name="clase-de-tope"
              checked={delaCopropiedad}
              onChange={() => setDeLaCopropiedad(true)}
            />
            Volver al tope de la copropiedad
          </label>
        </fieldset>
      ) : null}
      {delaCopropiedad ? null : (
        <Campo
          etiqueta="Plazas de la vivienda (contando al titular)"
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
      )}
      <CampoDeMotivo valor={motivo} cambiar={setMotivo} />
    </DialogoDeFormulario>
  );
};

/** «Plazas: N de M», si el tope es propio, y el botón que lo cambia. */
export const TopeDePlazasDeVivienda = ({
  copropiedadId,
  viviendaId,
}: {
  readonly copropiedadId: string;
  readonly viviendaId: string;
}): JSX.Element => {
  const consulta = useTopeDePlazas(copropiedadId, viviendaId);
  const [cambiando, setCambiando] = useState(false);

  if (consulta.isPending) {
    return (
      <p role="status" className="text-secundario text-texto-apagado">
        Consultando las plazas de la vivienda…
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
  const plazas = consulta.data;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-borde bg-lienzo px-3 py-2">
      <p className="text-cuerpo font-medium tabular-nums text-texto">
        {`Plazas: ${String(plazas.activas)} de ${String(plazas.tope)}`}
      </p>
      <Distintivo tono={plazas.propio ? 'marca' : 'neutro'}>
        {plazas.propio ? 'Tope propio' : 'Tope de la copropiedad'}
      </Distintivo>
      <Boton
        variante="secundario"
        tamano="sm"
        className="ml-auto"
        onClick={() => setCambiando(true)}
      >
        Cambiar tope
      </Boton>
      <DialogoDeCambioDeTope
        copropiedadId={copropiedadId}
        viviendaId={viviendaId}
        actual={plazas}
        abierto={cambiando}
        alCerrar={() => setCambiando(false)}
      />
    </div>
  );
};
