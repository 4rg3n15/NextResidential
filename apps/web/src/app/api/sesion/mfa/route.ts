import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  factorPendiente,
  guardarSesion,
  leerSesion,
  marcarFactorPendiente,
} from '@/lib/sesion/cookies';
import { FalloDeAcceso, verificarSegundoFactor } from '@/lib/sesion/supabase-auth';
import { estadoDeFalloDeAcceso, textoDeFalloDeAcceso } from '@/lib/sesion/mensajes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Segundo factor TOTP — RN-20, CA-25.
 *
 * La verificación **sustituye** el token: Supabase emite uno nuevo con `aal2`,
 * y el anterior sigue siendo `aal1`. Guardar el nuevo junto al viejo, o
 * conservar el viejo, dejaría al administrador con la sesión que la API rechaza
 * —y con la sensación de haber completado el paso.
 */
export const POST = async (peticion: NextRequest): Promise<NextResponse> => {
  const sesion = await leerSesion();
  const factorId = await factorPendiente();
  /**
   * TRES CAUSAS DISTINTAS, Y ANTES DECÍAN LO MISMO.
   *
   * `sesion === null` y `factorId === null` significan que **no llegó la
   * cookie**; `accessToken === ''` significa que llegó y está agotada. Las tres
   * salían como «La sesión expiró», que en las dos primeras es falso y, peor,
   * inútil: manda a reintentar, y el reintento pierde la cookie otra vez por el
   * mismo motivo. Fue el síntoma con el que se reportó D-68.
   *
   * Ninguno de los dos textos revela nada del servidor: dicen qué pasó del lado
   * del navegador y qué hacer.
   */
  if (sesion === null || factorId === null) {
    return NextResponse.json(
      { mensaje: textoDeFalloDeAcceso('SIN_COOKIE_DE_SESION') },
      { status: 401 },
    );
  }
  if (sesion.accessToken === '') {
    return NextResponse.json({ mensaje: textoDeFalloDeAcceso('SESION_EXPIRADA') }, { status: 401 });
  }

  let codigo: unknown;
  try {
    codigo = ((await peticion.json()) as Record<string, unknown>).codigo;
  } catch {
    codigo = undefined;
  }
  // Seis dígitos, o un código de recuperación `XXXXX-XXXXX`. La misma forma que
  // valida la API, para que la consola no acepte lo que el backend rechazará.
  if (typeof codigo !== 'string' || !/^(\d{6}|[A-Fa-f0-9]{5}-[A-Fa-f0-9]{5})$/.test(codigo)) {
    return NextResponse.json({ mensaje: textoDeFalloDeAcceso('FACTOR_INVALIDO') }, { status: 400 });
  }

  try {
    const elevada = await verificarSegundoFactor(sesion.accessToken, factorId, codigo);
    await guardarSesion({
      accessToken: elevada.accessToken,
      refreshToken: elevada.refreshToken,
      expiraEn: elevada.expiraEn,
    });
    await marcarFactorPendiente(null);
    return NextResponse.json({ siguiente: 'consola' });
  } catch (e) {
    if (e instanceof FalloDeAcceso) {
      const estado = estadoDeFalloDeAcceso(e.motivo, 401);
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
