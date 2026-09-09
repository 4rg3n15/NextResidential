import type { MotivoDeFalloDeAcceso } from './supabase-auth';

/**
 * Texto en español de cada fallo de acceso.
 *
 * Se mantiene la asimetría a propósito: **«credenciales inválidas» no dice si
 * falló el correo o la contraseña**, porque distinguirlo permite enumerar
 * cuentas. En cambio, «demasiados intentos» y «servicio no disponible» sí son
 * explícitos: son estados en los que el usuario no puede hacer nada distinto y
 * ocultarlos solo produce reintentos inútiles.
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
  SERVICIO_NO_DISPONIBLE:
    'No se pudo contactar con el servicio de identidad. Inténtalo en unos minutos.',
};

export const textoDeFalloDeAcceso = (motivo: MotivoDeFalloDeAcceso): string => TEXTOS[motivo];
