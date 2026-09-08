import { z } from 'zod';

/**
 * Configuración tipada y validada (§2.7.1).
 *
 * La regla del contrato es explícita: **si falta una variable, la aplicación no
 * arranca**. Por eso la validación ocurre antes de crear el módulo de Nest y no
 * dentro de un proveedor: un fallo tardío deja el proceso escuchando con media
 * configuración, que es peor que no arrancar.
 *
 * Aquí no hay valores por defecto para nada que sea un secreto o un origen
 * permitido. Un defecto cómodo en CORS o en una llave es cómo se cuelan los
 * agujeros a producción.
 */
const noVacio = (nombre: string) => z.string().trim().min(1, `${nombre} es obligatoria`);

export const esquemaConfiguracion = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),

  SUPABASE_URL: noVacio('SUPABASE_URL').url(),
  SUPABASE_PUBLISHABLE_KEY: noVacio('SUPABASE_PUBLISHABLE_KEY'),
  SUPABASE_SECRET_KEY: noVacio('SUPABASE_SECRET_KEY'),
  SUPABASE_JWKS_URL: noVacio('SUPABASE_JWKS_URL').url(),

  JWKS_CACHE_TTL_SEGUNDOS: z.coerce.number().int().min(60).max(3600).default(600),
  JWKS_REFRESCO_MINIMO_SEGUNDOS: z.coerce.number().int().min(10).default(60),

  DATABASE_URL: noVacio('DATABASE_URL'),
  DATABASE_POOLER_URL: noVacio('DATABASE_POOLER_URL'),

  /** Lista blanca explícita (§2.7.2). Nunca `*`, nunca `origin: true`. */
  CORS_ALLOWED_ORIGINS: noVacio('CORS_ALLOWED_ORIGINS'),

  /**
   * RNF-03.11 · Secreto de firma del Alarm Server. La ingesta de eventos de
   * hardware es un endpoint sin sesión de usuario: lo único que acredita al
   * emisor es esta firma, así que sin secreto no hay ingesta. Se exige aquí y
   * no «cuando haga falta» porque §2.7.1 dice que la aplicación no arranca con
   * la configuración incompleta. El valor vive en el entorno, nunca en código.
   */
  INGESTA_FIRMA_SECRETO: noVacio('INGESTA_FIRMA_SECRETO').min(32),
  /** Ventana de frescura de la firma, en segundos: acota la repetición. */
  INGESTA_VENTANA_SEGUNDOS: z.coerce.number().int().min(10).max(900).default(300),

  LIMITE_PAYLOAD: z.string().default('256kb'),
  THROTTLE_TTL_SEGUNDOS: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMITE: z.coerce.number().int().positive().default(120),

  /**
   * D-28 · Límites de la ingesta de hardware.
   *
   * `THROTTLE_DISPOSITIVO_LIMITE` es el tope por EQUIPO y por minuto: holgado
   * para una cámara sana, corto en seco para una con el firmware colgado. Sin
   * él, un equipo desbocado llenaría una tabla que no admite borrado.
   *
   * `THROTTLE_INGESTA_IP_LIMITE` es el tope por IP en las rutas de ingesta, y
   * es alto A PROPÓSITO: todos los equipos de una copropiedad salen por el
   * mismo enrutador, así que el tope global de 120/min los sumaría a todos y
   * dejaría fuera a las cámaras sanas en cuanto el conjunto tuviera tráfico.
   * Sigue existiendo como red contra una inundación, pero la identidad que
   * gobierna aquí es el dispositivo firmante, no la IP compartida.
   */
  THROTTLE_DISPOSITIVO_LIMITE: z.coerce.number().int().positive().default(120),
  THROTTLE_INGESTA_IP_LIMITE: z.coerce.number().int().positive().default(3000),
});

export type ConfiguracionCruda = z.infer<typeof esquemaConfiguracion>;

export interface Configuracion extends Omit<ConfiguracionCruda, 'CORS_ALLOWED_ORIGINS'> {
  readonly origenesPermitidos: readonly string[];
}

export class ErrorDeConfiguracion extends Error {
  constructor(public readonly problemas: readonly string[]) {
    super(
      `Configuración inválida; la aplicación no arranca (§2.7.1):\n  - ${problemas.join('\n  - ')}`,
    );
    this.name = 'ErrorDeConfiguracion';
  }
}

/**
 * Valida el entorno. `SUPABASE_SECRET_KEY` se comprueba pero NUNCA se registra
 * ni se incluye en el mensaje de error: un fallo de arranque no puede volcar
 * una llave a los logs (§2.7.8).
 */
export const cargarConfiguracion = (entorno: NodeJS.ProcessEnv): Configuracion => {
  const analisis = esquemaConfiguracion.safeParse(entorno);
  if (!analisis.success) {
    throw new ErrorDeConfiguracion(
      analisis.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`),
    );
  }
  const { CORS_ALLOWED_ORIGINS, ...resto } = analisis.data;
  const origenesPermitidos = CORS_ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  if (origenesPermitidos.length === 0) {
    throw new ErrorDeConfiguracion(['CORS_ALLOWED_ORIGINS no contiene ningún origen']);
  }
  if (origenesPermitidos.includes('*')) {
    throw new ErrorDeConfiguracion(['CORS_ALLOWED_ORIGINS no admite `*` (§2.7.2)']);
  }
  return { ...resto, origenesPermitidos };
};
