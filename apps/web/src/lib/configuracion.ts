import 'server-only';
import { z } from 'zod';

/**
 * Configuración del servidor de la consola, tipada y validada (§2.7.1).
 *
 * **Ninguna de estas variables lleva `NEXT_PUBLIC_`, y eso es la decisión.** El
 * `.env.example` de la ETAPA 02 las declaraba públicas porque se daba por hecho
 * que el navegador hablaría con Supabase y con la API directamente. La ETAPA 09
 * cambia ese supuesto: el navegador **solo** habla con esta aplicación, y esta
 * aplicación —en el servidor— habla con Supabase y con la API. Consecuencias:
 *
 *  - Ni la URL del proyecto Supabase ni la llave publicable llegan al paquete
 *    del navegador. Siguen sin ser secretos, pero tampoco hay motivo para
 *    publicarlas: menos superficie que rotar el día que se rote el proyecto.
 *  - El token de sesión vive en una cookie `httpOnly`, así que ningún script
 *    puede leerlo. Es la diferencia entre un XSS que roba la sesión y uno que
 *    solo puede actuar mientras la pestaña está abierta.
 *
 * `server-only` no es decorativo: si alguien importa este módulo desde un
 * componente de cliente, el build FALLA. Es lo que impide que la llave acabe
 * en el navegador por un `import` mal puesto.
 *
 * ---
 *
 * **POR QUÉ AHORA CON ZOD, Y POR QUÉ SE COMPRUEBA AL ARRANCAR.**
 *
 * Hasta esta versión se comprobaba solo la *presencia* de tres variables, de
 * forma perezosa, en la primera petición que las necesitara. El síntoma de un
 * entorno incompleto no era «la consola no arranca» sino **un 503 en mitad del
 * inicio de sesión**, que es el peor sitio para descubrirlo: parece un fallo
 * del proveedor de identidad y manda a investigar la red.
 *
 * Presencia no es validez. Una `SUPABASE_URL` con una barra de más, con
 * `http://` donde debe ir `https://` o con el identificador de otro proyecto
 * pasaba la comprobación y fallaba en la primera llamada. Aquí se validan la
 * forma y el esquema, como en la API.
 *
 * El esquema es lo único que decide qué es obligatorio: no hay valores por
 * defecto para nada que apunte a un servicio. Un defecto cómodo en una URL es
 * cómo se acaba hablando con el proyecto equivocado.
 */

const noVacio = (nombre: string) => z.string().trim().min(1, `${nombre} es obligatoria`);

const urlAbsoluta = (nombre: string) =>
  noVacio(nombre)
    .url(`${nombre} debe ser una URL absoluta (por ejemplo https://proyecto.supabase.co)`)
    .transform((v) => v.replace(/\/+$/, ''));

/**
 * Las dos leen la URL con `try`, y no es defensa decorativa: Zod ejecuta el
 * refinamiento del objeto **aunque un campo ya haya fallado**, así que aquí
 * puede llegar una cadena que no es una URL. Sin el `try`, un `SUPABASE_URL`
 * sin esquema hacía estallar la validación con un `TypeError` en vez de
 * producir el mensaje que explica el problema — un fallo de arranque
 * ilegible, que es casi lo mismo que ningún fallo. Lo detectó su prueba.
 */
const partesDe = (url: string): URL | null => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

const esLocal = (url: string): boolean => {
  const hostname = partesDe(url)?.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
};

/** Una URL ilegible NO es https, pero tampoco genera un segundo mensaje: el
 *  refinamiento se salta esos casos porque el campo ya los reportó. */
const esHttps = (url: string): boolean => partesDe(url)?.protocol === 'https:';

const base = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  API_URL: urlAbsoluta('API_URL'),
  SUPABASE_URL: urlAbsoluta('SUPABASE_URL'),

  /**
   * La llave **publicable**. Se comprueba que no sea la secreta: `sb_secret_`
   * en esta aplicación sería una llave que omite la RLS en el proceso que
   * atiende al navegador, y ese es el riesgo número uno del proyecto (§2.7.6).
   * Vale más un arranque fallido con el motivo escrito que un despliegue que
   * funciona porque tiene demasiado permiso.
   */
  SUPABASE_PUBLISHABLE_KEY: noVacio('SUPABASE_PUBLISHABLE_KEY').refine(
    (v) => !v.startsWith('sb_secret_') && !v.startsWith('sbp_'),
    'SUPABASE_PUBLISHABLE_KEY parece una llave SECRETA. La consola usa la publicable ' +
      '(sb_publishable_…); la secreta omite la RLS y no puede vivir aquí (§2.7.6)',
  ),

  /**
   * Fuerza el atributo `Secure` de las cookies de sesión. **Solo para servir
   * en local sobre `http`**, donde el navegador rechazaría una cookie `Secure`
   * y no habría sesión — es lo que permite recorrer el camino completo en el
   * navegador contra la consola compilada.
   *
   * El valor por defecto lo decide `NODE_ENV`, y bajarlo en producción solo se
   * admite si la API es de bucle local: si no, esto sería un interruptor para
   * mandar la sesión en claro por la red, y ningún despliegue debe tenerlo a
   * mano.
   */
  COOKIE_SEGURA: z.enum(['true', 'false']).optional(),

  /** Puente de video de la ETAPA 10. Vacío o ausente significa «todavía no». */
  PUENTE_VIDEO_URL: z
    .union([urlAbsoluta('PUENTE_VIDEO_URL'), z.literal('')])
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : v)),
});

