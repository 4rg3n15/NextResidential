'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PuntoDeAcceso } from '@ncr/contracts';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { Boton } from '@/componentes/ui/boton';
import { DialogoDeMotivo } from '@/componentes/dialogo-motivo';

type Modo = 'libre' | 'bloqueada';
const DURACIONES = [30, 60, 120] as const;

const mensajeDe = (e: unknown): string => {
  const codigo = e instanceof ErrorDeApi ? e.estado : 0;
  if (codigo === 403) return 'Sólo la administración deja una puerta libre o bloqueada.';
  return e instanceof Error ? e.message : 'No se pudo completar';
};

/**
 * 15-R · P-25 · dejar UNA puerta del equipo libre o bloqueada, con motivo y
 * plazo. Nunca indefinidamente: al vencer, vuelve sola a normal (la franja de
 * arriba lo dice en toda la consola). La API decide quién puede: aquí sólo se
 * evita el viaje con el motivo, como en la apertura.
 */
export const ModoDeLaPuerta = ({
  copropiedadId,
  equipoId,
  puntos,
}: {
  readonly copropiedadId: string;
  readonly equipoId: string;
  readonly puntos: readonly PuntoDeAcceso[];
}): JSX.Element | null => {
  const clientes = useQueryClient();
  const [pedido, setPedido] = useState<{ puerta: number; modo: Modo } | null>(null);
  const [minutos, setMinutos] = useState<number>(120);
  const fijar = useMutation({
    mutationFn: async (motivo: string) =>
      desenvolver(
        await cliente.POST('/copropiedades/{id}/puertas/modos', {
          params: { path: { id: copropiedadId } },
          body: {
            dispositivoId: equipoId,
            numeroDePuerta: pedido?.puerta ?? 1,
            modo: pedido?.modo ?? 'libre',
            motivo,
            minutos,
          },
        }),
      ),
    onSuccess: () => {
      setPedido(null);
      void clientes.invalidateQueries({ queryKey: ['puertas', copropiedadId, 'modos'] });
    },
  });

  if (puntos.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-secundario font-medium text-texto">Dejar una puerta libre o bloqueada</h4>
      <label className="flex items-center gap-2 text-secundario text-texto">
        Durante
        <select
          value={minutos}
          onChange={(e) => setMinutos(Number(e.target.value))}
          className="rounded-campo border border-borde bg-campo px-2 py-1 text-cuerpo"
        >
          {DURACIONES.map((d) => (
            <option key={d} value={d}>
              {d < 60 ? `${String(d)} min` : `${String(d / 60)} h`}
            </option>
          ))}
        </select>
        y vuelve sola a normal.
      </label>
      <ul className="space-y-1">
        {puntos.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 text-secundario text-texto">
            <span className="min-w-0 flex-1">{p.nombre}</span>
            <Boton
              type="button"
              tamano="sm"
              variante="secundario"
              onClick={() => setPedido({ puerta: p.numeroDePuerta, modo: 'libre' })}
            >
              Dejar libre
            </Boton>
            <Boton
              type="button"
              tamano="sm"
              variante="peligro"
              onClick={() => setPedido({ puerta: p.numeroDePuerta, modo: 'bloqueada' })}
            >
              Bloquear
            </Boton>
          </li>
        ))}
      </ul>
      {fijar.error === null ? null : (
        <p role="alert" className="text-distintivo text-peligro-texto">
          {mensajeDe(fijar.error)}
        </p>
      )}
      {pedido === null ? null : (
        <DialogoDeMotivo
          titulo={pedido.modo === 'libre' ? 'Dejar la puerta libre' : 'Bloquear la puerta'}
          descripcion={
            pedido.modo === 'libre'
              ? 'Cualquiera podrá pasar sin control hasta que venza el plazo o se revierta.'
              : 'Nadie podrá abrirla —ni con autorización— hasta que venza el plazo o se revierta.'
          }
          etiquetaAccion={pedido.modo === 'libre' ? 'Dejar libre' : 'Bloquear'}
          variante={pedido.modo === 'libre' ? 'primario' : 'peligro'}
          cargando={fijar.isPending}
          error={fijar.error === null ? undefined : mensajeDe(fijar.error)}
          alConfirmar={(motivo) => fijar.mutate(motivo)}
          alCancelar={() => setPedido(null)}
        />
      )}
    </div>
  );
};
