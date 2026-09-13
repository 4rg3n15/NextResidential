import 'server-only';
import { cookies, headers } from 'next/headers';
import { configuracion } from '../configuracion';

/**
 * La sesión vive en cookies `httpOnly`, no en `localStorage`.
 *
 * Es la única decisión de esta capa que merece explicación. Guardar el token
 * donde el JavaScript de la página puede leerlo convierte cualquier XSS en un
 * robo de sesión permanente: el atacante se lleva el token y lo usa desde
 * fuera. Con `httpOnly` no puede leerlo, y como la consola nunca envía el token
 * desde el navegador —lo pone el proxy del servidor—, tampoco lo necesita.
 *
 * `SameSite=Lax` y no `Strict`: `Strict` rompería la vuelta desde un enlace
 * externo —un correo de alerta que lleva a un evento— obligando a reautenticar
 * sin motivo. `Lax` no envía la cookie en peticiones de escritura entre sitios,
 * que es lo que importa.
 */

export const COOKIE_ACCESO = 'ncr_acceso';
export const COOKIE_REFRESCO = 'ncr_refresco';
export const COOKIE_EXPIRA = 'ncr_expira';
/** Marca legible por el servidor para saber si hay un segundo factor pendiente. */
export const COOKIE_FACTOR_PENDIENTE = 'ncr_factor';
/**
 * Copropiedad elegida por quien alcanza varias (superadministrador, operador de
 * central). Es una PREFERENCIA, no una credencial: el servidor la contrasta
 * siempre contra el catálogo que devuelve la API, así que una cookie manipulada
 * no amplía el alcance, solo se descarta.
 *
 * `httpOnly` igual que las demás, por la regla de 09-A: nada de la sesión se
 * expone a JavaScript, ni siquiera lo que no es secreto. Dos reglas distintas
 * para dos cookies del mismo flujo acaban en que alguien aplica la floja a la
 * que no tocaba.
 */
export const COOKIE_COPROPIEDAD = 'ncr_copropiedad';

export interface SesionAlmacenada {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Instante de expiración en segundos desde la época, tal como lo da Supabase. */
  readonly expiraEn: number;
}

export const CABECERA_ESQUEMA_SEGURO = 'x-ncr-esquema-seguro';

/**
 * `Secure` SEGÚN LA PETICIÓN, NO SEGÚN CÓMO SE COMPILÓ — D-68.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DEFECTO, REPRODUCIDO
 *
 * El atributo salía de `configuracion().cookieSegura`, que lo decide
 * `NODE_ENV`. Servida la consola compilada por una IP de red, **el navegador
 * descartaba en silencio las tres cookies de sesión** —una cookie `Secure` no
 * se guarda sobre HTTP— y el paso del segundo factor llegaba sin nada que leer.
 * Medido en el recorrido: cero cookies `ncr_*` en el navegador, y un 401 con
 * «La sesión expiró» sobre un código perfectamente válido.
 *
 * Por `localhost` y `127.0.0.1` no ocurría: el navegador los trata como
 * orígenes **potencialmente seguros** y ahí sí acepta cookies `Secure` sobre
 * HTTP. Es la misma exención que escondió D-67 en los estilos, y es la razón de
 * que el recorrido —que sólo visitaba el bucle local— no lo viera nunca.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO NO DEBILITA NADA
 *
 * Por HTTPS la cookie sale `Secure`, exactamente igual que antes. Lo único que
 * cambia es HTTP, donde el atributo **no protegía**: hacía que la cookie no
 * existiera. Una cookie que el navegador tira no es una cookie protegida.
 *
 * `httpOnly` y `SameSite=Lax` no dependen del esquema y **no se tocan**: siguen
 * en las tres cookies, por HTTP y por HTTPS, y el recorrido lo comprueba.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALE EL DATO
 *
 * Del middleware, que sella `x-ncr-esquema-seguro` en la petición con la misma
 * función que decide `upgrade-insecure-requests`. Un manejador de ruta sólo ve
 * cabeceras, y ahí no hay protocolo; la marca la reescribe el middleware en
 * cada petición, así que nadie puede enviarla desde fuera para elegir el
 * atributo `Secure` de su propia cookie.
 *
 * `COOKIE_SEGURA` sigue mandando cuando está declarada: es la salida para un
 * proxy que termina TLS y no reenvía `x-forwarded-proto`. Sin ella —el caso
 * normal— decide la petición.
 */
