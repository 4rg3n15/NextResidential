import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { configuracion } from '@/lib/configuracion';
import {
  borrarSesion,
  guardarSesion,
  leerSesion,
  marcarFactorPendiente,
} from '@/lib/sesion/cookies';
import { contrasenaValida, motivoDeRechazo } from '@/lib/politica-contrasena';
import {
  FalloDeAcceso,
  exigeSegundoFactor,
  factorTotp,
  refrescarSesion,
} from '@/lib/sesion/supabase-auth';
import { mensajeDeLaApi } from '@/lib/sesion/acceso-por-api';
import { textoDeFalloDeAcceso } from '@/lib/sesion/mensajes';
import { tokenVigente } from '@/lib/sesion/token';
import { Limitador, ipDe } from '@/lib/limitador';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const POR_IP = new Limitador({ permitidos: 20, ventanaMs: 15 * 60_000 });

export type ResultadoDeCambio =
  | { readonly siguiente: 'consola' | 'segundo-factor' | 'inscripcion' }
  /** El proveedor no renovó la sesión tras el cambio: hay que volver a entrar. */
  | { readonly siguiente: 'acceso' };

/**
 * ETAPA 15-H (ADR-023) · el cambio de contraseña del PRIMER INGRESO.
 *
 * Lo decide la API —comprueba la actual, la política y que no sea la misma, y
 * apaga el indicador—. Aquí sólo se valida la forma, se reenvía con el token
 * de la cookie y, si la API acepta, se RENUEVA la sesión: el token vigente
 * todavía lleva `debe_cambiar_contrasena` y seguiría recibiendo 403 hasta
 * caducar. El renovado lo emite el gancho de claims ya sin el indicador.
 */
export const POST = async (peticion: NextRequest): Promise<NextResponse> => {
  const limite = POR_IP.consultar(ipDe(peticion.headers));
  if (!limite.admitido) {
    return NextResponse.json(
      { mensaje: textoDeFalloDeAcceso('DEMASIADOS_INTENTOS') },
      { status: 429, headers: { 'Retry-After': String(limite.reintentarEnSegundos) } },
    );
  }
  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await peticion.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ mensaje: 'Petición sin cuerpo' }, { status: 400 });
  }
  const { actual, nueva } = cuerpo;
  if (typeof actual !== 'string' || actual.length === 0 || actual.length > 256) {
    return NextResponse.json({ mensaje: 'Escribe tu contraseña actual.' }, { status: 400 });
  }
  if (typeof nueva !== 'string' || !contrasenaValida(nueva)) {
    const detalle = typeof nueva === 'string' ? motivoDeRechazo(nueva) : null;
    return NextResponse.json(
      { mensaje: detalle ?? textoDeFalloDeAcceso('CONTRASENA_DEBIL') },
      { status: 400 },
    );
  }

  const token = await tokenVigente();
  const almacenada = await leerSesion();
  if (token === null || almacenada === null) {
    return NextResponse.json(
      { mensaje: textoDeFalloDeAcceso('SIN_COOKIE_DE_SESION') },
      { status: 401 },
    );
  }

  const { apiUrl } = configuracion();
  let respuesta: Response;
  try {
    respuesta = await fetch(`${apiUrl}/auth/contrasena`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ actual, nueva }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { mensaje: textoDeFalloDeAcceso('SERVICIO_NO_DISPONIBLE') },
      { status: 503 },
    );
  }
  if (!respuesta.ok) {
    return NextResponse.json(
      { mensaje: (await mensajeDeLaApi(respuesta)) ?? 'No se pudo cambiar la contraseña.' },
      { status: respuesta.status >= 500 ? 503 : respuesta.status },
    );
  }

  try {
    const renovada = await refrescarSesion(almacenada.refreshToken);
    await guardarSesion({
      accessToken: renovada.accessToken,
      refreshToken: renovada.refreshToken,
      expiraEn: renovada.expiraEn,
    });
    if (renovada.nivel === 'aal2')
      return NextResponse.json<ResultadoDeCambio>({ siguiente: 'consola' });
    const factor = await factorTotp(renovada.accessToken);
    await marcarFactorPendiente(factor);
    if (factor !== null)
      return NextResponse.json<ResultadoDeCambio>({ siguiente: 'segundo-factor' });
    return NextResponse.json<ResultadoDeCambio>({
      siguiente: exigeSegundoFactor(renovada.rol) ? 'inscripcion' : 'consola',
    });
  } catch (e) {
    if (!(e instanceof FalloDeAcceso)) throw e;
    await borrarSesion();
    return NextResponse.json<ResultadoDeCambio>({ siguiente: 'acceso' });
  }
};
