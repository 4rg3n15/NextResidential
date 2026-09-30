'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DisparadorDeAtencion, PreferenciasDeAtencion } from '@ncr/contracts';
import { Boton } from '@/componentes/ui/boton';
import { cliente, desenvolver, ErrorDeApi } from '@/lib/api/cliente';
import { ETIQUETA_DE_DISPARADOR } from '@/lib/atencion/seleccion';

const DISPARADORES: readonly DisparadorDeAtencion[] = [
  'llamada',
  'rostro',
  'placa',
  'lista_negra',
  'dudoso',
];

/**
 * G2 (15-N) · QUÉ ABRE SOLA LA ATENCIÓN Y QUÉ SUENA, POR COPROPIEDAD.
 *
 * Todo activado por omisión. Apagar «abrir sola» deja el elemento en la cola
 * hasta que alguien lo elija; apagar «sonar» lo deja entrar en silencio. Lo
 * cambia la administración; lo guarda la API con autor y fecha.
 */
export const PreferenciasDeAtencionEditables = ({
  copropiedadId,
}: {
  readonly copropiedadId: string;
}): JSX.Element => {
  const consultas = useQueryClient();
  const clave = ['guardia', copropiedadId, 'preferencias'] as const;
  const guardadas = useQuery({
    queryKey: clave,
    queryFn: async () =>
      desenvolver(
        await cliente.GET('/copropiedades/{id}/guardia/preferencias', {
          params: { path: { id: copropiedadId } },
        }),
      ),
  });
  const [borrador, setBorrador] = useState<PreferenciasDeAtencion | null>(null);
  useEffect(() => {
    if (guardadas.data !== undefined) setBorrador(guardadas.data);
  }, [guardadas.data]);

  const guardar = useMutation({
    mutationFn: async (p: PreferenciasDeAtencion) =>
      desenvolver(
        await cliente.PUT('/copropiedades/{id}/guardia/preferencias', {
          params: { path: { id: copropiedadId } },
          body: p,
        }),
      ),
    onSuccess: async () => {
      await consultas.invalidateQueries({ queryKey: ['guardia', copropiedadId] });
    },
  });

  if (borrador === null) {
    return (
      <p className="text-secundario text-texto-apagado">
        {guardadas.isError ? 'No se pudieron leer las preferencias.' : 'Consultando…'}
      </p>
    );
  }
  const cambiar = (d: DisparadorDeAtencion, campo: 'abrir' | 'sonar', valor: boolean): void =>
    setBorrador({ ...borrador, [d]: { ...borrador[d], [campo]: valor } });

  return (
    <div className="space-y-3">
      <table className="w-full text-secundario">
        <thead>
          <tr className="text-left text-etiqueta uppercase tracking-wide text-texto-apagado">
            <th className="py-1 font-medium">Qué llega</th>
            <th className="py-1 font-medium">Se abre sola</th>
            <th className="py-1 font-medium">Suena</th>
          </tr>
        </thead>
        <tbody>
          {DISPARADORES.map((d) => (
            <tr key={d} className="border-t border-borde">
              <td className="py-2 text-texto">{ETIQUETA_DE_DISPARADOR[d]}</td>
              <td className="py-2">
                <input
                  type="checkbox"
                  aria-label={`${ETIQUETA_DE_DISPARADOR[d]}: se abre sola`}
                  checked={borrador[d].abrir}
                  onChange={(e) => cambiar(d, 'abrir', e.target.checked)}
                />
              </td>
              <td className="py-2">
                <input
                  type="checkbox"
                  aria-label={`${ETIQUETA_DE_DISPARADOR[d]}: suena`}
                  checked={borrador[d].sonar}
                  onChange={(e) => cambiar(d, 'sonar', e.target.checked)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-2">
        <Boton
          variante="primario"
          tamano="sm"
          cargando={guardar.isPending}
          onClick={() => guardar.mutate(borrador)}
        >
          Guardar avisos
        </Boton>
        {guardar.isSuccess ? (
          <span role="status" className="text-distintivo text-exito-texto">
            Guardado: la guardia y la portería lo aplican en su siguiente consulta.
          </span>
        ) : null}
        {guardar.isError ? (
          <span role="alert" className="text-distintivo text-peligro-texto">
            {guardar.error instanceof ErrorDeApi
              ? guardar.error.message
              : 'No se pudo guardar. Vuelve a intentarlo.'}
          </span>
        ) : null}
      </div>
    </div>
  );
};
