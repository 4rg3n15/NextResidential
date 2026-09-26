'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import type { CuentaDeResidente } from '@ncr/contracts';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { TablaDeDatos } from '@/componentes/tabla-datos';
import type { Columna } from '@/componentes/tabla-datos';
import { Boton } from '@/componentes/ui/boton';
import { Distintivo } from '@/componentes/ui/distintivo';
import { EstadoError } from '@/componentes/estados';
import { useCuentasDeResidentes } from './consultas';
import { DialogoDeResidente, DialogoDeRestablecimientoDeResidente } from './dialogos';
import { OcupantesPorVivienda } from './ocupantes';
import { VehiculosDeResidentes } from './vehiculos-de-residentes';

/**
 * PANEL DE RESIDENTES · superadministrador (ETAPA 15-I: 3.1, D4, D5 a, D6).
 *
 * Tres secciones con el patrón de la consola: las cuentas de residente (alta
 * por usuario y restablecimiento), los ocupantes de cada vivienda y los
 * vehículos que registraron los residentes. Todo por la API con el cliente
 * generado; nada toca la base desde el navegador.
 */
export const PantallaDeResidentes = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const cuentas = useCuentasDeResidentes(copropiedadId);
  const [alta, setAlta] = useState(false);
  const [restablecer, setRestablecer] = useState<CuentaDeResidente | null>(null);
  const lista = cuentas.data ?? [];
  const sinVivienda = lista.filter((c) => c.vivienda === null).length;

  const columnas: readonly Columna<CuentaDeResidente>[] = [
    {
      clave: 'nombre',
      titulo: 'Residente',
      celda: (c) => (
        <div>
          <p className="font-medium text-texto">{c.nombre}</p>
          <p className="text-secundario text-texto-apagado">{c.usuario ?? 'cuenta por correo'}</p>
        </div>
      ),
      texto: (c) => `${c.nombre} ${c.usuario ?? ''}`,
    },
    {
      clave: 'vivienda',
      titulo: 'Vivienda',
      celda: (c) =>
        c.vivienda === null ? <Distintivo tono="aviso">Sin vincular</Distintivo> : c.vivienda,
      texto: (c) => c.vivienda ?? '',
    },
    {
      clave: 'cuenta',
      titulo: 'Cuenta',
      celda: (c) =>
        c.debeCambiarContrasena ? (
          <Distintivo tono="aviso">Primer ingreso pendiente</Distintivo>
        ) : c.activa ? (
          <Distintivo tono="exito">Activa</Distintivo>
        ) : (
          <Distintivo tono="neutro">De baja</Distintivo>
        ),
    },
    {
      clave: 'acciones',
      titulo: 'Acciones',
      alineacion: 'derecha',
      celda: (c) => (
        <Boton variante="fantasma" tamano="sm" onClick={() => setRestablecer(c)}>
          Restablecer contraseña
        </Boton>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <EncabezadoDePantalla
        titulo="Residentes"
        descripcion="Cuentas de residentes, ocupantes por vivienda y vehículos que registraron. El residente entra con el código de la copropiedad, su usuario y su contraseña."
        resumen={
          cuentas.isSuccess ? `${lista.length} cuentas · ${sinVivienda} sin vincular` : undefined
        }
        acciones={<Boton onClick={() => setAlta(true)}>Nuevo residente</Boton>}
      />
      {cuentas.isError ? (
        <EstadoError
          descripcion={cuentas.error.message}
          alReintentar={() => void cuentas.refetch()}
        />
      ) : (
        <TablaDeDatos
          titulo="Cuentas de residentes"
          columnas={columnas}
          filas={lista}
          claveDeFila={(c) => c.usuarioId}
          cargando={cuentas.isPending}
          vacio={{
            titulo: 'Sin residentes con cuenta',
            descripcion: 'Da de alta el primero con «Nuevo residente».',
          }}
          buscador={{ marcador: 'Buscar por nombre, usuario o vivienda' }}
        />
      )}
      <OcupantesPorVivienda copropiedadId={copropiedadId} />
      <VehiculosDeResidentes copropiedadId={copropiedadId} />
      <DialogoDeResidente
        copropiedadId={copropiedadId}
        abierto={alta}
        alCerrar={() => setAlta(false)}
      />
      <DialogoDeRestablecimientoDeResidente
        copropiedadId={copropiedadId}
        cuenta={restablecer}
        alCerrar={() => setRestablecer(null)}
      />
    </div>
  );
};
