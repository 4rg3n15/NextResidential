'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DialogoDeConfirmacion } from '@/componentes/dialogo-confirmacion';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { EstadoVacio } from '@/componentes/estados';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo, DistintivoDePlaca } from '@/componentes/ui/distintivo';
import { CuerpoDeTarjeta, Tarjeta } from '@/componentes/ui/tarjeta';
import { cliente, desenvolver, mensajeDeFallo } from '@/lib/api/cliente';
import { clavesDelResidente, useMisVehiculos } from '@/lib/api/residente';
import type { MiVehiculo } from '@/lib/api/residente';
import { textoDeEliminacion } from '@/lib/hogar';
import { estadoDeConsulta } from '../comunes';
import { EditarVehiculo } from '../hogar/editar-vehiculo';
import { NuevoVehiculo } from './nuevo-vehiculo';

const TarjetaDeVehiculo = ({
  v,
  alEditar,
  alEliminar,
}: {
  readonly v: MiVehiculo;
  readonly alEditar: (v: MiVehiculo) => void;
  readonly alEliminar: (v: MiVehiculo) => void;
}): JSX.Element => {
  const descripcion = [v.marca, v.modelo, v.color]
    .filter((x): x is string => x !== null)
    .join(' · ');
  return (
    <Tarjeta>
      <CuerpoDeTarjeta className="space-y-2 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <DistintivoDePlaca placa={v.placa} />
          <span className="flex gap-1.5">
            {v.esPrincipal ? <Distintivo tono="exito">Principal</Distintivo> : null}
            {!v.activo ? <Distintivo tono="neutro">Desactivado</Distintivo> : null}
            {v.origen === 'administracion' ? (
              <Distintivo tono="neutro">Lo registró la administración</Distintivo>
            ) : null}
          </span>
        </div>
        {descripcion !== '' ? (
          <p className="text-secundario text-texto-apagado">{descripcion}</p>
        ) : null}
        {/* 15-Z2 (DT-15W-02) · los de la administración no se tocan desde aquí: la API contestaría 404. */}
        {v.activo && v.origen === 'propio' ? (
          <div className="flex justify-end gap-2">
            <Boton variante="fantasma" tamano="sm" onClick={() => alEditar(v)}>
              Editar
            </Boton>
            <Boton variante="fantasma" tamano="sm" onClick={() => alEliminar(v)}>
              Eliminar
            </Boton>
          </div>
        ) : null}
      </CuerpoDeTarjeta>
    </Tarjeta>
  );
};

/**
 * M-3 · «Mis vehículos». El residente registra los suyos y, desde la 15-Y2
 * como en la app, los edita y los elimina; el tope por vivienda, la placa
 * duplicada (RN-04) y la vivienda inactiva (RN-13) los decide el servidor y
 * aquí sólo se lee su explicación. «Eliminar» borra sólo si el vehículo no
 * tiene historial; si lo tiene, el servidor lo deja dado de baja y se sigue
 * viendo (RN-19), y la pantalla dice cuál de las dos cosas pasó.
 *
 * [SUPUESTO] S-156 · la eliminación del residente no pide motivo, igual que
 * en la app. El motivo obligatorio es de las bajas de la administración.
 */
export const PantallaDeMisVehiculos = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const consultas = useQueryClient();
  const vehiculos = useMisVehiculos(copropiedadId);
  const [alta, setAlta] = useState(false);
  const [edicion, setEdicion] = useState<MiVehiculo | null>(null);
  const [baja, setBaja] = useState<MiVehiculo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [aviso, setAviso] = useState<string | null>(null);
  const lista = vehiculos.data ?? [];
  const activos = lista.filter((v) => v.activo).length;

  const refrescar = async (): Promise<void> => {
    await consultas.invalidateQueries({ queryKey: clavesDelResidente.raiz(copropiedadId) });
  };

  const avisar = async (mensaje: string): Promise<void> => {
    await refrescar();
    setAviso(mensaje);
  };

  const eliminar = async (): Promise<void> => {
    if (baja === null) return;
    setEnviando(true);
    setError(undefined);
    setAviso(null);
    try {
      const r = desenvolver(
        await cliente.DELETE('/copropiedades/{id}/mi/vehiculos/{vehiculoId}', {
          params: { path: { id: copropiedadId, vehiculoId: baja.id } },
        }),
      );
      setBaja(null);
      await avisar(textoDeEliminacion(r.resultado, baja.placa));
    } catch (fallo) {
      setError(mensajeDeFallo(fallo));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-6">
      <EncabezadoDePantalla
        titulo="Mis vehículos"
        descripcion="Los vehículos registrados en tu vivienda. Con la placa registrada, la entrada los reconoce."
        resumen={
          vehiculos.data !== undefined ? (
            <span className="text-secundario text-texto-apagado">
              {String(activos)} vehículo(s) registrado(s) en tu vivienda
            </span>
          ) : undefined
        }
        acciones={<Boton onClick={() => setAlta(true)}>Registrar vehículo</Boton>}
      />
      {estadoDeConsulta(vehiculos, 'Cargando tus vehículos')}
      {vehiculos.data !== undefined && lista.length === 0 ? (
        <EstadoVacio
          titulo="Sin vehículos registrados"
          descripcion="No hay vehículos registrados en tu vivienda. Registra los tuyos con el botón «Registrar vehículo»."
        />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {lista.map((v) => (
          <TarjetaDeVehiculo key={v.id} v={v} alEditar={setEdicion} alEliminar={setBaja} />
        ))}
      </div>
      {aviso !== null ? (
        <p role="status" className="text-secundario text-exito-texto">
          {aviso}
        </p>
      ) : null}

      <NuevoVehiculo
        copropiedadId={copropiedadId}
        abierto={alta}
        alCerrar={() => setAlta(false)}
        alRegistrar={() => void refrescar()}
      />

      <EditarVehiculo
        copropiedadId={copropiedadId}
        vehiculo={edicion}
        alCerrar={() => setEdicion(null)}
        alGuardar={(mensaje) => void avisar(mensaje)}
      />

      <DialogoDeConfirmacion
        abierto={baja !== null}
        titulo={baja === null ? '' : `¿Eliminar ${baja.placa}?`}
        descripcion="Dejará de abrir la talanquera y libera un cupo de su vivienda. Si el vehículo ya tiene historial en el conjunto, queda dado de baja y su historial se conserva."
        etiquetaConfirmar="Eliminar"
        sinMotivo
        enviando={enviando}
        error={error}
        alConfirmar={() => void eliminar()}
        alCancelar={() => {
          setBaja(null);
          setError(undefined);
        }}
      />
    </div>
  );
};
