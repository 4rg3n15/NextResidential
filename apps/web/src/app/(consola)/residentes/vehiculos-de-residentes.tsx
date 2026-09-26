'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { VehiculoDeResidente } from '@ncr/contracts';
import { cliente, desenvolver } from '@/lib/api/cliente';
import { TablaDeDatos } from '@/componentes/tabla-datos';
import type { Columna } from '@/componentes/tabla-datos';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import { DialogoDeConfirmacion } from '@/componentes/dialogo-confirmacion';
import { clavesDeResidentes, useVehiculosDeResidentes } from './consultas';

const fecha = (iso: string): string =>
  new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );

/**
 * D5 a · LOS VEHÍCULOS QUE REGISTRARON LOS RESIDENTES.
 *
 * Es el contrapeso de una propiedad que el sistema no puede comprobar: entran
 * activos al instante y el superadministrador los ve aquí con fecha, vivienda y
 * quién los registró, y desactiva cualquiera con motivo (por la ruta del padrón
 * de siempre). Los que registra él por encima del tope están en «Vehículos».
 */
export const VehiculosDeResidentes = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const consultas = useQueryClient();
  const vehiculos = useVehiculosDeResidentes(copropiedadId);
  const [baja, setBaja] = useState<VehiculoDeResidente | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  const desactivar = async (motivo: string): Promise<void> => {
    if (baja === null) return;
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.POST('/copropiedades/{id}/padron/vehiculos/{vehiculoId}/desactivacion', {
          params: { path: { id: copropiedadId, vehiculoId: baja.id } },
          body: { motivo },
        }),
      );
      await consultas.invalidateQueries({ queryKey: clavesDeResidentes.vehiculos(copropiedadId) });
      setBaja(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo desactivar.');
    } finally {
      setEnviando(false);
    }
  };

  const columnas: readonly Columna<VehiculoDeResidente>[] = [
    {
      clave: 'placa',
      titulo: 'Placa',
      celda: (v) => <span className="font-mono">{v.placa}</span>,
      texto: (v) => v.placa,
    },
    { clave: 'vivienda', titulo: 'Vivienda', celda: (v) => v.vivienda, texto: (v) => v.vivienda },
    {
      clave: 'vehiculo',
      titulo: 'Vehículo',
      celda: (v) => [v.marca, v.modelo, v.color].filter((x) => x !== null).join(' · '),
    },
    { clave: 'ocupantes', titulo: 'Ocupantes', celda: (v) => v.ocupantes.join(', ') },
    {
      clave: 'registro',
      titulo: 'Registrado',
      celda: (v) => `${fecha(v.registradoEn)} · ${v.registradoPor ?? '—'}`,
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      celda: (v) =>
        v.activo ? (
          <Distintivo tono="exito">Activo</Distintivo>
        ) : (
          <Distintivo tono="neutro">De baja</Distintivo>
        ),
    },
    {
      clave: 'acciones',
      titulo: 'Acciones',
      alineacion: 'derecha',
      celda: (v) =>
        v.activo ? (
          <Boton variante="fantasma" tamano="sm" onClick={() => setBaja(v)}>
            Desactivar
          </Boton>
        ) : null,
    },
  ];

  return (
    <>
      <TablaDeDatos
        titulo="Vehículos registrados por residentes"
        columnas={columnas}
        filas={vehiculos.data ?? []}
        claveDeFila={(v) => v.id}
        cargando={vehiculos.isPending}
        vacio={{
          titulo: 'Ningún residente ha registrado vehículos',
          descripcion: 'Aparecen aquí en cuanto un ocupante registra uno desde la app.',
        }}
        buscador={{ marcador: 'Buscar por placa o vivienda' }}
      />
      <DialogoDeConfirmacion
        abierto={baja !== null}
        titulo={`Desactivar ${baja?.placa ?? ''}`}
        descripcion="Deja de pasar en ese mismo momento y libera el cupo de la vivienda. Queda con su motivo."
        etiquetaConfirmar="Desactivar"
        enviando={enviando}
        error={error}
        alConfirmar={(m) => void desactivar(m)}
        alCancelar={() => setBaja(null)}
      />
    </>
  );
};