/**
 * Las reglas de protocolo se aplican DESPUÉS, porque dependen de `NODE_ENV` y
 * un esquema por campo no lo ve. No son iguales para las tres:
 *
 *  - **Supabase y el puente de video** viven en Internet: `https` siempre. La
 *    excepción es `localhost`, donde corre la pila local de Supabase sobre
 *    `http://127.0.0.1:54321` y no hay red que espiar.
 *  - **La API** admite `http` fuera de producción —así se trabaja en local y
 *    así corren las pruebas—, y lo exige en producción. Un token de sesión
 *    viajando en claro entre la consola y la API es el mismo token.
 */
export const esquemaConfiguracion = base.superRefine((datos, ctx) => {
  for (const nombre of ['SUPABASE_URL', 'PUENTE_VIDEO_URL'] as const) {
    const valor = datos[nombre];
    if (valor === undefined || partesDe(valor) === null) continue;
    if (!esHttps(valor) && !esLocal(valor)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [nombre],
        message: `${nombre} debe usar https (se admite http solo contra localhost)`,
      });
    }
  }
  if (datos.NODE_ENV === 'production' && datos.COOKIE_SEGURA === 'false' && !esLocal(datos.API_URL)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['COOKIE_SEGURA'],
      message:
        'COOKIE_SEGURA=false solo se admite contra una API de bucle local: fuera de ahí manda la ' +
        'sesión sin `Secure` por la red (§2.7.8)',
    });
  }
  if (
    datos.NODE_ENV === 'production' &&
    partesDe(datos.API_URL) !== null &&
    !esHttps(datos.API_URL) &&
    // Bucle local exento: una consola compilada servida en el propio equipo no
    // manda nada por la red. Es lo que permite recorrer el camino completo en
    // el navegador contra la superficie que de verdad se despliega.
    !esLocal(datos.API_URL)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['API_URL'],
      message: 'API_URL debe usar https en producción, salvo en bucle local (§2.7.8)',
    });
  }
});

export class ConfiguracionIncompleta extends Error {
  constructor(readonly problemas: readonly string[]) {
    super(
      `Configuración de la consola inválida; el proceso no arranca (§2.7.1):\n  - ${problemas.join(
        '\n  - ',
      )}\n\nCopia apps/web/.env.example a apps/web/.env.local y complétalo. ` +
        'Jamás con valores en el repositorio.',
    );
    this.name = 'ConfiguracionIncompleta';
  }
}

export interface Configuracion {
  readonly apiUrl: string;
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
  readonly cookieSegura: boolean;
  readonly puenteVideoUrl: string | undefined;
}

/**
 * Los mensajes NO incluyen el valor recibido, solo el nombre de la variable y
 * qué se esperaba. Un fallo de arranque que vuelca el entorno es un fallo de
 * arranque que publica una llave en los registros (§2.7.8).
 */
const leer = (entorno: NodeJS.ProcessEnv): Configuracion => {
  const analisis = esquemaConfiguracion.safeParse(entorno);
  if (!analisis.success) {
    throw new ConfiguracionIncompleta(
      analisis.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`),
    );
  }
  const datos = analisis.data;
  return {
    apiUrl: datos.API_URL,
    supabaseUrl: datos.SUPABASE_URL,
    supabasePublishableKey: datos.SUPABASE_PUBLISHABLE_KEY,
    // En producción la cookie va `Secure` siempre. En desarrollo sobre
    // http://localhost el navegador la rechazaría y no habría sesión.
    cookieSegura: datos.COOKIE_SEGURA === undefined
      ? datos.NODE_ENV === 'production'
      : datos.COOKIE_SEGURA === 'true',
    puenteVideoUrl: datos.PUENTE_VIDEO_URL,
  };
};

let memo: Configuracion | null = null;

/**
 * Se resuelve de forma perezosa y se memoiza. Perezosa porque el `build` de
 * Next importa los módulos sin `.env.local`, y hacerla fallar ahí impediría
 * compilar; memoizada porque se consulta en cada petición.
 *
 * Perezosa **no** significa tardía: `instrumentation.ts` la ejecuta al arrancar
 * el servidor y detiene el proceso con código 78 si algo falta. Cuando llega la
 * primera petición, esto ya se validó.
 */
export const configuracion = (): Configuracion => {
  memo ??= leer(process.env);
  return memo;
};

/** Solo para pruebas: valida un entorno concreto sin tocar el memo. */
export const validarEntorno = (entorno: NodeJS.ProcessEnv): Configuracion => leer(entorno);
