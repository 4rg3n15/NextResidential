import 'server-only';
import { z } from 'zod';
import { ConfiguracionIncompleta } from './configuracion';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · D2/D4 · LA CONSOLA FUERA DE LA RED DE LA API (Netlify, P-20)
 *
 * Variables OPCIONALES. Sin ninguna, la consola se comporta exactamente como en
 * sitio (D3): todo por su proxy y por `servidor.mjs`. Más la de AR-04 (E8).
 *
 *  · `API_ORIGEN_PUBLICO` — el origen de la API al que el NAVEGADOR abre el
 *    flujo en vivo y el audio (con billete). Es la única API que entra en la
 *    CSP (`connect-src`). No es un secreto; `API_URL` sigue siendo la del proxy.
 *  · `CONSOLA_CABECERA_IP_DE_CONFIANZA` — la cabecera que escribe la plataforma
 *    y el navegador NO puede fijar (Netlify: `x-nf-client-connection-ip`). Con
 *    ella, la IP del navegador sale SÓLO de ahí. `X-Forwarded-For` y `Forwarded`
 *    se rechazan: su primer valor lo escribe quien quiera.
 *  · `CONSOLA_IP_FIRMA_SECRETO` — el secreto que comparte con la API
 *    (`API_IP_FIRMA_SECRETO`) para mandarle esa IP firmada. Exige la cabecera
 *    de confianza: firmar una IP que el navegador pudo inventar sería darle a
 *    la mentira la firma de la consola.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const NO_DE_CONFIANZA = new Set(['x-forwarded-for', 'forwarded', 'x-real-ip']);

const origen = z
  .string()
  .trim()
  .url('API_ORIGEN_PUBLICO debe ser una URL absoluta')
  .transform((v) => new URL(v))
  .refine(
    (u) =>
      u.protocol === 'https:' ||
      (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)),
    'API_ORIGEN_PUBLICO debe usar https (http sólo contra localhost)',
  )
  .transform((u) => u.origin);

const esquema = z
  .object({
    API_ORIGEN_PUBLICO: z.union([origen, z.literal('')]).optional(),
    CONSOLA_CABECERA_IP_DE_CONFIANZA: z
      .string()
      .trim()
      .toLowerCase()
      .refine(
        (v) => v === '' || (/^[a-z0-9-]{1,64}$/.test(v) && !NO_DE_CONFIANZA.has(v)),
        'CONSOLA_CABECERA_IP_DE_CONFIANZA debe ser una cabecera que el navegador no pueda ' +
          'fijar (no X-Forwarded-For, Forwarded ni X-Real-IP)',
      )
      .optional(),
    NODE_ENV: z.string().optional(),
    // E8 (15-R) · AR-04 · sin declarar o vacía (`RECUPERACION_POR_CORREO=`, como
    // las tres de Netlify; DT-15S1-02): desactivada en producción, activa fuera.
    RECUPERACION_POR_CORREO: z.enum(['activa', 'desactivada', '']).optional(),
    CONSOLA_IP_FIRMA_SECRETO: z
      .string()
      .refine((v) => v === '' || (v.length >= 32 && !/\s/.test(v)), {
        message: 'CONSOLA_IP_FIRMA_SECRETO: al menos 32 caracteres, sin espacios',
      })
      .optional(),
  })
  .superRefine((d, ctx) => {
    if (
      (d.CONSOLA_IP_FIRMA_SECRETO ?? '') !== '' &&
      (d.CONSOLA_CABECERA_IP_DE_CONFIANZA ?? '') === ''
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CONSOLA_CABECERA_IP_DE_CONFIANZA'],
        message:
          'CONSOLA_IP_FIRMA_SECRETO exige CONSOLA_CABECERA_IP_DE_CONFIANZA: sin ella se ' +
          'firmaría una IP que el navegador pudo escribir',
      });
    }
  });

export interface Despliegue {
  /** Origen (sin ruta) de la API para el navegador; `undefined` = modo sitio. */
  readonly apiOrigenPublico: string | undefined;
  readonly cabeceraIpDeConfianza: string | undefined;
  readonly ipFirmaSecreto: string | undefined;
  /** E8 (15-R) · AR-04 · ¿se ofrece «olvidé mi contraseña» por correo? */
  readonly recuperacionPorCorreo: boolean;
}

const vacioAIndefinido = (v: string | undefined): string | undefined =>
  v === undefined || v === '' ? undefined : v;

/** Valida y devuelve; si algo no cuadra, `ConfiguracionIncompleta` con los nombres (nunca los valores). */
export const despliegue = (
  entorno: Readonly<Record<string, string | undefined>> = process.env,
): Despliegue => {
  const r = esquema.safeParse(entorno);
  if (!r.success) {
    throw new ConfiguracionIncompleta(
      r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`),
    );
  }
  const recuperacion = vacioAIndefinido(r.data.RECUPERACION_POR_CORREO);
  return {
    apiOrigenPublico: vacioAIndefinido(r.data.API_ORIGEN_PUBLICO),
    cabeceraIpDeConfianza: vacioAIndefinido(r.data.CONSOLA_CABECERA_IP_DE_CONFIANZA),
    ipFirmaSecreto: vacioAIndefinido(r.data.CONSOLA_IP_FIRMA_SECRETO),
    recuperacionPorCorreo:
      recuperacion === undefined ? r.data.NODE_ENV !== 'production' : recuperacion === 'activa',
  };
};
