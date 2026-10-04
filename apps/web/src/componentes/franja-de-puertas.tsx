'use client';

import type { JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DoorOpen, Lock } from 'lucide-react';
import { cliente, desenvolver } from '@/lib/api/cliente';
import { Boton } from './ui/boton';

/** Quién ve el aviso: los que operan la puerta. Quién revierte: la administración. */
const VEN = new Set(['portero', 'operador_central', 'administrador', 'superadministrador']);
const REVIERTEN = new Set(['administrador', 'superadministrador']);
const RECARGA_MS = 30_000;

const hora = (iso: string): string =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

/**
 * 15-R · P-25 · C4 · FRANJA FIJA mientras alguna puerta esté libre o bloqueada.
 *
 * Como la del modo pruebas: no se descarta. Una puerta libre es un conjunto sin
 * control de acceso, y tiene que verse en todas las pantallas: quién la dejó
 * así, por qué, desde cuándo y cuándo vuelve sola a normal. La administración
 * tiene además «Revertir ahora». Si la reversión automática falló, se dice.
 */
export const FranjaDePuertas = ({
  copropiedadId,
  rol,
}: {
  readonly copropiedadId: string;
  readonly rol: string;
}): JSX.Element | null => {
  const clientes = useQueryClient();
  const clave = ['puertas', copropiedadId, 'modos'];
  const ruta = { params: { path: { id: copropiedadId } } };
  const vigentes = useQuery({
    queryKey: clave,
    enabled: VEN.has(rol),
    refetchInterval: RECARGA_MS,
    queryFn: async () =>
      desenvolver(await cliente.GET('/copropiedades/{id}/puertas/modos', ruta)).modos,
  });
  const revertir = useMutation({
    mutationFn: async (p: { readonly dispositivoId: string; readonly numeroDePuerta: number }) =>
      desenvolver(
        await cliente.POST('/copropiedades/{id}/puertas/modos/reversion', { ...ruta, body: p }),
      ),
    onSettled: () => void clientes.invalidateQueries({ queryKey: clave }),
  });

  const modos = vigentes.data ?? [];
  if (!VEN.has(rol) || modos.length === 0) return null;
  return (
    <div
      role="alert"
      className="sticky top-0 z-40 space-y-1 border-b border-peligro bg-peligro-suave px-4 py-2 text-secundario text-peligro-texto"
    >
      {modos.map((m) => {
        const Icono = m.modo === 'libre' ? DoorOpen : Lock;
        return (
          <div key={m.id} className="flex flex-wrap items-center justify-center gap-2 text-center">
            <Icono className="h-4 w-4 shrink-0" aria-hidden="true" strokeWidth={2} />
            <span>
              <strong>
                Puerta {String(m.numeroDePuerta)} {m.modo === 'libre' ? 'LIBRE' : 'BLOQUEADA'}
              </strong>{' '}
              desde las {hora(m.desde)}, por {m.operadorNombre ?? `la ${m.rol}`}: «{m.motivo}».
              Vuelve sola a normal a las {hora(m.revierteEn)}.
              {m.reversionesFallidas > 0
                ? ` La reversión automática no llegó al equipo (${String(m.reversionesFallidas)} intento${m.reversionesFallidas === 1 ? '' : 's'}): se reintenta.`
                : null}
            </span>
            {REVIERTEN.has(rol) ? (
              <Boton
                type="button"
                tamano="sm"
                variante="secundario"
                cargando={
                  revertir.isPending && revertir.variables.dispositivoId === m.dispositivoId
                }
                onClick={() =>
                  revertir.mutate({
                    dispositivoId: m.dispositivoId,
                    numeroDePuerta: m.numeroDePuerta,
                  })
                }
              >
                Revertir ahora
              </Boton>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
