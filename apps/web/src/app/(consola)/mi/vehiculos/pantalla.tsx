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
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { clavesDelResidente, useMisVehiculos } from '@/lib/api/residente';
import type { MiVehiculo } from '@/lib/api/residente';
import { estadoDeConsulta } from '../comunes';
import { NuevoVehiculo } from './nuevo-vehiculo';

const TarjetaDeVehiculo = ({
  v,
  alDarDeBaja,
}: {
  readonly v: MiVehiculo;
  readonly alDarDeBaja: (v: MiVehiculo) => void;
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
          </span>
        </div>
        {descripcion !== '' ? (
          <p className="text-secundario text-texto-apagado">{descripcion}</p>
        ) : null}
        {v.activo ? (
          <div className="flex justify-end">
            <Boton variante="fantasma" tamano="sm" onClick={() => alDarDeBaja(v)}>
              Dar de baja
            </Boton>
          </div>
        ) : null}
      </CuerpoDeTarjeta>
    </Tarjeta>
  );
};

/**
 * M-3 · «Mis vehículos». El residente registra los suyos y los da de baja;
 * el tope por vivienda, la placa duplicada (RN-04) y la vivienda inactiva
 * (RN-13) los decide el servidor y aquí sólo se lee su explicación. La baja
 * no borra: el vehículo queda desactivado y se sigue viendo (RN-19).
 *
 * [SUPUESTO] S-156 · la baja del residente no pide motivo: la ruta
 * `…/mi/vehiculos/{id}/desactivacion` no lo recibe, igual que en la app. El
 * motivo obligatorio es de las bajas que hace la administración (C4/C9).
 */
export const PantallaDeMisVehiculos = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const consultas = useQueryClient();
  const vehiculos = useMisVehiculos(copropiedadId);
  const [alta, setAlta] = useState(false);
  const [baja, setBaja] = useState<MiVehiculo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const lista = vehiculos.data ?? [];
  const activos = lista.filter((v) => v.activo).length;

  const refrescar = async (): Promise<void> => {
    await consultas.invalidateQueries({ queryKey: clavesDelResidente.raiz(copropiedadId) });
  };

  const darDeBaja = async (): Promise<void> => {
    if (baja === null) return;
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.POST('/copropiedades/{id}/mi/vehiculos/{vehiculoId}/desactivacion', {
          params: { path: { id: copropiedadId, vehiculoId: baja.id } },
        }),
      );
      setBaja(null);
      await refrescar();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No hay conexión con el servidor.');
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
          <TarjetaDeVehiculo key={v.id} v={v} alDarDeBaja={setBaja} />
        ))}
      </div>

      <NuevoVehiculo
        copropiedadId={copropiedadId}
        abierto={alta}
        alCerrar={() => setAlta(false)}
        alRegistrar={() => void refrescar()}
      />

      <DialogoDeConfirmacion
        abierto={baja !== null}
        titulo="Dar de baja el vehículo"
        descripcion={
          baja === null
            ? ''
            : `La placa ${baja.placa} dejará de reconocerse en la entrada. El vehículo no se borra: queda desactivado en tu historial.`
        }
        etiquetaConfirmar="Dar de baja"
        sinMotivo
        enviando={enviando}
        error={error}
        alConfirmar={() => void darDeBaja()}
        alCancelar={() => {
          setBaja(null);
          setError(undefined);
        }}
      />
    </div>
  );
};
