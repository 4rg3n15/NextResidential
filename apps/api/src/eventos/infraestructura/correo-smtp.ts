import { createTransport } from 'nodemailer';
import type { CorreoAEnviar, CorreoSaliente, ResultadoDeCorreo } from '@ncr/domain-core';
import type { ConfiguracionDeCorreo } from '../../configuracion/esquema-de-correo';

/**
 * D-147 · EL CORREO SALIENTE POR SMTP, CON TLS OBLIGATORIO
 *
 * El único adaptador de `CorreoSaliente`. Reglas, y por qué:
 *
 *  · **TLS siempre.** En el 465, TLS implícito (`secure`); en cualquier otro
 *    puerto, `requireTLS`: si el servidor no ofrece STARTTLS, la conexión se
 *    corta ANTES de autenticarse y no sale nada. Nunca credenciales ni un
 *    fichero de eventos en texto plano. TLS 1.2 como mínimo y el certificado
 *    se verifica contra el nombre del host.
 *  · **Nada a los registros.** Sin `logger` ni `debug`: el modo de depuración
 *    de la biblioteca vuelca el diálogo SMTP entero —AUTH incluido— y el
 *    adjunto. El fallo se devuelve como texto corto para la constancia del
 *    envío, que el caso de uso limpia de direcciones antes de guardarlo.
 *  · **Tiempos acotados**, para que un servidor que no responde no deje
 *    colgado el trabajo programado.
 *
 * La dependencia está acotada a una versión exacta con su motivo escrito en
 * `scripts/lib/dependencias-acotadas.mjs`.
 */
const PUERTO_TLS_IMPLICITO = 465;
const ESPERA_MS = 30_000;

export const opcionesDeTransporte = (c: ConfiguracionDeCorreo) => ({
  host: c.host,
  port: c.puerto,
  secure: c.puerto === PUERTO_TLS_IMPLICITO,
  requireTLS: c.puerto !== PUERTO_TLS_IMPLICITO,
  ignoreTLS: false,
  opportunisticTLS: false,
  auth: { user: c.usuario, pass: c.clave },
  tls: { minVersion: 'TLSv1.2' as const, rejectUnauthorized: true, servername: c.host },
  logger: false,
  debug: false,
  connectionTimeout: ESPERA_MS,
  greetingTimeout: ESPERA_MS,
  socketTimeout: ESPERA_MS,
});

/** El fallo, sin la configuración: se quedan el código y el mensaje de la biblioteca. */
const detalleDelFallo = (error: unknown, c: ConfiguracionDeCorreo): string => {
  const codigo =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const mensaje = error instanceof Error ? error.message : 'fallo del servidor de correo';
  const limpio = [c.usuario, c.clave]
    .filter((s) => s.length > 0)
    .reduce((texto, s) => texto.split(s).join('[oculto]'), mensaje);
  return `${codigo === '' ? '' : `${codigo}: `}${limpio}`.slice(0, 300);
};

export class CorreoSmtp implements CorreoSaliente {
  readonly configurado = true;
  private readonly transporte;

  constructor(private readonly config: ConfiguracionDeCorreo) {
    this.transporte = createTransport(opcionesDeTransporte(config));
  }

  async enviar(correo: CorreoAEnviar): Promise<ResultadoDeCorreo> {
    try {
      const info = await this.transporte.sendMail({
        from: this.config.remitente,
        // Cada superadministrador en copia oculta: ninguno ve la dirección de
        // los otros. El `to` es el propio remitente.
        to: this.config.remitente,
        bcc: [...correo.destinatarios],
        subject: correo.asunto,
        text: correo.cuerpo,
        attachments: correo.adjuntos.map((a) => ({
          filename: a.nombre,
          contentType: a.tipoMime,
          content: Buffer.from(a.contenido),
        })),
      });
      // Un envío puede salir para unos y ser rechazado para otros: se devuelven
      // los rechazados para que su intento conste como fallido y se reintente.
      return { estado: 'enviado', rechazados: [...info.rejected] };
    } catch (error) {
      return { estado: 'error', detalle: detalleDelFallo(error, this.config) };
    }
  }

  /** Para la comprobación de arranque: conecta, negocia TLS y se autentica, sin enviar. */
  async comprobar(): Promise<void> {
    await this.transporte.verify();
  }
}
