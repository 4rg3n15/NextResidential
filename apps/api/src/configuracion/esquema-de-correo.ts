import { z } from 'zod';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D-147 · EL CORREO SALIENTE DEL RESPALDO DIARIO
 *
 *  · `CORREO_SMTP_HOST` / `CORREO_SMTP_PUERTO` — el servidor SMTP. En el 465
 *    el TLS es implícito; en cualquier otro puerto se EXIGE STARTTLS: si el
 *    servidor no lo ofrece, no se envía. Nunca hay texto plano.
 *  · `CORREO_SMTP_USUARIO` / `CORREO_SMTP_CLAVE` — la cuenta de envío. La
 *    clave es secreto: sólo en el entorno de la API, nunca en el repositorio
 *    ni en los registros.
 *  · `CORREO_REMITENTE` — la dirección que firma el correo.
 *
 * Las cinco van juntas o no va ninguna. Sin ellas la API ARRANCA: el respaldo
 * se guarda en Storage igual, el envío queda «sin configurar» y la comprobación
 * de arranque lo declara SIN CONFIGURAR, como la recuperación de contraseña.
 * Los destinatarios NO se configuran aquí: son los superadministradores
 * activos, con el correo de su cuenta.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const SIN_CONTROL = /^[^\p{Cc}]*$/u;

export const ESQUEMA_DE_CORREO = {
  CORREO_SMTP_HOST: z
    .string()
    .trim()
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i, {
      message: 'CORREO_SMTP_HOST debe ser un nombre de host (sin esquema, puerto ni ruta)',
    })
    .optional(),
  CORREO_SMTP_PUERTO: z.coerce.number().int().min(1).max(65_535).optional(),
  CORREO_SMTP_USUARIO: z
    .string()
    .max(320)
    .regex(SIN_CONTROL, 'CORREO_SMTP_USUARIO contiene caracteres de control')
    .optional(),
  CORREO_SMTP_CLAVE: z
    .string()
    .max(512)
    .regex(SIN_CONTROL, 'CORREO_SMTP_CLAVE contiene caracteres de control: está partida o pegada')
    .optional(),
  CORREO_REMITENTE: z
    .string()
    .trim()
    .email('CORREO_REMITENTE debe ser una dirección de correo')
    .optional(),
};

export interface ConfiguracionDeCorreo {
  readonly host: string;
  readonly puerto: number;
  readonly usuario: string;
  readonly clave: string;
  readonly remitente: string;
}

interface CorreoCrudo {
  readonly CORREO_SMTP_HOST?: string | undefined;
  readonly CORREO_SMTP_PUERTO?: number | undefined;
  readonly CORREO_SMTP_USUARIO?: string | undefined;
  readonly CORREO_SMTP_CLAVE?: string | undefined;
  readonly CORREO_REMITENTE?: string | undefined;
}

const valores = (c: CorreoCrudo) => [
  c.CORREO_SMTP_HOST,
  c.CORREO_SMTP_PUERTO,
  c.CORREO_SMTP_USUARIO,
  c.CORREO_SMTP_CLAVE,
  c.CORREO_REMITENTE,
];

/** Las cinco o ninguna. El mensaje nombra las variables, nunca sus valores. */
export const problemaDeCorreo = (c: CorreoCrudo): string | null => {
  const presentes = valores(c).filter((v) => v !== undefined).length;
  return presentes === 0 || presentes === 5
    ? null
    : 'CORREO_SMTP_HOST, CORREO_SMTP_PUERTO, CORREO_SMTP_USUARIO, CORREO_SMTP_CLAVE y ' +
        'CORREO_REMITENTE van las cinco o ninguna';
};

/** La configuración lista para el adaptador, o `null` si el correo no está configurado. */
export const configuracionDeCorreo = (c: CorreoCrudo): ConfiguracionDeCorreo | null =>
  c.CORREO_SMTP_HOST === undefined ||
  c.CORREO_SMTP_PUERTO === undefined ||
  c.CORREO_SMTP_USUARIO === undefined ||
  c.CORREO_SMTP_CLAVE === undefined ||
  c.CORREO_REMITENTE === undefined
    ? null
    : {
        host: c.CORREO_SMTP_HOST,
        puerto: c.CORREO_SMTP_PUERTO,
        usuario: c.CORREO_SMTP_USUARIO,
        clave: c.CORREO_SMTP_CLAVE,
        remitente: c.CORREO_REMITENTE,
      };
