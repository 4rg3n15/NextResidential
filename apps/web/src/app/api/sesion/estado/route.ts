import { NextResponse } from 'next/server';
import { factorPendiente } from '@/lib/sesion/cookies';
import { tokenVigente } from '@/lib/sesion/token';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Estado de la sesión para el navegador — **sin el token**.
 *
 * Devuelve el instante de expiración porque el canal en vivo lo necesita: con
 * él programa una reconexión ANTES de que el token caduque, en vez de esperar
 * a que la conexión muera. Ese es el punto que el enunciado de la etapa
 * subraya: refrescar de forma perezosa, al recibir un 401, tumba el flujo —un
 * SSE ya abierto no tiene a quién devolverle el 401, así que simplemente deja
 * de entregar sin avisar.
 *
 * Llamar aquí **renueva el token si hace falta** (`tokenVigente`), así que la
 * consulta del estado es también el mecanismo de refresco.
 */
export interface EstadoDeSesion {
  readonly autenticado: boolean;
  /** Segundos desde la época en que caduca el token vigente. */
  readonly expiraEn: number | null;
  readonly segundoFactorPendiente: boolean;
}

export const GET = async (): Promise<NextResponse<EstadoDeSesion>> => {
  const token = await tokenVigente();
  const pendiente = await factorPendiente();
  return NextResponse.json<EstadoDeSesion>(
    {
      autenticado: token !== null,
      expiraEn: token?.expiraEn ?? null,
      segundoFactorPendiente: pendiente !== null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
};
