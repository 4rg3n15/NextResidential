'use client';

import type { JSX } from 'react';
import { EncabezadoDePantalla } from '@/componentes/encabezado-pantalla';
import { EstadoVacio } from '@/componentes/estados';
import { Distintivo } from '@/componentes/ui/distintivo';
import { Tarjeta } from '@/componentes/ui/tarjeta';
import { useMiFamilia } from '@/lib/api/residente';
import type { MiembroDeFamilia } from '@/lib/api/residente';
import { Aviso, estadoDeConsulta, legible } from '../comunes';

const NIVEL_DE_ACCESO: Readonly<Record<string, string>> = {
  acceso_completo: 'Acceso completo',
  solo_ingreso: 'Solo ingreso',
};

const Miembro = ({ m }: { readonly m: MiembroDeFamilia }): JSX.Element => (
  <li className="flex items-center gap-3 border-b border-borde-suave px-5 py-3 last:border-b-0">
    <span
      aria-hidden="true"
      className={
        m.activo
          ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marca-suave font-bold text-marca-texto'
          : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutro-suave font-bold text-neutro-texto'
      }
    >
      {m.nombre.trim() === '' ? '?' : m.nombre.trim().charAt(0).toUpperCase()}
    </span>
    <div className="min-w-0 flex-1">
      <p className="font-medium text-texto">{m.nombre}</p>
      <p className="text-secundario text-texto-apagado">
        {[
          m.parentesco,
          m.esTitular ? 'Titular' : null,
          m.nivelAcceso === null ? null : legible(m.nivelAcceso, NIVEL_DE_ACCESO),
        ]
          .filter((x): x is string => x !== null)
          .join(' · ') || 'Residente'}
      </p>
    </div>
    {!m.activo ? <Distintivo tono="neutro">Desactivado</Distintivo> : null}
  </li>
);

/**
 * M-2 · «Mi familia», sólo lectura: los vincula la administración desde la
 * consola (y las plazas de ocupante, el superadministrador). Un desactivado se
 * ve como tal y no desaparece (RN-19).
 */
export const PantallaDeFamilia = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const familia = useMiFamilia(copropiedadId);
  const miembros = familia.data ?? [];
  const activos = miembros.filter((m) => m.activo).length;

  return (
    <div className="space-y-6">
      <EncabezadoDePantalla
        titulo="Mi familia"
        descripcion="Las personas registradas en tu vivienda. Los adultos entran con un código de plaza; a los menores los registra un adulto del hogar desde la app."
        resumen={
          familia.data !== undefined ? (
            <span className="text-secundario text-texto-apagado">
              {String(activos)} residente(s) en tu vivienda
            </span>
          ) : undefined
        }
      />
      {estadoDeConsulta(familia, 'Cargando tu familia')}
      {familia.data !== undefined && miembros.length === 0 ? (
        <EstadoVacio
          titulo="Sin residentes registrados"
          descripcion="No hay más residentes registrados en tu vivienda. La administración del conjunto los vincula desde la consola."
        />
      ) : null}
      {miembros.length > 0 ? (
        <Tarjeta>
          <ul aria-label="Residentes de mi vivienda">
            {miembros.map((m) => (
              <Miembro key={m.residenteId} m={m} />
            ))}
          </ul>
        </Tarjeta>
      ) : null}
      <Aviso>Hoy sólo el titular de la vivienda puede autorizar visitantes.</Aviso>
    </div>
  );
};
