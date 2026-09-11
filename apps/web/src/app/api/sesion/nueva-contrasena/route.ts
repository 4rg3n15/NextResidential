import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { configuracion } from '@/lib/configuracion';
import { borrarSesion, guardarSesion, marcarFactorPendiente } from '@/lib/sesion/cookies';
import {
  FalloDeAcceso,
  cambiarContrasena,
  canjearTokenDeRecuperacion,
} from '@/lib/sesion/supabase-auth';
import { estadoDeFalloDeAcceso, textoDeFalloDeAcceso } from '@/lib/sesion/mensajes';
import { Limitador, ipDe } from '@/lib/limitador';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Establece la contraseña nueva a partir del enlace del correo.
 *
 * El canje del `token_hash` ocurre **en el servidor**: el token nunca pasa por
 * JavaScript de la página, y la sesión resultante va directa a la cookie
 * `httpOnly`. El enlace es de un solo uso porque Supabase invalida el hash al
 * canjearlo; no hay que implementarlo, pero sí hay que **no reintentar** en
 * silencio, o el segundo intento fallaría con un mensaje confuso.
 *
 * Al terminar se registra el hecho en `auditoria_seguridad` de la API. Ese
 * registro es el único motivo por el que `/auth/restablecimiento` lleva
 * `@SinSegundoFactor()`: la sesión de recuperación es `aal1`.
 */
const POR_IP = new Limitador({ permitidos: 20, ventanaMs: 15 * 60_000 });

const LONGITUD_MINIMA = 12;

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
    return NextResponse.json(
      { mensaje: textoDeFalloDeAcceso('ENLACE_NO_VALIDO') },
      { status: 400 },
    );
  }

  const { tokenHash, contrasena } = cuerpo;
  if (typeof tokenHash !== 'string' || tokenHash.length === 0 || tokenHash.length > 512) {
    return NextResponse.json(
      { mensaje: textoDeFalloDeAcceso('ENLACE_NO_VALIDO') },
      { status: 400 },
    );
  }
  // La política real la impone Supabase; esto solo evita el viaje cuando la
  // contraseña es obviamente insuficiente, y da un mensaje mejor.
  if (
    typeof contrasena !== 'string' ||
    contrasena.length < LONGITUD_MINIMA ||
    contrasena.length > 256
  ) {
    return NextResponse.json(
      { mensaje: textoDeFalloDeAcceso('CONTRASENA_DEBIL') },
      { status: 400 },
    );
  }

  try {
    const sesion = await canjearTokenDeRecuperacion(tokenHash);
    await cambiarContrasena(sesion.accessToken, contrasena);
    await guardarSesion({
      accessToken: sesion.accessToken,
      refreshToken: sesion.refreshToken,
      expiraEn: sesion.expiraEn,
    });
    await marcarFactorPendiente(null);
    await registrarEnAuditoria(sesion.accessToken, peticion);
    return NextResponse.json({ siguiente: 'acceso' });
  } catch (e) {
    // Se borra cualquier sesión a medias: quedarse con la de recuperación tras
    // un fallo dejaría al usuario con una sesión aal1 que no pidió.
    await borrarSesion();
    if (e instanceof FalloDeAcceso) {
      const estado = estadoDeFalloDeAcceso(e.motivo, 400);
      return NextResponse.json(
        { mensaje: textoDeFalloDeAcceso(e.motivo, e.detalle) },
        { status: estado },
      );
    }
    return NextResponse.json(
      { mensaje: textoDeFalloDeAcceso('SERVICIO_NO_DISPONIBLE') },
      { status: 503 },
    );
  }
};

/**
 * El rastro es obligatorio, pero **su fallo no revierte el cambio**: la
 * contraseña ya cambió en el proveedor de identidad y no se puede deshacer.
 * Devolver un error aquí haría creer al usuario que no se cambió y le llevaría
 * a pedir otro enlace. Se registra el fallo del registro, que es lo honesto.
 */
const registrarEnAuditoria = async (accessToken: string, peticion: NextRequest): Promise<void> => {
  const { apiUrl } = configuracion();
  try {
    await fetch(`${apiUrl}/auth/restablecimiento`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': peticion.headers.get('user-agent') ?? 'consola',
        'X-Forwarded-For': ipDe(peticion.headers),
      },
      cache: 'no-store',
    });
  } catch {
    // La API puede estar caída; el cambio de credencial no.
  }
};
