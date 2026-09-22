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

/**
 * `VAR=` EN UN `.env` SIGNIFICA «NO CONFIGURADA», NO «CADENA VACÍA».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D-91, y lo introduje yo hace una ronda
 *
 * `.optional()` y `.default()` de Zod quieren decir «`undefined` vale». Pero
 * `dotenv` no produce `undefined` para una línea `VAR=`: produce **la cadena
 * vacía**, que sí llega al validador. Resultado: `RECUPERACION_URL_REDIRECCION=`
 * fallaba contra `.url()` y **la aplicación no arrancaba**.
 *
 * Lo grave es cómo apareció: al corregir D-90 declaré esa variable y
 * `EVIDENCIA_BUCKET=` en `.env.example`, así que **copiar el ejemplo al pie de
 * la letra impedía arrancar**, y el único camino que le quedaba a quien
 * desplegara era arrancar, fallar y adivinar. Un ejemplo que no se puede copiar
 * es peor que uno incompleto.
 *
 * Y al escribir la prueba genérica apareció la mitad que yo no veía: **lo mismo
 * le pasaba a todas las variables con valor por omisión**. `PORT=`, `PG_POOL_MAX=`
 * o `THROTTLE_LIMITE=` rompían el arranque, que es justo lo contrario de lo que
 * un valor por omisión promete. Por eso esto se normaliza **una vez, para todo
 * el entorno**, y no campo a campo: campo a campo, la variable número treinta
 * es la que se olvida.
 *
 * Lo que NO cambia: una variable obligatoria vacía sigue impidiendo el
 * arranque. Se vuelve «ausente» en vez de «vacía», y ausente ya era un fallo.
 */
