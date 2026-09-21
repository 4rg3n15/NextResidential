/**
 * Configuración del Edge Gateway, tipada y validada al arranque.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * FALLA RUIDOSAMENTE, Y AQUÍ MÁS QUE EN NINGÚN SITIO
 *
 * §2.7.1 exige que la aplicación no arranque si falta una variable. En la API
 * eso significa un despliegue que no sube; en el Edge significa **una puerta
 * que no se abre**, y eso es lo correcto: un gateway que arranca a medias
 * decide con una configuración incompleta durante un corte de WAN y nadie se
 * entera hasta que alguien no puede entrar, o hasta que entra quien no debía.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * D-91 YA ESTÁ APRENDIDO
 *
 * `dotenv` produce la cadena vacía para `VAR=`, no `undefined`, así que una
 * variable declarada y sin valor **anulaba el `.default()`** y tumbaba el
 * arranque de la API con un mensaje que no decía eso. Se corrigió allí en el
 * cargador, una vez y para todas las claves; aquí se hace igual desde el primer
 * commit en vez de repetir el defecto y volver a descubrirlo.
 */
import { z } from 'zod';

/** Qué hacer cuando la regla no está en caché (CU-04, excepción 3a). */
export const CONTINGENCIAS = ['denegar', 'escalar'] as const;
export type Contingencia = (typeof CONTINGENCIAS)[number];

export const esquemaDelEdge = z.object({
  /** Identidad del EQUIPO. Sin ella un evento no se puede atribuir (KPI-05). */
  EDGE_GATEWAY_ID: z.string().uuid('EDGE_GATEWAY_ID debe ser un UUID'),
  EDGE_SERVICE_USER_ID: z.string().uuid('EDGE_SERVICE_USER_ID debe ser un UUID'),

  /** La copropiedad que este equipo atiende. Es su frontera (RN-15). */
  EDGE_COPROPIEDAD_ID: z.string().uuid('EDGE_COPROPIEDAD_ID debe ser un UUID'),

  NEXT_CONTROL_API_URL: z.string().url('NEXT_CONTROL_API_URL debe ser una URL absoluta'),

  /**
   * El secreto HMAC con el que se firma cada envío a `/ingesta`. Es **por
   * equipo**: comprometer un gateway no obliga a rotar los demás.
   */
  EDGE_INGESTA_SECRETO: z.string().min(32, 'EDGE_INGESTA_SECRETO: mínimo 32 caracteres'),

  /**
   * La ruta del fichero. Rechaza caracteres de CONTROL, y eso no es celo: lo
   * encontró la prueba genérica de D-91 al exigir que todo campo opcional
   * rechace un valor inválido. `z.string().min(1)` aceptaba un byte nulo, y una
   * ruta con un `\0` falla al abrir con un error del sistema operativo que no
   * se parece en nada a «la configuración está mal». §2.7.4 lo pide para toda
   * entrada de texto; aquí además es lo que decide dónde vive la bandeja.
   */
  SQLITE_PATH: z
    .string()
    .min(1)
    // eslint-disable-next-line no-control-regex
    .regex(/^[^\u0000-\u001F]+$/, 'SQLITE_PATH no admite caracteres de control')
    .default('/var/lib/next-control/edge.sqlite'),

  /**
   * CU-04 3a · qué se hace si llega un hecho de una copropiedad o un dispositivo
   * que no está en la caché. El valor por omisión es el conservador de §2.1.4.
   */
  CONTINGENCIA_SIN_REGLA: z.enum(CONTINGENCIAS).default('denegar'),

  /**
   * KPI-31 · a partir de cuántos minutos se considera que la caché **puede**
   * estar obsoleta. No impide decidir —eso sería peor— pero marca el evento,
   * y el marcado es lo que permite auditarlo después.
   *
   * 24 h por omisión, alineado con KPI-30: si el equipo aguanta un día sin
   * conexión, un día es también el plazo a partir del cual lo decidido merece
   * una segunda mirada.
   */
  CACHE_OBSOLETA_MINUTOS: z.coerce.number().int().positive().default(1440),

  /** Cada cuánto se comprueba el enlace. */
  SONDA_WAN_SEGUNDOS: z.coerce.number().int().positive().default(15),

  /**
   * Cuántas sondas seguidas hacen falta para cambiar de modo. Con 1, un paquete
   * perdido bastaría para conmutar, y el gateway pasaría el día entrando y
   * saliendo del modo autónomo. Ver `enlace-wan.ts`.
   */
  SONDAS_PARA_CAER: z.coerce.number().int().positive().default(3),
  SONDAS_PARA_VOLVER: z.coerce.number().int().positive().default(2),

  RECONCILIACION_LOTE: z.coerce.number().int().positive().max(500).default(50),
  RECONCILIACION_INTENTOS: z.coerce.number().int().positive().default(8),
  RECONCILIACION_BACKOFF_MS: z.coerce.number().int().positive().default(1000),
});

export type ConfiguracionDelEdge = z.infer<typeof esquemaDelEdge>;

/**
 * Quita las cadenas VACÍAS antes de validar, para que `VAR=` signifique «no
 * configurada» y el `.default()` se aplique. Es la corrección de D-91, hecha
 * una vez en el cargador y no clave por clave: campo a campo se olvida en la
 * siguiente que se añada.
 */
const sinCadenasVacias = (entorno: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  Object.fromEntries(
    Object.entries(entorno).filter(([, v]) => !(typeof v === 'string' && v.trim() === '')),
  );

export class ConfiguracionInvalida extends Error {}

export const cargarConfiguracion = (
  entorno: NodeJS.ProcessEnv = process.env,
): ConfiguracionDelEdge => {
  const analisis = esquemaDelEdge.safeParse(sinCadenasVacias(entorno));
  if (analisis.success) return analisis.data;

  const detalle = analisis.error.issues
    .map((i) => `  · ${i.path.join('.') || '(raíz)'}: ${i.message}`)
    .join('\n');
  throw new ConfiguracionInvalida(
    `El Edge Gateway NO arranca: la configuración está incompleta.\n${detalle}\n\n` +
      'Un gateway a medias decide con reglas incompletas durante un corte, y eso\n' +
      'abre o cierra puertas sin que nadie sepa por qué. Vea apps/edge/.env.example.',
  );
};
