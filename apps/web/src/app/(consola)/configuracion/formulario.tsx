'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import type { ConfiguracionDeCopropiedad } from '@ncr/contracts';
import { cliente, desenvolver, ErrorDeApi } from '@/lib/api/cliente';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Distintivo } from '@/componentes/ui/distintivo';
import { EstadoCargando, estadoSegunCodigo } from '@/componentes/estados';

/**
 * Formulario de configuración.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUIÉN DECIDE QUÉ ES EDITABLE
 *
 * **La API, no esta pantalla.** La respuesta trae `editables` con las claves
 * que ESTE rol puede cambiar, y el formulario deshabilita el resto. Si la lista
 * viviera aquí, el día que un ajuste cambie de rol la consola seguiría pintando
 * el campo abierto y el servidor devolvería 422 sobre un formulario que parecía
 * correcto.
 *
 * Y al revés importa más: la consola **oculta, no protege**. El rechazo real es
 * el 422 del servidor, que `validarCambios` produce leyendo la misma tabla. Un
 * campo deshabilitado se salta con un `curl`; el 422 no.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ LO NO EDITABLE SE VE, CON SU MOTIVO
 *
 * Ocultar un ajuste que no se puede cambiar hace que parezca que no existe, y
 * acaba pedido otra vez en la reunión siguiente. Mostrarlo con la razón a la
 * vista —cota legal, integridad, trazabilidad— cierra la conversación y además
 * documenta el sistema para quien lo audita.
 */

const ETIQUETA_DE_POLITICA: Readonly<Record<string, string>> = {
  denegar: 'Denegar (conservador)',
  escalar_portero: 'Escalar al portero',
};

interface Borrador {
  nombre: string;
  zonaHoraria: string;
  umbralConfianzaPlaca: string;
  politicaContingenciaEdge: string;
  umbralLatidoMinutos: string;
}

const aBorrador = (c: ConfiguracionDeCopropiedad): Borrador => ({
  nombre: c.nombre,
  zonaHoraria: c.zonaHoraria,
  umbralConfianzaPlaca: c.umbralConfianzaPlaca.toFixed(3),
  politicaContingenciaEdge: c.politicaContingenciaEdge,
  umbralLatidoMinutos: String(c.umbralLatidoMinutos),
});

