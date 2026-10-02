import { isIP } from 'node:net';
import { z } from 'zod';
import { leerEquiposDeclarados } from '../comun/equipos-de-alarm-server';
import { problemaDelPresupuesto } from './presupuesto-de-conexiones';
import { ESQUEMA_DE_ICE, problemaDeIce } from './esquema-de-ice';

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
  ...ESQUEMA_DE_ICE,
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
   *
   * 15-O · por omisión 10, no 20: con pg-boss cabe en los quince clientes del
   * pooler en modo sesión del plan gratuito (`presupuesto-de-conexiones.ts`).
   */
  PG_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  /**
   * 15-O · cuántos clientes admite el pooler de Supabase («Pool Size» del
   * panel). 15 es el del plan gratuito [SUPUESTO S-170]. La API NO arranca si
   * `PG_POOL_MAX` + `PGBOSS_POOL_MAX` lo exceden.
   */
  SUPABASE_POOLER_MAX_CLIENTES: z.coerce.number().int().min(2).max(10_000).default(15),

  /** Lista blanca explícita (§2.7.2). Nunca `*`, nunca `origin: true`. */
  CORS_ALLOWED_ORIGINS: noVacio('CORS_ALLOWED_ORIGINS'),

  /**
   * H6 (15-L) · de quién se cree la `X-Forwarded-For`. `loopback` por omisión:
   * la consola corre en la misma máquina y su proxy `/api/ncr` llega por el
   * bucle local con la IP del navegador. Un balanceador delante de la API se
   * añade aquí (coma; IP o CIDR). Nunca «todos»: creer a cualquiera deja que
   * el cliente escriba su propia IP y se salte la lista blanca de porteros.
   */
  /**
   * H5 (15-L) · cuánto SUBEN los límites de peticiones con el modo pruebas
   * activo. Nunca se apagan (§2.7.5): el superadministrador, el portero y la
   * consola comparten la IP del Mac en la entrega.
   */
  MODO_PRUEBAS_FACTOR_DE_LIMITE: z.coerce.number().int().min(2).max(100).default(10),

  API_PROXIES_DE_CONFIANZA: z
    .string()
    .trim()
    .default('loopback')
    .refine(
      (v) =>
        v
          .split(',')
          .map((x) => x.trim())
          .every((x) => {
            if (x === 'loopback' || x === 'linklocal' || x === 'uniquelocal') return true;
            const [ip, prefijo] = x.split('/');
            if (isIP(ip ?? '') === 0) return false;
            return prefijo === undefined || /^\d{1,3}$/.test(prefijo);
          }),
      'API_PROXIES_DE_CONFIANZA: «loopback» o direcciones/CIDR separados por coma',
    ),

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
   * ETAPA 15 · equipos que pueden publicar en el «servidor de alarma».
   *
   * `copropiedad|dispositivo|secreto|ip[,ip]`, y `;` entre equipos. Vacía por
   * omisión, y entonces ese extremo **no acredita a nadie**: un despliegue sin
   * cámaras declaradas rechaza todo en vez de aceptar todo.
   *
   * La forma la valida `leerEquiposDeclarados`, y se invoca **aquí**: el
   * control D-91 exige que tolerar la variable vacía no se convierta en
   * tolerar cualquier cosa, y una declaración mal formada tiene que impedir el
   * arranque, no descubrirse en la primera publicación de una cámara. El
   * mensaje que sale es el del propio lector, que nombra la entrada y el campo
   * —«entrada 2: el secreto tiene 12 caracteres»—, cosa que un `regex` de Zod
   * no haría.
   */
  /**
   * C2 (corrección de la 15-L) · la IP con la que ESTA API se anuncia a las
   * cámaras en «Enviar eventos a este Mac». Vacía = la del Mac en la red de
   * cada cámara (la interfaz cuya subred la contiene). Se define sólo si hay
   * algo que las interfaces no dicen: un NAT, un puente, una VLAN enrutada.
   */
  ALARM_SERVER_IP_ANUNCIADA: z
    .string()
    .optional()
    .refine(
      (v) => v === undefined || v.trim() === '' || isIP(v.trim()) === 4,
      'ALARM_SERVER_IP_ANUNCIADA debe ser una IPv4 (o quedar vacía)',
    ),
  ALARM_SERVER_EQUIPOS: z
    .string()
    .optional()
    .superRefine((valor, contexto) => {
      if (valor === undefined || valor.trim() === '') return;
      try {
        leerEquiposDeclarados(valor);
      } catch (error) {
        contexto.addIssue({
          code: z.ZodIssueCode.custom,
          message: error instanceof Error ? error.message : 'declaración de equipos inválida',
        });
      }
    }),

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
  /**
   * ETAPA 15-B · Llave de cifrado del SECRETO DE LOS EQUIPOS (A.1).
   *
   * Es una llave distinta de la biométrica a propósito, aunque el sobre sea el
   * mismo: comprometer la que cifra las plantillas no debe entregar además las
   * credenciales de las cámaras. Lo que se comparte es el código —un solo
   * cifrado en todo el proyecto— y no el material de clave.
   *
   * Se exige al arrancar, por el mismo motivo que la biométrica: una API que
   * levanta sin llave y falla al guardar el primer equipo habría dejado a
   * alguien teclear una credencial de cámara para nada. `EQUIPOS_LLAVE_REF` es
   * lo único que se persiste junto al sobre (migración 0032).
   */
  EQUIPOS_LLAVE: secreto('EQUIPOS_LLAVE', 32),
  EQUIPOS_LLAVE_REF: z
    .string()
    .regex(/^(env|vault):[A-Za-z0-9_./-]+$/, 'EQUIPOS_LLAVE_REF es una referencia, no la llave')
    .default('env:EQUIPOS_LLAVE'),

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * ETAPA 15-C · QUÉ PROVEEDOR DE HARDWARE SE INYECTA
   *
   * Es **la única decisión** que separa correr contra el simulado de correr
   * contra los equipos, y vive aquí —validada al arranque— y no dentro de un
   * módulo. Hasta la 15-C no existía: el módulo de biometría hacía
   * `new MockProvider` en su fábrica, de modo que cambiar de adaptador exigía
   * editar código de la API. ADR-03 promete lo contrario, y no había dónde
   * comprobarlo.
   *
   * `simulado` es el valor por omisión y lo seguirá siendo. ADR-03 dice que
   * todo el sistema debe funcionar completo contra él, y un despliegue que se
   * pusiera en modo hardware por descuido informaría de aperturas que nunca
   * ocurrieron. Un valor desconocido **impide el arranque**: entre «no es
   * ninguno de los dos» y «me quedo con el que había», la segunda opción es
   * cómo un despliegue acaba en un modo que nadie eligió.
   */
  /**
   * LA ÚNICA LÍNEA DEL PROYECTO QUE NOMBRA AL FABRICANTE FUERA DEL PAQUETE DE
   * PROVEEDORES, eximida de KPI-11 **en la línea y con motivo escrito**.
   *
   * KPI-11 persigue que el **protocolo** no salga del paquete: rutas, nombres
   * de elemento, direcciones de equipo. Esto no es protocolo: es el nombre del
   * adaptador que hay que componer, y el punto de composición es el único sitio
   * del sistema que por definición tiene que poder nombrar a los dos.
   *
   * Se exime esta línea y **sólo ésta**. Nada del resto de la aplicación sabe
   * qué ruta abre una barrera ni en qué dirección vive una cámara, y el control
   * lo sigue comprobando en cada construcción.
   */
  PROVEEDOR_DE_EQUIPOS: z.enum(['simulado', 'hikvision']).default('simulado'), // kpi-11-exento
  /**
   * Semilla del simulado. La adversidad que genera —latencia, fallos,
   * duplicados— tiene que ser **reproducible**: una prueba que falla con una
   * semilla y pasa con otra no es una prueba.
   */
  PROVEEDOR_SEMILLA: z.coerce.number().int().default(20260908),

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * LA TERMINAL CUANDO LA PLATAFORMA NO CONTESTA · ETAPA 15-L, decisión del cliente
   *
   * La corrección «verificación remota» de la consola escribe en la terminal
   * `offlineDevCheckOpenDoorEnabled` con este valor. `false` (por omisión, y
   * también lo que trae el equipo): sin la API, la terminal NO abre por su
   * cuenta; el plan B es abrir desde la consola o con la llave
   * (`docs/guias/ENTREGA_EN_SITIO.md`). `true` la deja abrir con su propio
   * reconocimiento cuando la plataforma no está: nadie queda fuera, y el motor
   * de reglas deja de decidir mientras tanto.
   */
  TERMINAL_ABRE_SIN_PLATAFORMA: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /**
   * 15-L · `remoteCheckTimeout` que la misma corrección escribe, en segundos.
   * F2 (corrección de la 15-L) · por omisión 8, no el 5 de fábrica: en la red
   * de sitio el camino completo —el hecho llega, el motor decide, el veredicto
   * vuelve— necesita holgura, y el ensayo mide p50/p95 contra este valor.
   */
  TERMINAL_PLAZO_DE_VERIFICACION_S: z.coerce.number().int().min(1).max(60).default(8),
  /**
   * A5 (15-L) · plazo de cada petición a un equipo, en ms. Por omisión 5000:
   * holgado para cargar una plantilla, corto para no dejar a un portero
   * esperando. En una red de sitio lenta se sube aquí, sin tocar código.
   */
  EQUIPOS_TIEMPO_LIMITE_MS: z.coerce.number().int().min(500).max(30_000).default(5000),
  /**
   * A2 (15-L) · zona en la que la terminal lleva su reloj: la vigencia del
   * visitante se le escribe en hora local sin desfase. Una zona mal escrita
   * IMPIDE EL ARRANQUE: si no, la credencial caducaría a la hora equivocada.
   */
  EQUIPOS_ZONA_HORARIA: z
    .string()
    .default('America/Bogota')
    .refine((zona) => {
      try {
        new Intl.DateTimeFormat('en-CA', { timeZone: zona });
        return true;
      } catch {
        return false;
      }
    }, 'zona horaria IANA desconocida (p. ej. America/Bogota)'),
  /** A2 (15-L) · `planTemplateNo` de la puerta en el alta de persona. «1» por omisión. */
  TERMINAL_PLAN_DE_HORARIO: z
    .string()
    .regex(/^\d{1,5}$/, 'número de plantilla horaria del equipo')
    .default('1'),
  /**
   * A2 (15-L) · peso y lado mayor máximos de la foto que se sube a una
   * terminal. No son del fabricante —la guía no los fija—: son el valor
   * prudente de la práctica, y se cambian aquí si el equipo declara otros.
   */
  EQUIPOS_FOTO_KB_MAXIMOS: z.coerce.number().int().min(16).max(2048).default(200),
  /**
   * D2 (15-L) · puerto RTSP de los equipos. 554 es el de fábrica; si en sitio
   * lo cambiaron, se dice aquí y no en el código.
   */
  VIDEO_PUERTO_RTSP: z.coerce.number().int().min(1).max(65535).default(554),
  /**
   * C4 (15-L) · cada cuántos segundos se toma el latido de los equipos
   * (señal de su escucha o una lectura real de su identidad). 0 lo apaga.
   */
  EQUIPOS_LATIDO_S: z.coerce.number().int().min(0).max(3600).default(60),
  /**
   * E5 (15-M) · ventana, en segundos, dentro de la cual una alerta del mismo
   * (equipo, tipo) NO se repite. Las persistentes (la cámara decide sola, el
   * reloj desviado) además no se repiten mientras haya una abierta.
   */
  ALERTAS_VENTANA_DEDUP_S: z.coerce.number().int().min(0).max(86_400).default(600),
  /**
   * G1 (15-N) · cuánto sigue en la cola de atención algo que nadie atendió.
   * Después sale de la cola y queda en Eventos. 5 minutos por omisión (P-22).
   */
  GUARDIA_VIGENCIA_EN_COLA_S: z.coerce.number().int().min(30).max(3600).default(300),
  /**
   * 15-P · por dónde viaja el audio de la guardia (ADR-01, enmienda 15-P).
   *  · `websocket` (por omisión desde la medida de la 15-P): un canal ordenado
   *    consola ↔ API con billete de un solo uso, y con el equipo `audioData`
   *    persistente en bytes crudos, como pide el manual de la familia.
   *  · `http`: el de antes —un GET de bajada y un POST por trozo; con el
   *    equipo, `fetch` en flujo—. Volver atrás es cambiar esta variable.
   */
  GUARDIA_AUDIO_TRANSPORTE: z.enum(['websocket', 'http']).default('websocket'),
  /** E5 (15-M) · desvío del reloj del equipo, en segundos, a partir del cual se avisa. */
  EQUIPOS_DESVIO_DE_RELOJ_S: z.coerce.number().int().min(1).max(3600).default(30),
  EQUIPOS_FOTO_LADO_MAXIMO: z.coerce.number().int().min(160).max(4096).default(1024),

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * QUIÉN CARGA EL CONTEXTO DEL MOTOR · D-25, ETAPA 15-D
   *
   *   postgres     (por omisión) — lee autorizaciones, padrón y lista negra
   *                 de la base. Es el único con el que una placa autorizada
   *                 desde la consola se PERMITE.
   *   conservador  — no lee nada y el motor deniega todo por FALLO_TECNICO.
   *                 Es el comportamiento correcto sin origen de datos y el
   *                 que usa la suite de la API, que no tiene base.
   *
   * Que hoy nadie supiera cuál estaba puesto era la mitad del defecto: el
   * arranque REGISTRA cuál quedó activo, con su nombre.
   */
  CARGADOR_DE_CONTEXTO: z.enum(['postgres', 'conservador']).default('postgres'),

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * DÓNDE VIVE EL HISTÓRICO DE EVENTOS · ETAPA 15-E
   *
   *   postgres  (por omisión) — `eventos` y `recepciones_evento` de la base,
   *              con los claims de servicio de cada copropiedad por llamada.
   *              Es el único con el que un acceso sobrevive a un reinicio y
   *              con el que la hoja de resultados en sitio se puede cotejar.
   *   memoria   — el doble de la ETAPA 06. Es el de la suite, que no tiene
   *              base, y sirve para ensayar sin ella. Un despliegue en
   *              `memoria` NO tiene trazabilidad: el arranque lo avisa.
   */
  PERSISTENCIA_DE_EVENTOS: z.enum(['postgres', 'memoria']).default('postgres'),

  /**
   * A3 (15-E) · dónde viven consentimientos, plantillas y sincronizaciones.
   * Mismo criterio que el histórico: `postgres` es el único con el que los
   * cerrojos de RN-09 y RN-11 —disparadores y CHECK de la base— actúan de
   * verdad; `memoria` es el doble de la suite y avisa al arrancar.
   */
  PERSISTENCIA_DE_BIOMETRIA: z.enum(['postgres', 'memoria']).default('postgres'),

  /**
   * A5 (15-E) · el go2rtc de la API (opcional: sin él, 503 con motivo). Dirección INTERNA que
   * nunca llega al navegador: éste negocia contra la API, que valida sesión, rol y copropiedad,
   * y la URL RTSP con credencial sólo viaja de la API a go2rtc (RN-12, RN-21). 15-Q2 · con Edge
   * puente, el video lo negocia el go2rtc del Edge y esta variable no le hace falta.
   */
  GO2RTC_URL: z
    .string()
    .trim()
    .url('GO2RTC_URL debe ser una URL absoluta (http://127.0.0.1:1984)')
    .optional(),

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

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * PLANIFICADOR (ETAPA 14) · pg-boss sobre el mismo PostgreSQL (§2.6)
   *
   * `PGBOSS_SCHEMA` estaba en `.env.example` desde la ETAPA 02 con la nota «la
   * lee la configuración de pg-boss, fuera del esquema de la API». No había
   * tal configuración: no se leía en ningún sitio. Ahora sí.
   *
   * `PLANIFICADOR_HABILITADO` existe porque **no todo proceso debe planificar**.
   * Con varias instancias de API, pg-boss ya garantiza que solo una ejecuta
   * cada disparo —toma el cerrojo en PostgreSQL—, así que dejarlo encendido en
   * todas es correcto; apagarlo permite dedicar un proceso a servir HTTP y otro
   * a los barridos, que es lo que se quiere cuando el barrido de plantillas
   * habla con terminales lentas. Apagado, el planificador ESCRIBE qué no va a
   * ejecutar: el silencio dejaría creer que RN-11 se está cumpliendo.
   */
  /**
   * H-SITIO-07 · la conexión de pg-boss, si no es `DATABASE_URL`. Opcional.
   * Existe porque la conexión directa de Supabase sólo resuelve por IPv6 y en
   * sitio la red era sólo IPv4: el planificador murió con `ENOTFOUND`. pg-boss
   * necesita una conexión de SESIÓN, así que aquí va el pooler en modo sesión
   * (puerto 5432), no el de transacción (6543) de `DATABASE_POOLER_URL`.
   */
  PGBOSS_DATABASE_URL: z
    .string()
    .trim()
    .url('PGBOSS_DATABASE_URL debe ser una cadena postgresql://… (pooler en modo sesión, :5432)')
    .optional(),
  PGBOSS_SCHEMA: z
    .string()
    .trim()
    .regex(/^[a-z_][a-z0-9_]{0,62}$/, 'PGBOSS_SCHEMA es un nombre de esquema de PostgreSQL')
    .default('pgboss'),
  PLANIFICADOR_HABILITADO: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /**
   * 15-O · el pool PROPIO de pg-boss. Suma en el presupuesto del pooler con
   * `PG_POOL_MAX`: son tres barridos por hora y una cola a pedido, dos bastan.
   */
  PGBOSS_POOL_MAX: z.coerce.number().int().min(1).max(20).default(2),

  /**
   * 15-O · el volcado histórico que un equipo envía al suscribirse: lotes de
   * este tamaño (un `INSERT` por lote; 14 parámetros por fila, así que 1 000
   * como mucho) y como mucho estos eventos por segundo. Lo VIVO no pasa por
   * aquí y no espera.
   */
  EVENTOS_HISTORICOS_LOTE: z.coerce.number().int().min(1).max(1000).default(500),
  EVENTOS_HISTORICOS_POR_SEGUNDO: z.coerce.number().int().min(10).max(10_000).default(500),

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

  // 15-O · los pools caben en el pooler de Supabase. 15-Q2 · un TURN no va sin su secreto.
  const presupuesto = problemaDelPresupuesto(resto) ?? problemaDeIce(resto);
  if (presupuesto !== null) throw new ErrorDeConfiguracion([presupuesto]);

  return { ...resto, origenesPermitidos };
};