const sinCadenasVacias = (entorno: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
  Object.fromEntries(
    Object.entries(entorno).filter(([, v]) => !(typeof v === 'string' && v.trim() === '')),
  );

/**
 * Un secreto tiene forma, y comprobar solo su LONGITUD deja pasar basura.
 *
 * El caso que motivó esto: un `.env` que no terminaba en salto de línea recibió
 * una variable más al final y el valor quedó como
 * `…secreto-realOTRA_VARIABLE=valor`. Tenía más de 32 caracteres, así que
 * `min(32)` lo aceptó, la API arrancó con un secreto de ingesta corrupto y con
 * la otra variable **desaparecida** —nunca llegó a existir—. Ninguna firma del
 * Alarm Server habría cuadrado jamás, y el diagnóstico habría sido «el hardware
 * firma mal».
 *
 * Un secreto no lleva espacios ni caracteres de control: si los lleva, el valor
 * se partió o se pegó, y en ninguno de los dos casos es el secreto que alguien
 * quiso poner.
 */
const secreto = (nombre: string, minimo: number) =>
  noVacio(nombre)
    .min(minimo, `${nombre} debe tener al menos ${minimo} caracteres`)
    // eslint-disable-next-line no-control-regex
    .refine((v) => !/[\s\u0000-\u001f\u007f]/.test(v), {
      message: `${nombre} contiene espacios o caracteres de control: el valor está partido o pegado a otro`,
    });

export const esquemaConfiguracion = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),

  SUPABASE_URL: noVacio('SUPABASE_URL').url(),
  SUPABASE_PUBLISHABLE_KEY: secreto('SUPABASE_PUBLISHABLE_KEY', 8),
  SUPABASE_SECRET_KEY: secreto('SUPABASE_SECRET_KEY', 8),
  SUPABASE_JWKS_URL: noVacio('SUPABASE_JWKS_URL').url(),

  JWKS_CACHE_TTL_SEGUNDOS: z.coerce.number().int().min(60).max(3600).default(600),
  JWKS_REFRESCO_MINIMO_SEGUNDOS: z.coerce.number().int().min(10).default(60),

  DATABASE_URL: noVacio('DATABASE_URL'),
  DATABASE_POOLER_URL: noVacio('DATABASE_POOLER_URL'),

  /**
   * Tope de conexiones del **único** pool del proceso (D-66). Antes cada
   * módulo abría el suyo y el tope real era la suma —35— que nadie había
   * decidido. Es configurable porque el límite que importa es el del proyecto
   * Supabase, y ese cambia con el plan; el Edge de la ETAPA 12 añadirá tráfico
   * sobre este mismo número.
   */
  PG_POOL_MAX: z.coerce.number().int().min(1).max(100).default(20),

  /** Lista blanca explícita (§2.7.2). Nunca `*`, nunca `origin: true`. */
  CORS_ALLOWED_ORIGINS: noVacio('CORS_ALLOWED_ORIGINS'),

  /**
   * RNF-03.11 · Secreto de firma del Alarm Server. La ingesta de eventos de
   * hardware es un endpoint sin sesión de usuario: lo único que acredita al
   * emisor es esta firma, así que sin secreto no hay ingesta. Se exige aquí y
   * no «cuando haga falta» porque §2.7.1 dice que la aplicación no arranca con
   * la configuración incompleta. El valor vive en el entorno, nunca en código.
   */
  INGESTA_FIRMA_SECRETO: secreto('INGESTA_FIRMA_SECRETO', 32),
  /** Ventana de frescura de la firma, en segundos: acota la repetición. */
  INGESTA_VENTANA_SEGUNDOS: z.coerce.number().int().min(10).max(900).default(300),

  /**
   * ETAPA 08 · Llave de cifrado de las plantillas biométricas (D-10).
   *
   * Se exige al arrancar, como el secreto de la ingesta: una API que levanta
   * sin llave y falla al guardar la primera plantilla habría dejado que alguien
   * capturara el rostro de un visitante para nada. Y no se cifra «cuando haya
   * llave»: el vector se cifra siempre o no se guarda.
   *
   * `BIOMETRIA_LLAVE_REF` es lo ÚNICO que se persiste junto a la plantilla —la
   * migración 0008 lo exige con formato `env:` o `vault:`—. La llave misma no
   * toca la base: si viviera ahí, quien lea la base leería la llave y el
   * cifrado no protegería de la fuga que importa.
   */
  BIOMETRIA_LLAVE: secreto('BIOMETRIA_LLAVE', 32),
  BIOMETRIA_LLAVE_REF: z
    .string()
    .regex(/^(env|vault):[A-Za-z0-9_./-]+$/, 'BIOMETRIA_LLAVE_REF es una referencia, no la llave')
    .default('env:BIOMETRIA_LLAVE'),
  /** P-03 · plazo de respuesta al consentimiento, en horas. Supuesto: 24 h. */
  BIOMETRIA_PLAZO_CONSENTIMIENTO_HORAS: z.coerce.number().int().min(1).max(168).default(24),

  /**
   * Tope del cuerpo de una petición (§2.7.8). Lo consume `express.json({ limit })`,
   * que acepta la forma `256kb`, `1mb` o un número de bytes.
   *
   * La forma se valida aquí y no se daba por buena: era `z.string()` a secas, y
   * lo destapó la prueba genérica de D-91 al exigir que un valor inválido
   * impidiera el arranque. `LIMITE_PAYLOAD=mucho` se aceptaba, llegaba a
   * `express` y el tope quedaba en lo que `express` decidiera — es decir, el
   * límite estaba «configurado» y no lo estaba.
   */
  LIMITE_PAYLOAD: z
    .string()
    .trim()
    .regex(
      /^\d+(b|kb|mb|gb)?$/i,
      'LIMITE_PAYLOAD debe ser como `256kb`, `1mb` o un número de bytes',
    )
    .default('256kb'),

  /**
   * Bucket privado de evidencia (RN-21). Opcional mientras el almacén sea el
   * provisional en memoria; en cuanto se declara, el arranque comprueba que
   * existe, que es privado y que un `GET` sin firmar se rechaza de verdad.
   */
  EVIDENCIA_BUCKET: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,62}$/, 'EVIDENCIA_BUCKET no tiene forma de nombre de bucket')
    .optional(),

  /**
   * A dónde vuelve el enlace del correo de recuperación. Opcional porque el
   * SMTP y la plantilla se configuran en el panel de Supabase y este despliegue
   * puede no tenerlos todavía; si se declara, el arranque exige que su origen
   * esté entre los admitidos por CORS.
   */
  RECUPERACION_URL_REDIRECCION: z
    .string()
    .trim()
    .url('RECUPERACION_URL_REDIRECCION debe ser una URL absoluta')
    .optional(),
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * OBSERVABILIDAD · ETAPA 14. Las dos variables que `.env.example` declaraba
   * desde la ETAPA 02 y que **Zod no validaba y nadie leía**: estaban en el
   * ejemplo, `pnpm entorno:diff` se las exigía al cliente, y no servían para
   * nada. Era deuda registrada con dueño («`SENTRY_DSN` y `LOG_LEVEL` → ETAPA
   * 14») y se salda aquí, dándoles uso, no borrándolas.
   *
   * `SENTRY_DSN` es OPCIONAL a propósito. Sin él el reporte es un objeto nulo
   * y la API arranca igual: desarrollo y CI son despliegues legítimos sin
   * agregador. Lo que no se admite es un DSN presente y mal formado, porque
   * eso sí es un despliegue que cree tener reporte y no lo tiene.
   */
  SENTRY_DSN: z
    .string()
    .trim()
    .url('SENTRY_DSN debe ser el DSN completo que da el panel de Sentry')
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.username !== '' && /\/\d+$/.test(u.pathname);
      } catch {
        return false;
      }
    }, 'SENTRY_DSN no tiene forma de DSN: le falta la clave pública o el identificador de proyecto')
    .optional(),

  /** Umbral mínimo de severidad que se escribe. Por debajo, la línea no sale. */
  LOG_LEVEL: z.enum(['debug', 'info', 'aviso', 'error']).default('info'),

  /**
   * Tamaño de la ventana deslizante de latencias (RNF-11.3). Acota la memoria
   * del proceso: los percentiles necesitan las muestras y guardarlas todas no
   * es una opción en un proceso que corre semanas.
   */
  METRICAS_VENTANA: z.coerce.number().int().min(16).max(65536).default(2048),

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
/**
 * Detecta el `.env` sin salto de línea final.
 *
 * Cuando un fichero no termina en `\n` y se le añade una línea, las dos se
 * funden: `INGESTA_FIRMA_SECRETO=abc` + `EVIDENCIA_BUCKET=x` produce un
 * único par cuyo valor es `abcEVIDENCIA_BUCKET=x`. El resultado es doblemente
 * malo —un valor corrupto y una variable que nunca existió— y lo peor es que
 * no tiene por qué violar ninguna regla de longitud ni de formato.
 *
 * Lo que sí es inconfundible es que el valor de una variable contenga **el
 * nombre de otra variable de este mismo esquema** seguido de `=`. Ningún
 * secreto, ninguna URL y ningún origen legítimo lo hacen. Buscar solo nuestros
 * propios nombres es lo que evita los falsos positivos: un `?sslmode=require`
 * dentro de `DATABASE_URL` no se parece a esto.
 */
