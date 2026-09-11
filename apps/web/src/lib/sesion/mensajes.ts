import type { DetalleDeFallo, MotivoDeFalloDeAcceso } from './supabase-auth';

/**
 * Texto en español de cada fallo de acceso.
 *
 * Se mantiene la asimetría a propósito: **«credenciales inválidas» no dice si
 * falló el correo o la contraseña**, porque distinguirlo permite enumerar
 * cuentas. En cambio, «demasiados intentos» y «servicio no disponible» sí son
 * explícitos: son estados en los que el usuario no puede hacer nada distinto y
 * ocultarlos solo produce reintentos inútiles.
 */
/**
 * **La regla, fijada por el cliente el 2026-09-10 tras perder tres rondas.**
 *
 * El cliente no puede inferir la causa: solo sabe qué respondió el servidor.
 * Que el mensaje diga eso, y nada más. Sin filtrar detalles sensibles, pero
 * **sin inventar diagnósticos**.
 *
 * El caso que la motivó: un 401 por firma inválida —la API no tenía ni una
 * clave con la que verificar, porque la URL del JWKS estaba mal— se traducía a
 * «la consola tiene el segundo factor desactivado, pero la API sigue
 * exigiéndolo; pon `MFA_OBLIGATORIO=false` en la API». Ya estaba puesto. El
 * mensaje describía una causa que no existía y mandó a quien lo leyó a
 * perseguirla durante tres rondas de trabajo.
 *
 * Lo que se admite en un texto: lo observado («el servicio respondió 503»), lo
 * que el usuario puede hacer («inténtalo en unos minutos»), y la asimetría
 * deliberada de no distinguir correo de contraseña. Lo que no: afirmar por qué
 * el servidor respondió lo que respondió.
 */
const TEXTOS: Readonly<Record<MotivoDeFalloDeAcceso, string>> = {
  CREDENCIALES_INVALIDAS: 'Correo o contraseña incorrectos.',
  DEMASIADOS_INTENTOS: 'Demasiados intentos. Espera un momento antes de volver a probar.',
  FACTOR_INVALIDO: 'El código no es válido o ya caducó. Genera uno nuevo e inténtalo otra vez.',
  SESION_EXPIRADA: 'La sesión expiró. Vuelve a iniciar sesión.',
  ENLACE_NO_VALIDO:
    'El enlace ya se usó o caducó. Los enlaces de recuperación son de un solo uso: pide uno nuevo.',
  CONTRASENA_DEBIL:
    'La contraseña no cumple la política de seguridad. Usa al menos 12 caracteres, con mayúsculas, minúsculas y dígitos.',
  FACTOR_DUPLICADO:
    'Ya había una inscripción en curso para esta cuenta. Vuelve a intentarlo: se descartará la anterior.',
  SEGUNDO_FACTOR_YA_INSCRITO:
    'Esta cuenta ya tiene un segundo factor configurado. Escribe el código de tu aplicación de autenticación para continuar.',
  SERVICIO_NO_DISPONIBLE:
    'No se pudo contactar con el servicio de identidad. Inténtalo en unos minutos.',
  // Sin el estado no dice nada útil; el estado lo añade la función de abajo.
  SERVICIO_RESPONDIO_ERROR:
    'El servicio de identidad respondió con un error. No es un problema de tus credenciales.',
};

/**
 * El `detalle` solo aporta el **estado HTTP**, que es un enumerado del
 * protocolo y no un dato del titular. No se propaga el cuerpo de la respuesta
 * ni el `error_code` del proveedor: eso va a la bitácora del servidor, no a la
 * pantalla, porque afinaría el sondeo de quien prueba credenciales.
 */
export const textoDeFalloDeAcceso = (
  motivo: MotivoDeFalloDeAcceso,
  detalle?: DetalleDeFallo,
): string => {
  const base = TEXTOS[motivo];
  if (motivo === 'SERVICIO_RESPONDIO_ERROR' && typeof detalle?.estado === 'number') {
    return `${base} (HTTP ${detalle.estado}). Inténtalo en unos minutos.`;
  }
  return base;
};

/**
 * Estado HTTP con el que la consola responde a su propio navegador.
 *
 * Existe porque el código de estado **también miente si se elige mal**: las
 * rutas devolvían `401` para cualquier `FalloDeAcceso` que no fuese un 429, así
 * que un servicio de identidad caído llegaba al navegador como «no autorizado»
 * —es decir, como si la contraseña estuviera mal—. El usuario reintentaba sus
 * credenciales correctas una y otra vez.
 *
 * `estadoSiEsCulpaDelCliente` es el estado que corresponde cuando el fallo sí
 * es del cliente, y cambia según la ruta: 401 al iniciar sesión, 400 al fijar
 * una contraseña nueva.
 */
export const estadoDeFalloDeAcceso = (
  motivo: MotivoDeFalloDeAcceso,
  estadoSiEsCulpaDelCliente: 400 | 401,
): number => {
  if (motivo === 'DEMASIADOS_INTENTOS') return 429;
  if (motivo === 'SERVICIO_NO_DISPONIBLE' || motivo === 'SERVICIO_RESPONDIO_ERROR') return 503;
  return estadoSiEsCulpaDelCliente;
};
