'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Rol, TipoDeCopropiedad } from '@ncr/contracts';
import { Campo } from '@/componentes/ui/campo';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { useConfiguracion } from '@/lib/api/consultas';
import { sinConfigurar } from '@/lib/vocabulario';

/**
 * Diálogo de configuración inicial de la copropiedad.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ LO DISPARA, Y QUÉ NO
 *
 * Lo dispara un estado del SERVIDOR: `tipo` nulo en la configuración. No «es la
 * primera sesión», no una marca en el navegador, no el modo de compilación. Es
 * la lección de D-67 y D-68 —lo que depende del caso concreto no se decide por
 * entorno— y tiene una consecuencia práctica: la copropiedad número 40 verá
 * este diálogo el día que entre su administrador, sin que nadie tenga que
 * acordarse de configurarla.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTE DIÁLOGO **NO** HACE: CREAR LA COPROPIEDAD
 *
 * No puede, y conviene que esté escrito aquí. Nadie entra en la consola antes
 * de que exista una copropiedad: `roles_usuario.copropiedad_id` es `NOT NULL` y
 * sin rol el gancho de claims no emite token. La primera la crea un operador
 * con `scripts/registrar-copropiedad.mjs` (guía RECUPERACION_Y_USUARIOS §B.3).
 * Lo que falta cuando alguien entra por primera vez no es el tenant: es su
 * vocabulario. Eso es lo que se pide aquí.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE PUEDE APLAZAR
 *
 * Bloquear la consola entera dejaría fuera a quien solo quiere mirar eventos, y
 * el aviso del directorio de viviendas ya explica qué falta. El generador de
 * padrón sí queda deshabilitado hasta que se complete, porque sin tipo no hay
 * formulario que mostrar.
 */

/** Las palabras que suele usar cada tipo. Sugeridas, no impuestas: son editables. */
const SUGERENCIAS: Readonly<Record<TipoDeCopropiedad, { vivienda: string; agrupacion: string }>> = {
  apartamentos: { vivienda: 'Apartamento', agrupacion: 'Torre' },
  casas: { vivienda: 'Casa', agrupacion: 'Sección' },
  fincas: { vivienda: 'Finca', agrupacion: 'Sector' },
  otro: { vivienda: 'Vivienda', agrupacion: 'Agrupación' },
};

const OPCIONES: readonly (readonly [TipoDeCopropiedad, string])[] = [
  ['apartamentos', 'Apartamentos — edificios con torres y pisos'],
  ['casas', 'Casas — conjunto o urbanización, con secciones o sin ellas'],
  ['fincas', 'Fincas o parcelas — parcelación, sin agrupación'],
  ['otro', 'Otro — sin generación automática'],
];

/** Los dos roles que leen y escriben la configuración; al resto la API le da 404. */
const ROLES_QUE_CONFIGURAN: readonly Rol[] = ['administrador', 'superadministrador'];

export const ConfiguracionInicial = ({
  copropiedadId,
  rol,
}: {
  readonly copropiedadId: string | null;
  readonly rol: Rol;
}): JSX.Element | null => {
  const puede = ROLES_QUE_CONFIGURAN.includes(rol);
  const consulta = useConfiguracion(copropiedadId ?? '', puede && copropiedadId !== null);
  const clientes = useQueryClient();

  const [aplazado, setAplazado] = useState(false);
  const [direccion, setDireccion] = useState('');
  const [tipo, setTipo] = useState<TipoDeCopropiedad | ''>('');
  const [etiquetaVivienda, setEtiquetaVivienda] = useState('');
  const [etiquetaAgrupacion, setEtiquetaAgrupacion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  if (!puede || copropiedadId === null || aplazado) return null;
  if (!sinConfigurar(consulta.data)) return null;

  const elegirTipo = (elegido: TipoDeCopropiedad): void => {
    setTipo(elegido);
    // Las etiquetas se rellenan con la sugerencia del tipo, y siguen siendo
    // editables: un conjunto puede usar «Manzana» aunque sea de casas.
    setEtiquetaVivienda(SUGERENCIAS[elegido].vivienda);
    setEtiquetaAgrupacion(SUGERENCIAS[elegido].agrupacion);
  };

  const guardar = async (): Promise<void> => {
    if (tipo === '') return;
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.PATCH('/copropiedades/{id}/configuracion', {
          params: { path: { id: copropiedadId } },
          body: {
            direccion: direccion.trim(),
            tipo,
            etiquetaVivienda: etiquetaVivienda.trim(),
            etiquetaAgrupacion: etiquetaAgrupacion.trim(),
          },
        }),
      );
      await clientes.invalidateQueries({ queryKey: ['configuracion', copropiedadId] });
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo guardar la configuración');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogoDeFormulario
      abierto
      titulo="Configure su copropiedad"
      descripcion="Estos datos deciden cómo se llaman las viviendas y cómo se dan de alta. La dirección es del conjunto: las viviendas no tienen dirección propia."
      etiquetaEnviar="Guardar configuración"
      enviando={enviando}
      error={error}
      puedeEnviar={tipo !== '' && direccion.trim().length >= 5}
      alEnviar={() => void guardar()}
      alCancelar={() => setAplazado(true)}
    >
      <Campo
        etiqueta="Dirección del conjunto"
        value={direccion}
        onChange={(e) => setDireccion(e.target.value)}
        ayuda="La misma para todas las viviendas. Lo que cambia entre ellas es la agrupación y el número."
        required
      />

      <fieldset className="space-y-1.5">
        <legend className="block text-secundario font-medium text-texto">
          Tipo de copropiedad
        </legend>
        <p className="text-secundario text-texto-apagado">
          Decide el formulario de alta y las palabras. Puede cambiarlo después: las viviendas ya
          creadas conservan su identificador.
        </p>
        {OPCIONES.map(([valor, texto]) => (
          <label key={valor} className="flex items-center gap-2 text-secundario text-texto">
            <input
              type="radio"
              name="tipo-de-copropiedad"
              value={valor}
              checked={tipo === valor}
              onChange={() => elegirTipo(valor)}
            />
            {texto}
          </label>
        ))}
      </fieldset>

      {tipo === '' ? null : (
        <>
          <Campo
            etiqueta="Cómo llama a una vivienda"
            value={etiquetaVivienda}
            onChange={(e) => setEtiquetaVivienda(e.target.value)}
            ayuda="Se pinta al mostrar: «Casa 42». Nunca se guarda dentro del número, así que cambiarla después no renombra nada."
            required
          />
          <Campo
            etiqueta="Cómo llama a una agrupación"
            value={etiquetaAgrupacion}
            onChange={(e) => setEtiquetaAgrupacion(e.target.value)}
            ayuda="Torre, bloque, manzana, etapa, sector… la palabra que use el conjunto."
            required
          />
        </>
      )}
    </DialogoDeFormulario>
  );
};
