'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { Campo } from '@/componentes/ui/campo';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import type { MiVehiculo } from '@/lib/api/residente';
import { placaSinSeparadores } from '@/lib/hogar';

interface Datos {
  readonly placa: string;
  readonly color: string;
  readonly modelo: string;
  readonly marca: string;
}

const datosDe = (v: MiVehiculo): Datos => ({
  placa: v.placa,
  color: v.color ?? '',
  modelo: v.modelo ?? '',
  marca: v.marca ?? '',
});

/**
 * 15-Y2 · «Editar vehículo», como en la app (15-W): color, modelo, marca y la
 * placa. El tipo no se edita, y quién lo usa tampoco desde aquí. La placa sólo
 * viaja si cambió de verdad (sin separadores ni minúsculas) y sólo la admite
 * el servidor si el vehículo no tiene historial: si lo tiene, contesta 409 y
 * su explicación se lee tal cual.
 */
export const EditarVehiculo = ({
  copropiedadId,
  vehiculo,
  alCerrar,
  alGuardar,
}: {
  readonly copropiedadId: string;
  readonly vehiculo: MiVehiculo | null;
  readonly alCerrar: () => void;
  readonly alGuardar: (mensaje: string) => void;
}): JSX.Element => {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [errores, setErrores] = useState<Readonly<Record<string, string>>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const d = datos ?? (vehiculo === null ? null : datosDe(vehiculo));
  const cambiar = <K extends keyof Datos>(clave: K, valor: Datos[K]): void => {
    if (d !== null) setDatos({ ...d, [clave]: valor });
  };

  const placa = d === null ? '' : placaSinSeparadores(d.placa);
  const completo =
    d !== null &&
    placa.length >= 3 &&
    placa.length <= 12 &&
    d.color.trim() !== '' &&
    d.modelo.trim() !== '';

  const cerrar = (): void => {
    setDatos(null);
    setErrores({});
    setError(undefined);
    alCerrar();
  };

  const guardar = async (): Promise<void> => {
    if (vehiculo === null || d === null || !completo) return;
    setEnviando(true);
    setError(undefined);
    setErrores({});
    try {
      desenvolver(
        await cliente.PUT('/copropiedades/{id}/mi/vehiculos/{vehiculoId}', {
          params: { path: { id: copropiedadId, vehiculoId: vehiculo.id } },
          body: {
            color: d.color.trim(),
            modelo: d.modelo.trim(),
            marca: d.marca.trim() === '' ? null : d.marca.trim(),
            // Sólo si cambió: la misma placa no es un cambio de placa.
            placa: placa === placaSinSeparadores(vehiculo.placa) ? null : placa,
          },
        }),
      );
      setDatos(null);
      alGuardar(`Vehículo ${vehiculo.placa} actualizado.`);
      alCerrar();
    } catch (fallo) {
      if (fallo instanceof ErrorDeApi && fallo.porCampo !== undefined) setErrores(fallo.porCampo);
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No hay conexión con el servidor.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogoDeFormulario
      abierto={vehiculo !== null}
      titulo="Editar vehículo"
      descripcion="La placa sólo se cambia si el vehículo todavía no tiene historial en el conjunto."
      etiquetaEnviar={enviando ? 'Guardando…' : 'Guardar'}
      enviando={enviando}
      error={error}
      puedeEnviar={completo && !enviando}
      alEnviar={() => void guardar()}
      alCancelar={cerrar}
    >
      {d !== null ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            etiqueta="Placa"
            name="placa"
            required
            maxLength={12}
            value={d.placa}
            onChange={(e) => cambiar('placa', e.target.value.toUpperCase())}
            error={errores.placa}
            ayuda="Se guarda en mayúsculas, sin espacios ni guiones."
          />
          <Campo
            etiqueta="Color"
            name="color"
            required
            maxLength={40}
            value={d.color}
            onChange={(e) => cambiar('color', e.target.value)}
            error={errores.color}
          />
          <Campo
            etiqueta="Modelo"
            name="modelo"
            required
            maxLength={60}
            value={d.modelo}
            onChange={(e) => cambiar('modelo', e.target.value)}
            error={errores.modelo}
          />
          <Campo
            etiqueta="Marca (opcional)"
            name="marca"
            maxLength={60}
            value={d.marca}
            onChange={(e) => cambiar('marca', e.target.value)}
            error={errores.marca}
          />
        </div>
      ) : null}
    </DialogoDeFormulario>
  );
};
