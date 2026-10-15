'use client';

import type { JSX } from 'react';
import { EstadoNoEncontrado, EstadoSinPermiso } from '@/componentes/estados';
import { useMiVivienda, useMisMenores } from '@/lib/api/residente';
import { AVISO_DE_MAYORIA } from '../hogar/fila-de-menor';
import { estadoDeConsulta } from '../comunes';
import { explicacionDelRostroDelMenor, rostroDelMenorEnLaWeb } from '@/lib/rostro';
import { PantallaDeRostro } from './pantalla-de-rostro';

/**
 * 15-Y3 · el rostro de un menor del hogar (ADR-039): sólo el titular, y sólo
 * de 15 a 17. Quien llegue por la dirección sin cumplirlo lee por qué, y la
 * API lo niega igual (403 / 400 con su código).
 */
export const RostroDeMenor = ({
  copropiedadId,
  residenteId,
}: {
  readonly copropiedadId: string;
  readonly residenteId: string;
}): JSX.Element => {
  const menores = useMisMenores(copropiedadId);
  const hogar = useMiVivienda(copropiedadId);
  const pendiente =
    estadoDeConsulta(menores, 'Cargando los menores') ??
    estadoDeConsulta(hogar, 'Cargando tu vivienda');
  if (pendiente !== null) return pendiente;
  const menor = menores.data?.find((m) => m.residenteId === residenteId);
  if (menor === undefined) return <EstadoNoEncontrado />;
  const r = rostroDelMenorEnLaWeb(menor, hogar.data?.vinculo.esTitular ?? false);
  if (r !== 'gestionar') {
    return (
      <EstadoSinPermiso
        titulo={`Rostro de ${menor.nombreCompleto}`}
        descripcion={explicacionDelRostroDelMenor(r) ?? AVISO_DE_MAYORIA}
      />
    );
  }
  return (
    <PantallaDeRostro
      copropiedadId={copropiedadId}
      menor={{ residenteId: menor.residenteId, nombre: menor.nombreCompleto }}
    />
  );
};
