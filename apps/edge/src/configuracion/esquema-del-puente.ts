/**
 * 15-Q2 · LA CONFIGURACIÓN DEL EDGE COMO PUENTE (ADR-035)
 *
 * Encima de la de la ETAPA 12 y la de sitio (15-Q), y validada igual: si falta
 * algo, el Edge NO arranca. Con `EDGE_TUNEL=activo`:
 *
 *  · `EDGE_EQUIPOS` deja de ser obligatorio: los equipos llegan de la consola
 *    por el túnel y se guardan cifrados (`registro-cifrado.ts`). Si se declara,
 *    es una SEMILLA que se cifra al arrancar —y conviene vaciarla después: en el
 *    `.env` está en claro—.
 *  · `EDGE_EQUIPOS_LLAVE` es obligatoria: 32 bytes en base64, la llave que
 *    cifra esos equipos. No va en SQLite junto al dato.
 */
import { z } from 'zod';
import { ConfiguracionInvalida, cargarConfiguracion } from './esquema';
import { cargarConfiguracionDeSitio, esquemaDeEquipo, esquemaDeSitio } from './esquema-de-sitio';
import type { ConfiguracionDeSitio } from './esquema-de-sitio';

const BASE64_DE_32_BYTES = /^[A-Za-z0-9+/]{43}=$/;

export const esquemaDelPuente = z.object({
  EDGE_TUNEL: z.enum(['activo', 'inactivo']).default('inactivo'),
  /** B2 · cuánto espera el Edge la decisión de la nube antes de decidir con su caché. */
  EDGE_PLAZO_NUBE_MS: z.coerce.number().int().min(200).max(10_000).default(2_500),
  EDGE_EQUIPOS_LLAVE: z
    .string()
    .regex(BASE64_DE_32_BYTES, 'EDGE_EQUIPOS_LLAVE: 32 bytes en base64 (openssl rand -base64 32)')
    .optional(),
  /** D4/E2 · la API de go2rtc que corre junto al Edge (sólo en la máquina local). */
  EDGE_GO2RTC_URL: z.string().url().default('http://127.0.0.1:1984'),
});

export type ConfiguracionDelPuente = ConfiguracionDeSitio & z.infer<typeof esquemaDelPuente>;

/** Con túnel, la semilla de equipos puede ir vacía: la de sitio exige al menos uno. */
const semilla = z
  .string()
  .default('[]')
  .transform((texto, ctx) => {
    const r = z
      .array(esquemaDeEquipo)
      .max(64)
      .safeParse(
        (() => {
          try {
            return JSON.parse(texto) as unknown;
          } catch {
            return null;
          }
        })(),
      );
    if (r.success) return r.data;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'EDGE_EQUIPOS no es una lista válida' });
    return z.NEVER;
  });
const sitioDelPuente = esquemaDeSitio.extend({ EDGE_EQUIPOS: semilla });

const sinVacias = (entorno: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  Object.fromEntries(
    Object.entries(entorno).filter(([, v]) => !(typeof v === 'string' && v.trim() === '')),
  );

export const cargarConfiguracionDelPuente = (
  entorno: NodeJS.ProcessEnv = process.env,
): ConfiguracionDelPuente => {
  // D-91 también aquí: `EDGE_PLAZO_NUBE_MS=` es «sin configurar», y vale su omisión.
  const puente = esquemaDelPuente.safeParse(sinVacias(entorno));
  if (!puente.success) {
    const detalle = puente.error.issues.map((i) => `  · ${i.path.join('.')}: ${i.message}`);
    throw new ConfiguracionInvalida(`El Edge NO arranca como puente:\n${detalle.join('\n')}`);
  }
  if (puente.data.EDGE_TUNEL === 'activo' && puente.data.EDGE_EQUIPOS_LLAVE === undefined) {
    throw new ConfiguracionInvalida(
      'El Edge NO arranca como puente: falta EDGE_EQUIPOS_LLAVE, la llave que cifra los equipos.',
    );
  }
  if (puente.data.EDGE_TUNEL !== 'activo') {
    return { ...cargarConfiguracionDeSitio(entorno), ...puente.data };
  }
  const sitio = sitioDelPuente.safeParse(sinVacias(entorno));
  if (!sitio.success) {
    const detalle = sitio.error.issues.map((i) => `  · ${i.path.join('.')}: ${i.message}`);
    throw new ConfiguracionInvalida(`El Edge NO arranca como puente:\n${detalle.join('\n')}`);
  }
  return { ...cargarConfiguracion(entorno), ...sitio.data, ...puente.data };
};