const esquemaSeguroDeLaPeticion = async (): Promise<boolean> => {
  const declarado = configuracion().cookieSegura;
  if (declarado !== undefined) return declarado;
  try {
    return (await headers()).get(CABECERA_ESQUEMA_SEGURO) === '1';
  } catch {
    // Fuera del ciclo de una petición no hay cabeceras que leer. Se elige lo
    // conservador —`Secure`—: aquí no hay navegador al que dejar fuera.
    return true;
  }
};

const base = async () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: await esquemaSeguroDeLaPeticion(),
  path: '/',
});

/**
 * Días que vive la cookie de refresco cuando el usuario marca «Recordar sesión
 * en este equipo». Sin marcarla, la cookie es **de sesión de navegador**: muere
 * al cerrarlo.
 *
 * Que el interruptor haga algo de verdad importa. El mockup lo dibuja, y un
 * interruptor decorativo es peor que ninguno: promete una decisión sobre la
 * permanencia de la sesión en un equipo compartido —la portería es exactamente
 * eso— y no la cumple.
 */
const DIAS_RECORDADO = 30;

export const guardarSesion = async (sesion: SesionAlmacenada, recordar = false): Promise<void> => {
  const almacen = await cookies();
  // La cookie de acceso caduca CON el token. Una cookie que vive más que su
  // contenido produce el peor de los estados: la consola cree que hay sesión,
  // la API responde 401 en cada llamada y el usuario no entiende nada.
  almacen.set(COOKIE_ACCESO, sesion.accessToken, {
    ...(await base()),
    expires: new Date(sesion.expiraEn * 1000),
  });
  // La de refresco vive más: es la que permite renovar sin volver a pedir
  // contraseña.
  // Sin `maxAge` la cookie es de sesión: el navegador la borra al cerrarse.
  const permanencia = recordar ? { maxAge: 60 * 60 * 24 * DIAS_RECORDADO } : {};
  almacen.set(COOKIE_REFRESCO, sesion.refreshToken, { ...(await base()), ...permanencia });
  almacen.set(COOKIE_EXPIRA, String(sesion.expiraEn), { ...(await base()), ...permanencia });
};

export const leerSesion = async (): Promise<SesionAlmacenada | null> => {
  const almacen = await cookies();
  const accessToken = almacen.get(COOKIE_ACCESO)?.value;
  const refreshToken = almacen.get(COOKIE_REFRESCO)?.value;
  const expira = Number(almacen.get(COOKIE_EXPIRA)?.value ?? '0');
  if (!refreshToken) return null;
  return { accessToken: accessToken ?? '', refreshToken, expiraEn: expira };
};

export const borrarSesion = async (): Promise<void> => {
  const almacen = await cookies();
  for (const nombre of [
    COOKIE_ACCESO,
    COOKIE_REFRESCO,
    COOKIE_EXPIRA,
    COOKIE_FACTOR_PENDIENTE,
    COOKIE_COPROPIEDAD,
  ]) {
    almacen.delete(nombre);
  }
};

export const marcarFactorPendiente = async (factorId: string | null): Promise<void> => {
  const almacen = await cookies();
  if (factorId === null) almacen.delete(COOKIE_FACTOR_PENDIENTE);
  else almacen.set(COOKIE_FACTOR_PENDIENTE, factorId, { ...(await base()), maxAge: 600 });
};

export const factorPendiente = async (): Promise<string | null> => {
  const almacen = await cookies();
  return almacen.get(COOKIE_FACTOR_PENDIENTE)?.value ?? null;
};

/** Preferencia de copropiedad. No concede nada: el servidor la valida. */
export const guardarCopropiedadElegida = async (id: string): Promise<void> => {
  const almacen = await cookies();
  almacen.set(COOKIE_COPROPIEDAD, id, { ...(await base()), maxAge: 60 * 60 * 24 * 30 });
};

export const copropiedadElegida = async (): Promise<string | null> => {
  const almacen = await cookies();
  return almacen.get(COOKIE_COPROPIEDAD)?.value ?? null;
};
