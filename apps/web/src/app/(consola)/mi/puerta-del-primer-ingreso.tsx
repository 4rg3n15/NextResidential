'use client';

import type { JSX, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EstadoCargando, EstadoSinPermiso, estadoSegunCodigo } from '@/componentes/estados';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { clavesDelResidente } from '@/lib/api/residente';
import { PrimerIngreso } from './primer-ingreso';

/**
 * 15-Y1 · la puerta del primer ingreso, como en la app (`PuertaDePrimerIngreso`):
 * `GET …/mi/alta` dice si la cuenta ya tiene persona en su vivienda. Si no la
 * tiene y SÍ tiene vivienda, se completa aquí; si tampoco tiene vivienda, la
 * administración debe asignársela (`SIN_VIVIENDA`). Sólo envuelve el inicio:
 * es donde el residente cae al entrar.
 */
export const PuertaDelPrimerIngreso = ({
  copropiedadId,
  children,
}: {
  readonly copropiedadId: string;
  readonly children: ReactNode;
}): JSX.Element => {
  const consultas = useQueryClient();
  const clave = [...clavesDelResidente.raiz(copropiedadId), 'alta'] as const;
  const alta = useQuery({
    queryKey: clave,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/mi/alta', {
          params: { path: { id: copropiedadId } },
        }),
      ),
  });
  if (alta.isPending) return <EstadoCargando etiqueta="Cargando tu cuenta" />;
  if (alta.error !== null) {
    return estadoSegunCodigo(
      alta.error instanceof ErrorDeApi ? alta.error : 0,
      alta.error instanceof ErrorDeApi ? alta.error.message : 'Sin conexión con el servidor.',
      () => void alta.refetch(),
    );
  }
  if (alta.data.viviendaVinculada) return <>{children}</>;
  if (!alta.data.viviendaAsignada) {
    return (
      <EstadoSinPermiso
        titulo="Sin vivienda asignada"
        descripcion="La administración debe asignarle su vivienda. Cuando lo haga, aquí podrá completar su primer ingreso."
      />
    );
  }
  return (
    <PrimerIngreso
      copropiedadId={copropiedadId}
      alTerminar={() => void consultas.invalidateQueries({ queryKey: clave })}
    />
  );
};
