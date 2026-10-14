'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DialogoDeConfirmacion } from '@/componentes/dialogo-confirmacion';
import { EstadoVacio } from '@/componentes/estados';
import { Boton } from '@/componentes/ui/boton';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { cliente, desenvolver, mensajeDeFallo } from '@/lib/api/cliente';
import { clavesDelResidente, useMisMenores, useMisOcupantes } from '@/lib/api/residente';
import type { MenorDelHogar } from '@/lib/api/residente';
import { MOTIVO_MINIMO_DE_BAJA, plazasLibres } from '@/lib/hogar';
import { Seccion, estadoDeConsulta } from '../comunes';
import { DialogoDeCodigo } from './dialogo-de-codigo';
import { FilaDeMenor } from './fila-de-menor';
import { FormularioDeMenor } from './formulario-de-menor';

type Accion =
  | { readonly tipo: 'nuevo' }
  | { readonly tipo: 'editar'; readonly menor: MenorDelHogar }
  | { readonly tipo: 'baja'; readonly menor: MenorDelHogar }
  | { readonly tipo: 'codigo'; readonly menor: MenorDelHogar; readonly codigo: string };

const EXPLICACION_DEL_CODIGO =
  'Con este código crea su propia cuenta en «Crear cuenta» y conserva su historial. Sirve una sola vez.';

/**
 * 15-Y2 · «Menores del hogar» dentro de «Mi familia», como en la app (ADR-038):
 * cualquier adulto los registra en una plaza libre, los edita y los da de baja
 * con motivo; a los 18, el titular genera el código con el que crean su propia
 * cuenta. Las plazas libres salen de `mi/ocupantes`; sin una libre, se dice a
 * quién pedirla según quién mira.
 */
export const MenoresDelHogar = ({
  copropiedadId,
  esTitular,
  ahora,
}: {
  readonly copropiedadId: string;
  readonly esTitular: boolean;
  readonly ahora: Date;
}): JSX.Element => {
  const consultas = useQueryClient();
  const menores = useMisMenores(copropiedadId);
  const ocupantes = useMisOcupantes(copropiedadId);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);
  const lista = menores.data ?? [];
  const libres = ocupantes.data === undefined ? [] : plazasLibres(ocupantes.data);

  const refrescar = async (mensaje: string): Promise<void> => {
    await consultas.invalidateQueries({ queryKey: clavesDelResidente.raiz(copropiedadId) });
    setAviso(mensaje);
  };

  const anadir = async (): Promise<void> => {
    setError(undefined);
    setAviso(null);
    const o = ocupantes.data ?? (await ocupantes.refetch()).data;
    if (o === undefined || plazasLibres(o).length === 0) {
      setError(
        (o?.esTitular ?? esTitular)
          ? 'No hay plazas libres. Añada una en Ocupantes y vuelva a intentarlo.'
          : 'No hay plazas libres. Pídale al titular que añada una en Ocupantes.',
      );
      return;
    }
    setAccion({ tipo: 'nuevo' });
  };

  const darDeBaja = async (motivo: string): Promise<void> => {
    if (accion?.tipo !== 'baja') return;
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.POST('/copropiedades/{id}/mi/menores/{residenteId}/baja', {
          params: { path: { id: copropiedadId, residenteId: accion.menor.residenteId } },
          body: { motivo },
        }),
      );
      setAccion(null);
      await refrescar(`Se dio de baja a ${accion.menor.nombreCompleto}. Su plaza quedó libre.`);
    } catch (fallo) {
      setError(mensajeDeFallo(fallo));
    } finally {
      setEnviando(false);
    }
  };

  const pedirCodigo = async (menor: MenorDelHogar): Promise<void> => {
    setError(undefined);
    setAviso(null);
    try {
      const r = desenvolver(
        await cliente.POST('/copropiedades/{id}/mi/menores/{residenteId}/codigo-de-traspaso', {
          params: { path: { id: copropiedadId, residenteId: menor.residenteId } },
        }),
      );
      setAccion({ tipo: 'codigo', menor, codigo: r.codigo });
    } catch (fallo) {
      setError(mensajeDeFallo(fallo));
    }
  };

  const enCodigo = accion?.tipo === 'codigo' ? accion : null;

  return (
    <Seccion
      titulo="Menores del hogar"
      descripcion="Los menores de edad no tienen cuenta: cualquier adulto de la vivienda los registra en una plaza libre."
      accion={
        <Boton type="button" variante="secundario" tamano="sm" onClick={() => void anadir()}>
          Añadir menor
        </Boton>
      }
    >
      {estadoDeConsulta(menores, 'Cargando los menores')}
      {menores.data !== undefined && lista.length === 0 ? (
        <EstadoVacio
          titulo="Sin menores registrados"
          descripcion="Cuando registres a un menor aparecerá aquí con su plaza."
        />
      ) : null}
      {lista.length > 0 ? (
        <Tarjeta>
          <ul aria-label="Menores de mi vivienda">
            {lista.map((m) => (
              <FilaDeMenor
                key={m.residenteId}
                menor={m}
                esTitular={esTitular}
                alEditar={(menor) => setAccion({ tipo: 'editar', menor })}
                alDarDeBaja={(menor) => setAccion({ tipo: 'baja', menor })}
                alPedirCodigo={(menor) => void pedirCodigo(menor)}
              />
            ))}
          </ul>
        </Tarjeta>
      ) : null}
      {aviso !== null ? (
        <p role="status" className="text-secundario text-exito-texto">
          {aviso}
        </p>
      ) : null}
      {error !== undefined && accion?.tipo !== 'baja' ? (
        <p role="alert" className="text-secundario text-peligro-texto">
          {error}
        </p>
      ) : null}

      <FormularioDeMenor
        copropiedadId={copropiedadId}
        abierto={accion?.tipo === 'nuevo' || accion?.tipo === 'editar'}
        menor={accion?.tipo === 'editar' ? accion.menor : null}
        libres={libres}
        ahora={ahora}
        alCerrar={() => setAccion(null)}
        alGuardar={(mensaje) => void refrescar(mensaje)}
      />
      <DialogoDeConfirmacion
        abierto={accion?.tipo === 'baja'}
        titulo={accion?.tipo === 'baja' ? `¿Dar de baja a ${accion.menor.nombreCompleto}?` : ''}
        descripcion="Deja de ser residente de su vivienda y su plaza queda libre. Si su rostro estaba en los equipos del conjunto, se retira."
        etiquetaConfirmar="Dar de baja"
        minimoMotivo={MOTIVO_MINIMO_DE_BAJA}
        enviando={enviando}
        error={accion?.tipo === 'baja' ? error : undefined}
        alConfirmar={(motivo) => void darDeBaja(motivo)}
        alCancelar={() => {
          setAccion(null);
          setError(undefined);
        }}
      />
      <DialogoDeCodigo
        codigo={enCodigo?.codigo ?? null}
        titulo={enCodigo === null ? '' : `Código para ${enCodigo.menor.nombreCompleto}`}
        explicacion={EXPLICACION_DEL_CODIGO}
        textoParaCompartir={
          enCodigo === null
            ? ''
            : `Código para crear su cuenta en Next Control Residencial: ${enCodigo.codigo}. Entre a la consola o a la app, pulse «Crear cuenta» y escríbalo en «Código de invitación». Sirve una sola vez.`
        }
        alCerrar={() => setAccion(null)}
      />
    </Seccion>
  );
};
