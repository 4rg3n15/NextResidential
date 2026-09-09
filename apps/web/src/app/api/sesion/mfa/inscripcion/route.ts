import { NextResponse } from 'next/server';
import { leerSesion, marcarFactorPendiente } from '@/lib/sesion/cookies';
import { FalloDeAcceso, inscribirFactorTotp } from '@/lib/sesion/supabase-auth';
import { textoDeFalloDeAcceso } from '@/lib/sesion/mensajes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Inscripción del segundo factor — **el titular, y solo el titular**.
 *
 * POR QUÉ EXISTE ESTA PANTALLA. El panel de Supabase permite *retirar* factores
 * de un usuario de la aplicación, pero no darlos de alta, y hace bien: un factor
 * inscrito por un tercero no es un segundo factor. El resultado, hasta esta
 * versión, era que ningún rol administrativo podía entrar al sistema — se
 * autenticaba y la API respondía 401 por falta de `aal2`. La guía decía «el
 * titular lo inscribe desde su propia sesión» y esa sesión no tenía dónde
 * hacerlo. (P-14, redefinido.)
 *
 * La identidad sale de la cookie `httpOnly`: no hay ningún parámetro que diga
 * de quién es el factor, así que nadie puede inscribir el de otro. Eso no es
 * una comprobación que se pueda olvidar — es que no existe el dato con el que
 * equivocarse.
 */
export const POST = async (): Promise<NextResponse> => {
  const sesion = await leerSesion();
  if (sesion === null || sesion.accessToken === '') {
    return NextResponse.json({ mensaje: textoDeFalloDeAcceso('SESION_EXPIRADA') }, { status: 401 });
  }

  try {
    const inscripcion = await inscribirFactorTotp(sesion.accessToken);
    // El factor recién inscrito pasa a ser el pendiente de verificar, para que
    // `/api/sesion/mfa` —que ya existía— cierre el paso sin duplicar código.
    await marcarFactorPendiente(inscripcion.factorId);
    return NextResponse.json({ qr: inscripcion.qr, secreto: inscripcion.secreto });
  } catch (e) {
    if (e instanceof FalloDeAcceso) {
      // El estado sale del MOTIVO, no de «lo que no sea 429 es 400». Con la
      // regla anterior, el proveedor caído se le presentaba al titular como un
      // 400: «tu petición está mal» cuando no había nada mal en su petición, y
      // la consola no podía ofrecerle reintentar. Lo detectó su propia prueba.
      const estados: Record<string, number> = {
        DEMASIADOS_INTENTOS: 429,
        SERVICIO_NO_DISPONIBLE: 503,
        SESION_EXPIRADA: 401,
      };
      const estado = estados[e.motivo] ?? 400;
      return NextResponse.json({ mensaje: textoDeFalloDeAcceso(e.motivo) }, { status: estado });
    }
    return NextResponse.json(
      { mensaje: textoDeFalloDeAcceso('SERVICIO_NO_DISPONIBLE') },
      { status: 503 },
    );
  }
};
