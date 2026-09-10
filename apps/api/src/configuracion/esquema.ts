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
 * Un secreto tiene forma, y comprobar solo su LONGITUD deja pasar basura.
 *
 * El caso que motivó esto: un `.env` que no terminaba en salto de línea recibió
 * una variable más al final y el valor quedó como
 * `…secreto-realMFA_OBLIGATORIO=false`. Tenía más de 32 caracteres, así que
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

  /**
   * **INTERRUPTOR TEMPORAL DEL SEGUNDO FACTOR — desviación declarada de §2.7.8
   * y de RN-20 / CA-25.**
   *
   * Por defecto `true`: el comportamiento del contrato no cambia salvo que
   * alguien escriba la variable con todas sus letras. Puesto a `false`, el
   * guard acepta un token `aal1` de un rol administrativo, y **eso es todo lo
   * que hace**: no desactiva la autenticación, ni la verificación asimétrica
   * del JWT, ni el RBAC, ni el aislamiento por copropiedad. Sigue haciendo
   * falta usuario y contraseña válidos, y el token sigue verificándose contra
   * el JWKS del proyecto.
   *
   * Existe porque el cliente lo pidió para poder ensayar la consola mientras se
   * termina de cerrar el camino del segundo factor contra su proyecto real. No
   * es una opción de despliegue: la API lo grita al arrancar y lo deja escrito
   * en la bitácora la primera vez que deja pasar un `aal1`, para que nadie se
   * lo encuentre puesto sin saberlo.
   *
   * Se lee como cadena y se transforma a booleano a propósito: `Boolean('false')`
   * es `true`, y ese es el clásico interruptor de seguridad que queda encendido
   * creyendo que está apagado.
   */
  MFA_OBLIGATORIO: z
    .enum(['true', 'false'], {
      errorMap: () => ({ message: "MFA_OBLIGATORIO admite solo 'true' o 'false'" }),
    })
    .default('true')
    .transform((v) => v === 'true'),

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

  LIMITE_PAYLOAD: z.string().default('256kb'),

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
 * funden: `INGESTA_FIRMA_SECRETO=abc` + `MFA_OBLIGATORIO=false` produce un
 * único par cuyo valor es `abcMFA_OBLIGATORIO=false`. El resultado es doblemente
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
