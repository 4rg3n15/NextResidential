'use client';

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { DescargaDeRespaldo, RespaldoDiario } from '@ncr/contracts';
import { cliente, desenvolver } from './cliente';

/**
 * D-147 · los respaldos diarios de los eventos, en Informes.
 *
 * La lista se pide al DESPLEGAR la sección, no al abrir Informes: la pantalla
 * no consulta nada hasta que se le pide (ver `PantallaDeInformes`). La
 * descarga tampoco se precarga: la URL firmada vive 5 minutos (RN-21), así que
 * se pide al pulsar «Descargar» y se abre en el acto.
 */
export const clavesDeRespaldos = {
  lista: (copropiedadId: string) => ['respaldos', copropiedadId] as const,
};

export const useRespaldosDiarios = (
  copropiedadId: string,
  habilitada: boolean,
): UseQueryResult<RespaldoDiario[]> =>
  useQuery({
    queryKey: clavesDeRespaldos.lista(copropiedadId),
    enabled: habilitada,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/respaldos', {
          params: { path: { id: copropiedadId } },
        }),
      ),
  });

export const pedirDescargaDeRespaldo = async (
  copropiedadId: string,
  fecha: string,
): Promise<DescargaDeRespaldo> =>
  desenvolver(
    await cliente.GET('/copropiedades/{id}/respaldos/{fecha}/descarga', {
      params: { path: { id: copropiedadId, fecha } },
    }),
  );
