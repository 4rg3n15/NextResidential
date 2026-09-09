import 'server-only';

/**
 * Configuración del servidor de la consola, tipada y validada al arranque.
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
 */

export class ConfiguracionIncompleta extends Error {
  constructor(faltantes: readonly string[]) {
    super(
      `Faltan variables de entorno: ${faltantes.join(', ')}. ` +
        'Copia apps/web/.env.example a .env.local y complétalo (jamás con valores en el repositorio).',
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

const leer = (entorno: NodeJS.ProcessEnv): Configuracion => {
  const requeridas = ['API_URL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'] as const;
  const faltantes = requeridas.filter((n) => {
    const v = entorno[n];
    return v === undefined || v.trim() === '';
  });
  if (faltantes.length > 0) throw new ConfiguracionIncompleta(faltantes);

  return {
    apiUrl: (entorno.API_URL ?? '').replace(/\/+$/, ''),
    supabaseUrl: (entorno.SUPABASE_URL ?? '').replace(/\/+$/, ''),
    supabasePublishableKey: entorno.SUPABASE_PUBLISHABLE_KEY ?? '',
    // En producción la cookie va `Secure` siempre. En desarrollo sobre
    // http://localhost el navegador la rechazaría y no habría sesión.
    cookieSegura: entorno.NODE_ENV === 'production',
    puenteVideoUrl: entorno.PUENTE_VIDEO_URL,
  };
};

let memo: Configuracion | null = null;

/**
 * Se resuelve de forma perezosa y se memoiza. Perezosa porque el `build` de
 * Next importa los módulos sin `.env.local`, y hacerla fallar ahí impediría
 * compilar; memoizada porque se consulta en cada petición.
 */
export const configuracion = (): Configuracion => {
  memo ??= leer(process.env);
  return memo;
};

/** Solo para pruebas: valida un entorno concreto sin tocar el memo. */
export const validarEntorno = (entorno: NodeJS.ProcessEnv): Configuracion => leer(entorno);
