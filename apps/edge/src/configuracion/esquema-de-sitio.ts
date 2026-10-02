/**
 * 15-Q · Q5/Q7 · LA CONFIGURACIÓN DEL EDGE EN SITIO
 *
 * Lo que el gateway necesita para hablar con los equipos y para escuchar en la
 * red del conjunto. Se valida al arrancar como el resto (§2.7.1): si falta algo,
 * el gateway NO arranca. Nombres y descripciones en `apps/edge/.env.example`;
 * los VALORES —IPs, usuarios y claves de los equipos— sólo en el `.env` del
 * equipo (RN-21, KPI-11), nunca en el repositorio.
 */
import { isIP } from 'node:net';
import { z } from 'zod';
import { ConfiguracionInvalida, cargarConfiguracion } from './esquema';
import type { ConfiguracionDelEdge } from './esquema';

/** Lo que admite el receptor de una cámara, y cada equipo con su credencial. */
export const esquemaDeEquipo = z
  .object({
    dispositivoId: z.string().uuid('dispositivoId es el UUID del equipo en Next Control'),
    tipo: z.enum(['camara_lpr', 'terminal_facial', 'intercom']),
    host: z.string().min(1).max(253),
    puerto: z.number().int().min(1).max(65_535).default(80),
    protocolo: z.enum(['http', 'https']).default('http'),
    usuario: z.string().min(1).max(64),
    clave: z.string().min(1).max(128),
    canalBarrera: z.number().int().positive().optional(),
    numeroDePuerta: z.number().int().positive().optional(),
    /** Lo que la cámara pone en la URL de su Alarm Server hacia el Edge. */
    secretoAlarmServer: z.string().min(32).max(128).optional(),
  })
  .refine((e) => e.tipo !== 'camara_lpr' || e.secretoAlarmServer !== undefined, {
    message: 'una cámara necesita su secretoAlarmServer (32+ caracteres) para publicar al Edge',
  });

export type EquipoDelEdge = z.infer<typeof esquemaDeEquipo>;

const listaDeEquipos = z.string().transform((texto, ctx): EquipoDelEdge[] => {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'EDGE_EQUIPOS no es JSON' });
    return z.NEVER;
  }
  const r = z.array(esquemaDeEquipo).min(1).max(64).safeParse(crudo);
  if (!r.success) {
    // El detalle nombra el campo, nunca el valor: ahí van claves de equipos.
    for (const i of r.error.issues) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${i.path.join('.')}: ${i.message}` });
    }
    return z.NEVER;
  }
  return r.data;
});

/** Escuchar en TODAS las interfaces no es configurar una: Q5 pide una concreta. */
const TODAS = new Set(['0.0.0.0', '::', '[::]']);

export const esquemaDeSitio = z.object({
  EDGE_EQUIPOS: listaDeEquipos,
  EDGE_ESCUCHA_HOST: z.string().refine((h) => isIP(h) !== 0 && !TODAS.has(h), {
    message: 'EDGE_ESCUCHA_HOST es la IP de UNA interfaz (no 0.0.0.0 ni ::)',
  }),
  EDGE_ESCUCHA_PUERTO: z.coerce.number().int().min(1).max(65_535).default(8080),
  EDGE_LOCAL_SECRETO: z.string().min(32, 'EDGE_LOCAL_SECRETO: mínimo 32 caracteres'),
  EDGE_LIMITE_POR_MINUTO: z.coerce.number().int().min(10).max(10_000).default(300),
  REGLAS_DESCARGA_SEGUNDOS: z.coerce.number().int().min(30).max(86_400).default(300),
  SONDA_POR_EVENTO_MS: z.coerce.number().int().min(200).max(10_000).default(1500),
  ESCUCHAS_REARME_SEGUNDOS: z.coerce.number().int().min(5).max(600).default(30),
});

export type ConfiguracionDeSitio = ConfiguracionDelEdge & z.infer<typeof esquemaDeSitio>;

/** La base (ETAPA 12) y la de sitio (15-Q), las dos validadas o ninguna. */
export const cargarConfiguracionDeSitio = (
  entorno: NodeJS.ProcessEnv = process.env,
): ConfiguracionDeSitio => {
  const base = cargarConfiguracion(entorno);
  const sitio = esquemaDeSitio.safeParse(
    Object.fromEntries(
      Object.entries(entorno).filter(([, v]) => !(typeof v === 'string' && v.trim() === '')),
    ),
  );
  if (sitio.success) return { ...base, ...sitio.data };
  const detalle = sitio.error.issues
    .map((i) => `  · ${i.path.join('.') || '(raíz)'}: ${i.message}`)
    .join('\n');
  throw new ConfiguracionInvalida(
    `El Edge Gateway NO arranca: la configuración de sitio está incompleta.\n${detalle}\n\n` +
      'Sin equipos, sin interfaz o sin secreto local, el gateway no puede actuar en un\n' +
      'corte, y eso se descubre cuando alguien no puede entrar. Vea apps/edge/.env.example.',
  );
};
