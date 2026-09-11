import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { leerSesion, marcarFactorPendiente } from '@/lib/sesion/cookies';
import { FalloDeAcceso, factoresDelTitular, inscribirFactorTotp } from '@/lib/sesion/supabase-auth';
import type { InscripcionDeFactor } from '@/lib/sesion/supabase-auth';
import { textoDeFalloDeAcceso } from '@/lib/sesion/mensajes';
import { registrar } from '@/lib/registro';

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

/**
 * UNA INSCRIPCIÓN POR TITULAR A LA VEZ.
 *
 * El defecto que lo motivó, reportado desde el proyecto real: dos POST casi
 * simultáneos, el primero `503` y el segundo `200`. El cliente los provoca
 * —en desarrollo el modo estricto de React invoca dos veces el efecto, y un
 * doble clic o un reintento hacen lo mismo en producción—, y los dos entraban
 * aquí a la vez. Cada uno lee los factores del titular, borra los que estén a
 * medio inscribir y crea uno nuevo: **leer y borrar sin atomicidad**. El que
 * llega segundo choca con el nombre ya tomado y el proveedor lo rechaza; peor
 * todavía, el que llega segundo puede borrar el factor que el primero acaba de
 * crear y devolver un QR que ya no existe.
 *
 * La salida no es reintentar más veces: es **no hacer dos veces la misma
 * operación**. Las peticiones concurrentes del mismo titular comparten una
 * única inscripción y reciben la misma respuesta.
 *
 * La clave es un HASH del token, no el token: este mapa vive en memoria del
 * proceso y un token en una estructura de larga vida es un token que acaba en
 * un volcado. Y se limpia al terminar, así que no crece.
 *
 * Es memoria de un proceso, no un candado distribuido: con varias instancias
 * detrás de un balanceador dos titulares podrían coincidir en instancias
 * distintas. El reintento de `inscribirFactorTotp` cubre ese resto — son las
 * dos capas, no una.
 */
const enCurso = new Map<string, Promise<InscripcionDeFactor>>();

const claveDe = (accessToken: string): string =>
  createHash('sha256').update(accessToken).digest('hex').slice(0, 32);

const inscribirUnaVez = async (accessToken: string): Promise<InscripcionDeFactor> => {
  const clave = claveDe(accessToken);
  const yaEnCurso = enCurso.get(clave);
  if (yaEnCurso !== undefined) return await yaEnCurso;

  const tarea = inscribirFactorTotp(accessToken).finally(() => enCurso.delete(clave));
  enCurso.set(clave, tarea);
  return await tarea;
};

export const POST = async (): Promise<NextResponse> => {
  const sesion = await leerSesion();
  if (sesion === null || sesion.accessToken === '') {
    return NextResponse.json({ mensaje: textoDeFalloDeAcceso('SESION_EXPIRADA') }, { status: 401 });
  }

  try {
    const inscripcion = await inscribirUnaVez(sesion.accessToken);
    // El factor recién inscrito pasa a ser el pendiente de verificar, para que
    // `/api/sesion/mfa` —que ya existía— cierre el paso sin duplicar código.
    await marcarFactorPendiente(inscripcion.factorId);
    return NextResponse.json({ qr: inscripcion.qr, secreto: inscripcion.secreto });
  } catch (e) {
    // Un intento fallido NO deja residuo: sin esto, la cookie seguía apuntando
    // a un factor que no llegó a existir y el paso de verificación pedía un
    // código para nada. Fue parte del estado inconsistente que el cliente
    // describió — «el factor quedó a medias».
    await marcarFactorPendiente(null);

    if (e instanceof FalloDeAcceso && e.motivo === 'SEGUNDO_FACTOR_YA_INSCRITO') {
      /**
       * Este caso NO es un error del usuario, así que no se le devuelve como
       * tal: se le devuelve el camino. Ya tiene un factor verificado, de modo
       * que lo que le falta es verificarlo, no inscribir otro. La consola
       * cambia de paso sola.
       */
      const verificado = (await factoresDelTitular(sesion.accessToken).catch(() => [])).find(
        (f) => f.status === 'verified',
      );
      if (verificado !== undefined) {
        await marcarFactorPendiente(verificado.id);
        registrar('aviso', 'inscripcion innecesaria: el titular ya tiene factor verificado', {
          estado: 409,
        });
        return NextResponse.json(
          { siguiente: 'segundo-factor', mensaje: textoDeFalloDeAcceso(e.motivo, e.detalle) },
          { status: 409 },
        );
      }
    }

    if (e instanceof FalloDeAcceso) {
      // El estado sale del MOTIVO, no de «lo que no sea 429 es 400». Con la
      // regla anterior, el proveedor caído se le presentaba al titular como un
      // 400: «tu petición está mal» cuando no había nada mal en su petición, y
      // la consola no podía ofrecerle reintentar. Lo detectó su propia prueba.
      const estados: Record<string, number> = {
        DEMASIADOS_INTENTOS: 429,
        SERVICIO_NO_DISPONIBLE: 503,
        SESION_EXPIRADA: 401,
        FACTOR_DUPLICADO: 409,
        SEGUNDO_FACTOR_YA_INSCRITO: 409,
      };
      const estado = estados[e.motivo] ?? 400;
      // Con causa. Un `503` sin más en el camino de acceso no se investiga.
      registrar(estado >= 500 ? 'error' : 'aviso', 'inscripcion de factor rechazada', {
        motivo: e.motivo,
        estadoDelProveedor: e.detalle.estado,
        codigoDelProveedor: e.detalle.codigo,
        estado,
      });
      return NextResponse.json(
        { mensaje: textoDeFalloDeAcceso(e.motivo, e.detalle) },
        { status: estado },
      );
    }
    registrar('error', 'inscripcion de factor: fallo inesperado', {
      clase: e instanceof Error ? e.name : typeof e,
    });
    return NextResponse.json(
      { mensaje: textoDeFalloDeAcceso('SERVICIO_NO_DISPONIBLE') },
      { status: 503 },
    );
  }
};