export const FormularioDeConfiguracion = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const clienteDeConsulta = useQueryClient();
  const clave = ['configuracion', copropiedadId] as const;

  const consulta = useQuery({
    queryKey: clave,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/configuracion', {
          params: { path: { id: copropiedadId } },
        }),
      ),
  });

  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [rechazos, setRechazos] = useState<Readonly<Record<string, string>>>({});
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    if (consulta.data !== undefined) setBorrador(aBorrador(consulta.data));
  }, [consulta.data]);

  const guardar = useMutation({
    mutationFn: async (b: Borrador) => {
      const respuesta = await cliente.PATCH('/copropiedades/{id}/configuracion', {
        params: { path: { id: copropiedadId } },
        body: {
          nombre: b.nombre,
          zonaHoraria: b.zonaHoraria,
          umbralConfianzaPlaca: Number(b.umbralConfianzaPlaca),
          politicaContingenciaEdge: b.politicaContingenciaEdge as 'denegar' | 'escalar_portero',
          umbralLatidoMinutos: Number(b.umbralLatidoMinutos),
        },
      });
      return desenvolver(respuesta);
    },
    onSuccess: (datos) => {
      setRechazos({});
      setGuardado(true);
      clienteDeConsulta.setQueryData(clave, datos);
      // El nombre y la zona horaria salen también en el selector de la
      // cabecera: sin invalidar, el encabezado seguiría diciendo el anterior.
      void clienteDeConsulta.invalidateQueries({ queryKey: ['tablero', copropiedadId] });
    },
    onError: (error) => {
      setGuardado(false);
      /**
       * Un 422 NO es un fallo genérico: trae la lista de ajustes rechazados con
       * su motivo, y cada motivo va a SU campo. Un «no se pudo guardar» encima
       * del formulario obligaría a adivinar cuál de los cinco falló.
       */
      if (error instanceof ErrorDeApi && error.estado === 422) {
        setRechazos(error.porCampo ?? { general: error.message });
      }
    },
  });

  if (consulta.isPending) return <EstadoCargando etiqueta="Cargando la configuración" />;
  if (consulta.isError) {
    const estado = consulta.error instanceof ErrorDeApi ? consulta.error.estado : 0;
    return estadoSegunCodigo(estado, 'No se pudo leer la configuración.', () => {
      void consulta.refetch();
    });
  }
  if (borrador === null || consulta.data === undefined) {
    return <EstadoCargando etiqueta="Cargando la configuración" />;
  }

  const datos = consulta.data;
  const editable = (clave: string): boolean => datos.editables.includes(clave);
  const bloqueado = 'Tu rol no puede cambiar este ajuste.';

  const cambiar = (campo: keyof Borrador, valor: string): void => {
    setGuardado(false);
    setBorrador({ ...borrador, [campo]: valor });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        guardar.mutate(borrador);
      }}
    >
      <Campo
        etiqueta="Nombre de la copropiedad"
        value={borrador.nombre}
        onChange={(e) => cambiar('nombre', e.target.value)}
        disabled={!editable('nombre')}
        maxLength={200}
        error={rechazos['nombre']}
        ayuda={editable('nombre') ? undefined : bloqueado}
      />

      <Campo
        etiqueta="Zona horaria"
        value={borrador.zonaHoraria}
        onChange={(e) => cambiar('zonaHoraria', e.target.value)}
        disabled={!editable('zonaHoraria')}
        error={rechazos['zonaHoraria']}
        ayuda="Decide qué significa «hoy» en el tablero y en los informes. Identificador IANA, por ejemplo America/Bogota."
      />

      <Campo
        etiqueta="Umbral de confianza de placa"
        type="number"
        step="0.005"
        min="0.5"
        max="1"
        value={borrador.umbralConfianzaPlaca}
        onChange={(e) => cambiar('umbralConfianzaPlaca', e.target.value)}
        disabled={!editable('umbralConfianzaPlaca')}
        error={rechazos['umbralConfianzaPlaca']}
        ayuda={
          editable('umbralConfianzaPlaca')
            ? 'Por debajo de este valor la lectura no abre sola: escala al portero. Bajarlo convierte lecturas dudosas en aperturas automáticas.'
            : `${bloqueado} Decide cuándo una lectura de placa abre sin intervención humana: es exclusivo del superadministrador.`
        }
      />

      <div className="space-y-1.5">
        <label
          htmlFor="politica-contingencia"
          className="block text-secundario font-medium text-texto"
        >
          Contingencia del Edge sin regla en caché
        </label>
        <select
          id="politica-contingencia"
          value={borrador.politicaContingenciaEdge}
          onChange={(e) => cambiar('politicaContingenciaEdge', e.target.value)}
          disabled={!editable('politicaContingenciaEdge')}
          className="h-11 w-full rounded-campo border border-borde bg-campo px-3 text-cuerpo text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto disabled:cursor-not-allowed disabled:bg-borde-suave"
        >
          {Object.entries(ETIQUETA_DE_POLITICA).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>
        <p className="text-secundario text-texto-apagado">
          {editable('politicaContingenciaEdge')
            ? 'Qué hace el Edge cuando decide sin WAN y la regla no está en su caché (RN-16).'
            : `${bloqueado} «Denegar» es el valor conservador que impone el contrato.`}
        </p>
      </div>

      <Campo
        etiqueta="Margen de latido de dispositivo (minutos)"
        type="number"
        min="1"
        max="60"
        step="1"
        value={borrador.umbralLatidoMinutos}
        onChange={(e) => cambiar('umbralLatidoMinutos', e.target.value)}
        disabled={!editable('umbralLatidoMinutos')}
        error={rechazos['umbralLatidoMinutos']}
        ayuda="Sin latido en este plazo, el dispositivo pasa a «fuera de línea» (RN-12, CA-26)."
      />

      {rechazos['general'] !== undefined ? (
        <p role="alert" className="text-secundario text-peligro-texto">
          {rechazos['general']}
        </p>
      ) : null}

      {guardar.isError && Object.keys(rechazos).length === 0 ? (
        <p role="alert" className="text-secundario text-peligro-texto">
          No se pudo guardar. Vuelve a intentarlo; si sigue fallando, el cambio no se aplicó.
        </p>
      ) : null}

      <div className="flex items-center gap-3 pt-1">
        <Boton type="submit" cargando={guardar.isPending} disabled={datos.editables.length === 0}>
          Guardar cambios
        </Boton>
        {datos.editables.length === 0 ? (
          <span className="inline-flex items-center gap-1.5 text-secundario text-texto-apagado">
            <Lock className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
            Tu rol consulta esta pantalla, no la edita.
          </span>
        ) : null}
        {guardado ? (
          <span aria-live="polite">
            <Distintivo tono="exito">Guardado y anotado en la auditoría</Distintivo>
          </span>
        ) : null}
      </div>
    </form>
  );
};