const nombresDelEsquema = Object.keys(esquemaConfiguracion.shape);

export const detectarVariablePegada = (entorno: NodeJS.ProcessEnv): readonly string[] =>
  nombresDelEsquema.flatMap((clave) => {
    const valor = entorno[clave];
    if (typeof valor !== 'string' || valor.length === 0) return [];
    const pegada = nombresDelEsquema.find((otra) => otra !== clave && valor.includes(`${otra}=`));
    return pegada === undefined
      ? []
      : [
          `${clave}: su valor contiene «${pegada}=» pegado al final. Es el síntoma de un fichero ` +
            `.env que no termina en salto de línea: ${clave} quedó corrupta y ${pegada} nunca llegó ` +
            'a definirse. Añade el salto de línea y vuelve a arrancar',
        ];
  });

export const cargarConfiguracion = (entorno: NodeJS.ProcessEnv): Configuracion => {
  // Se comprueba ANTES del esquema: el mensaje que explica la causa real vale
  // más que un «no tiene al menos 32 caracteres» sobre un valor que sí los
  // tiene, y que dejaría al lector buscando en el sitio equivocado.
  const pegadas = detectarVariablePegada(entorno);
  if (pegadas.length > 0) throw new ErrorDeConfiguracion(pegadas);

  // D-91 · antes de validar, `VAR=` deja de existir (ver `sinCadenasVacias`).
  const analisis = esquemaConfiguracion.safeParse(sinCadenasVacias(entorno));
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

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * CADA ORIGEN, VALIDADO COMO ORIGEN · H-13-21
   *
   * Hasta la ETAPA 13 las únicas comprobaciones eran «no vacío» y «no es `*`».
   * Medido con NODE_ENV=production:
   *
   *   "http://consola.ejemplo.co"       -> ACEPTADO
   *   "https://consola.ejemplo.co/"     -> ACEPTADO
   *   "ftp://x"                         -> ACEPTADO
   *   "no-es-una-url"                   -> ACEPTADO
   *   "https://consola.ejemplo.co/ruta" -> ACEPTADO
   *
   * Y con el primero, la API emitía `Access-Control-Allow-Credentials: true`
   * hacia un origen en **texto plano**, contra la exigencia de HTTPS de §2.7.8,
   * sin que nada lo advirtiera. El valor de `.env.example` es
   * `http://localhost:3001` —correcto en desarrollo y silenciosamente peligroso
   * si se copia a producción—, que es exactamente cómo llega uno de estos a un
   * despliegue.
   *
   * La barra final y la ruta importan aunque parezcan cosmética: el navegador
   * envía `Origin` SIN barra ni ruta, así que `https://consola.ejemplo.co/`
   * jamás casa y la consola se queda fuera con un fallo sin diagnóstico. Se
   * compara contra `new URL(o).origin`, que es la forma canónica.
   * ═══════════════════════════════════════════════════════════════════════════
   */
  const malFormados: string[] = [];
  for (const origen of origenesPermitidos) {
    let analizado: URL;
    try {
      analizado = new URL(origen);
    } catch {
      malFormados.push(`CORS_ALLOWED_ORIGINS: «${origen}» no es una URL`);
      continue;
    }
    if (analizado.protocol !== 'https:' && analizado.protocol !== 'http:') {
      malFormados.push(`CORS_ALLOWED_ORIGINS: «${origen}» no usa http ni https`);
      continue;
    }
    if (origen !== analizado.origin) {
      malFormados.push(
        `CORS_ALLOWED_ORIGINS: «${origen}» no es un origen canónico ` +
          `(sin barra final, sin ruta, sin credenciales): use «${analizado.origin}»`,
      );
      continue;
    }
    const esLocal = analizado.hostname === 'localhost' || analizado.hostname === '127.0.0.1';
    if (resto.NODE_ENV === 'production' && analizado.protocol === 'http:' && !esLocal) {
      malFormados.push(
        `CORS_ALLOWED_ORIGINS: «${origen}» es texto plano y NODE_ENV=production ` +
          `emite credenciales hacia él (§2.7.8 exige HTTPS)`,
      );
    }
  }
  if (malFormados.length > 0) throw new ErrorDeConfiguracion(malFormados);

  return { ...resto, origenesPermitidos };
};
