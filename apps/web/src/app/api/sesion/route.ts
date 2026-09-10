import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  borrarSesion,
  guardarSesion,
  leerSesion,
  marcarFactorPendiente,
} from '@/lib/sesion/cookies';
import {
  FalloDeAcceso,
  cerrarSesionRemota,
  exigeSegundoFactor,
  iniciarSesion,
} from '@/lib/sesion/supabase-auth';
import { textoDeFalloDeAcceso } from '@/lib/sesion/mensajes';
import { configuracion } from '@/lib/configuracion';
import { registrar } from '@/lib/registro';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Alta y baja de sesión.
 *
 * El navegador manda correo y contraseña a **su propio origen**; nunca a
 * Supabase. La respuesta no lleva token: lleva qué hacer a continuación —entrar
 * o pedir el segundo factor—, y el token se queda en la cookie `httpOnly`.
 *
 * El cuerpo se valida aquí aunque el servidor de identidad vuelva a validarlo:
 * un cuerpo con la forma equivocada debe dar 400 con un mensaje útil, no un
 * error de Supabase traducido a medias.
 */

interface Credenciales {
  correo: string;
  contrasena: string;
}

export type ResultadoDeAcceso =
  | { readonly siguiente: 'consola' }
  | { readonly siguiente: 'segundo-factor' }
  /**
   * Rol administrativo autenticado que **todavía no tiene ningún factor**. Sin
   * este destino, el usuario entraba con `aal1`, la API le respondía 401 en
   * cada llamada y la consola no tenía nada que ofrecerle. Era el bloqueo que
   * dejaba el sistema inaccesible.
   */
  | { readonly siguiente: 'inscripcion' };

const esCorreo = (v: unknown): v is string =>
  typeof v === 'string' && v.length >= 5 && v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

const leerCredenciales = async (peticion: NextRequest): Promise<Credenciales | null> => {
  let cuerpo: unknown;
  try {
    cuerpo = await peticion.json();
  } catch {
    return null;
  }
  if (typeof cuerpo !== 'object' || cuerpo === null) return null;
  const { correo, contrasena } = cuerpo as Record<string, unknown>;
  if (!esCorreo(correo)) return null;
  if (typeof contrasena !== 'string' || contrasena.length === 0 || contrasena.length > 256) {
    return null;
  }
  return { correo, contrasena };
};

/**
 * Devuelve el texto del problema si la API **no** acepta este token, o `null`
 * si lo acepta. No interpreta el token: le pregunta a la API, que es la
 * autoridad, exactamente como hace `sesionActual`.
 */
const razonPorLaQueLaApiRechaza = async (accessToken: string): Promise<string | null> => {
  const { apiUrl } = configuracion();
  try {
    const respuesta = await fetch(`${apiUrl}/auth/sesion`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (respuesta.ok) return null;
    if (respuesta.status === 401) {
      return (
        'La consola tiene el segundo factor desactivado, pero la API sigue exigiéndolo. ' +
        'Pon MFA_OBLIGATORIO=false también en el entorno de la API y reiníciala.'
      );
    }
    return `La API respondió ${respuesta.status} al comprobar la sesión.`;
  } catch {
    return 'La API de Next Control no responde. Comprueba que está levantada y que API_URL apunta a ella.';
  }
};

export const POST = async (peticion: NextRequest): Promise<NextResponse> => {
  const credenciales = await leerCredenciales(peticion);
  if (credenciales === null) {
    // Mismo texto que unas credenciales erróneas: distinguir «falta el campo»
    // de «la contraseña no es esa» le ahorra trabajo a quien sondea.
    return NextResponse.json(
      { mensaje: textoDeFalloDeAcceso('CREDENCIALES_INVALIDAS') },
      { status: 400 },
    );
  }

  try {
    const sesion = await iniciarSesion(credenciales.correo, credenciales.contrasena);
    await guardarSesion({
      accessToken: sesion.accessToken,
      refreshToken: sesion.refreshToken,
      expiraEn: sesion.expiraEn,
    });

    if (sesion.nivel === 'aal2') {
      await marcarFactorPendiente(null);
      return NextResponse.json<ResultadoDeAcceso>({ siguiente: 'consola' });
    }

    /**
     * DESVIACIÓN DECLARADA · `MFA_OBLIGATORIO=false`. Con la contraseña
     * verificada se entra directamente, sin inscribir ni verificar factor.
     *
     * Antes de mandar a nadie al tablero se comprueba que **la API opine lo
     * mismo**. Si solo se apagó aquí, el tablero pediría una sesión que la API
     * rechaza y el usuario volvería al login sin una palabra —que es
     * exactamente el síntoma que motivó este interruptor—. Vale más un mensaje
     * que nombra la variable que falta.
     */
    if (!configuracion().mfaObligatorio) {
      await marcarFactorPendiente(null);
      const motivo = await razonPorLaQueLaApiRechaza(sesion.accessToken);
      if (motivo !== null) {
        registrar('error', 'la API no acepta la sesión sin segundo factor', { motivo });
        return NextResponse.json({ mensaje: motivo }, { status: 409 });
      }
      return NextResponse.json<ResultadoDeAcceso>({ siguiente: 'consola' });
    }

    // `aal1` con un factor inscrito: falta el segundo paso (RN-20, CA-25). Si
    // el rol no exige MFA, la API aceptará igualmente el token `aal1`; a quien
    // sí lo exige, la API le responderá 401 hasta que lo complete. La consola
    // no decide eso: se limita a ofrecer el paso cuando hay factor.
    if (sesion.factorPendienteId !== null) {
      await marcarFactorPendiente(sesion.factorPendienteId);
      return NextResponse.json<ResultadoDeAcceso>({ siguiente: 'segundo-factor' });
    }

    await marcarFactorPendiente(null);
    // Sin factor inscrito: si el rol lo exige, hay que inscribirlo AHORA. Si no
    // lo exige —portero, residente—, el token `aal1` le sirve y entra.
    return NextResponse.json<ResultadoDeAcceso>({
      siguiente: exigeSegundoFactor(sesion.rol) ? 'inscripcion' : 'consola',
    });
  } catch (e) {
    if (e instanceof FalloDeAcceso) {
      const estado = e.motivo === 'DEMASIADOS_INTENTOS' ? 429 : 401;
      const cabeceras =
        e.reintentarEn === undefined ? undefined : { 'Retry-After': String(e.reintentarEn) };
      return NextResponse.json(
        { mensaje: textoDeFalloDeAcceso(e.motivo), reintentarEn: e.reintentarEn ?? null },
        cabeceras === undefined ? { status: estado } : { status: estado, headers: cabeceras },
      );
    }
    return NextResponse.json(
      { mensaje: textoDeFalloDeAcceso('SERVICIO_NO_DISPONIBLE') },
      { status: 503 },
    );
  }
};

export const DELETE = async (): Promise<NextResponse> => {
  const sesion = await leerSesion();
  if (sesion !== null && sesion.accessToken !== '') await cerrarSesionRemota(sesion.accessToken);
  await borrarSesion();
  return NextResponse.json({ cerrada: true });
};
