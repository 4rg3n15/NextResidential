import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Limitador, claveDeIdentidad, ipDe } from '@/lib/limitador';
import { FalloDeAcceso, solicitarRecuperacion } from '@/lib/sesion/supabase-auth';
import { textoDeFalloDeAcceso } from '@/lib/sesion/mensajes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Solicitud del correo de recuperación — §2.7.5, §2.7.8.
 *
 * **La respuesta es idéntica exista o no la cuenta.** Mismo texto, mismo código
 * y —esto importa tanto como lo anterior— **mismo camino de ejecución**: no se
 * consulta si el correo existe antes de nada, así que tampoco hay una
 * diferencia de tiempo que medir. Un formulario que responde «no encontramos
 * ese correo» es un enumerador de usuarios con formulario.
 *
 * Dos limitadores, porque uno solo deja un hueco: por IP contra quien prueba
 * muchos correos desde un sitio, y por identidad contra quien inunda un buzón
 * concreto desde muchas IP.
 */
const POR_IP = new Limitador({ permitidos: 10, ventanaMs: 15 * 60_000 });
const POR_IDENTIDAD = new Limitador({ permitidos: 3, ventanaMs: 15 * 60_000 });

/** Mismo texto siempre. No se personaliza: personalizarlo sería filtrar. */
const RESPUESTA_UNIFORME =
  'Si ese correo corresponde a una cuenta activa, recibirás un enlace para restablecer la contraseña. ' +
  'Revisa también la carpeta de correo no deseado.';

const esCorreo = (v: unknown): v is string =>
  typeof v === 'string' && v.length >= 5 && v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

export const POST = async (peticion: NextRequest): Promise<NextResponse> => {
  let correo: unknown;
  try {
    correo = ((await peticion.json()) as Record<string, unknown>).correo;
  } catch {
    correo = undefined;
  }

  // Un correo mal formado también recibe la respuesta uniforme. Distinguirlo
  // con un 400 diría «este sí tiene forma de correo, este no», que es poco,
  // pero es más de lo necesario.
  if (!esCorreo(correo)) return NextResponse.json({ mensaje: RESPUESTA_UNIFORME });

  const ip = ipDe(peticion.headers);
  const identidad = claveDeIdentidad(correo);
  const veredicto = [POR_IP.consultar(ip), POR_IDENTIDAD.consultar(identidad)].find(
    (v) => !v.admitido,
  );
  if (veredicto !== undefined) {
    return NextResponse.json(
      {
        mensaje: textoDeFalloDeAcceso('DEMASIADOS_INTENTOS'),
        reintentarEn: veredicto.reintentarEnSegundos,
      },
      { status: 429, headers: { 'Retry-After': String(veredicto.reintentarEnSegundos) } },
    );
  }

  const destino = new URL('/acceso/nueva-contrasena', peticion.nextUrl.origin).toString();
  try {
    await solicitarRecuperacion(correo, destino);
  } catch (e) {
    if (e instanceof FalloDeAcceso && e.motivo === 'DEMASIADOS_INTENTOS') {
      return NextResponse.json(
        { mensaje: textoDeFalloDeAcceso(e.motivo, e.detalle), reintentarEn: e.reintentarEn ?? 60 },
        { status: 429 },
      );
    }
  }

  return NextResponse.json({ mensaje: RESPUESTA_UNIFORME });
};
