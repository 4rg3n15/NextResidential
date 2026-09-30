import type { Pool, PoolClient } from 'pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-O · UN CLIENTE PRESTADO QUE NO TUMBA EL PROCESO
 *
 * En sitio (30/09/2026) el pooler de sesión de Supabase cortó conexiones y la
 * API murió entera: «Unhandled 'error' event · Connection terminated
 * unexpectedly» (`pg/lib/client.js`). `pg` emite `'error'` en el cliente cuando
 * la conexión se corta —también con una consulta en curso—, y un `'error'` sin
 * oyente termina el proceso de Node. Ni el `Pool` ni los 36 `pool.connect()`
 * de la API escuchaban.
 *
 * Este es el ÚNICO sitio de la API que presta un cliente del pool (los guiones
 * del operador tienen su gemelo, `scripts/lib/con-cliente.mjs`):
 *  · mientras está prestado, un oyente de `'error'` anota el corte en vez de
 *    dejar que Node lo convierta en una caída;
 *  · al devolverlo, `release(error)` si la conexión se rompió: el pool la
 *    DESCARTA en vez de prestarla rota a la siguiente petición;
 *  · un error de conexión sale como `BaseDeDatosNoDisponible`, que el filtro
 *    global responde con 503 «base de datos no disponible» y `Retry-After`,
 *    no con un 500 que parezca un fallo del programa.
 *
 * El control `scripts/lib/frontera-conexiones.mjs` falla si vuelve a
 * aparecer un `pool.connect()` fuera de este fichero.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** Lo que dice `pg`, o el pooler, cuando la conexión se perdió o no se pudo abrir. */
const CODIGOS_DE_CONEXION = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  // SQLSTATE: la administración cerró la sesión, el servidor se apaga o
  // arranca, excepción de conexión, demasiadas conexiones.
  '57P01',
  '57P02',
  '57P03',
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '53300',
]);

const MENSAJES_DE_CONEXION =
  /Connection terminated|not queryable|Connection ended|timeout exceeded when trying to connect|terminating connection|server closed the connection|EMAXCONN|max clients reached|too many (clients|connections)|remaining connection slots/i;

export const esErrorDeConexion = (error: unknown): boolean => {
  if (error instanceof BaseDeDatosNoDisponible) return true;
  if (error === null || typeof error !== 'object') return false;
  const codigo = (error as { code?: unknown }).code;
  if (typeof codigo === 'string' && CODIGOS_DE_CONEXION.has(codigo)) return true;
  const mensaje = error instanceof Error ? error.message : '';
  return MENSAJES_DE_CONEXION.test(mensaje);
};

/**
 * La base no está disponible AHORA. No es un fallo del programa: el filtro
 * global la responde con 503 y `Retry-After`, y el pool ya descartó la
 * conexión rota.
 */
export class BaseDeDatosNoDisponible extends Error {
  constructor(readonly causa: unknown) {
    super(`base de datos no disponible: ${causa instanceof Error ? causa.message : String(causa)}`);
    this.name = 'BaseDeDatosNoDisponible';
  }
}

/** Lo último que se supo de las conexiones de un pool, para `/ready`. */
export interface SaludDeConexiones {
  readonly ultimoCorte: {
    readonly momento: Date;
    /** El texto de `pg`, sin cadenas de conexión: para la bitácora. */
    readonly motivo: string;
    /** La clase de fallo, apta para `/ready` (pública). */
    readonly categoria: string;
  } | null;
  readonly ultimaConexionSana: Date | null;
}

const salud = new WeakMap<Pool, { corte: SaludDeConexiones['ultimoCorte']; sana: Date | null }>();

const anotar = (pool: Pool, cambio: { corte?: Error; sana?: true }): void => {
  const actual = salud.get(pool) ?? { corte: null, sana: null };
  if (cambio.corte !== undefined) {
    actual.corte = {
      momento: new Date(),
      motivo: motivoSinSecretos(cambio.corte),
      categoria: categoriaDeFallo(cambio.corte),
    };
  }
  if (cambio.sana === true) actual.sana = new Date();
  salud.set(pool, actual);
};

export const saludDe = (pool: Pool): SaludDeConexiones => {
  const s = salud.get(pool);
  return { ultimoCorte: s?.corte ?? null, ultimaConexionSana: s?.sana ?? null };
};

/**
 * El texto de un error de `pg` no lleva la contraseña —va en la cadena de
 * conexión, no en el error—, pero se recorta igual por si una cadena mal
 * formada acaba en él: nada con `://` sale de aquí.
 */
export const motivoSinSecretos = (error: unknown): string => {
  const crudo = error instanceof Error ? error.message : String(error);
  return crudo.replace(/\S+:\/\/\S+/g, '<cadena de conexión>').slice(0, 200);
};

/**
 * Qué clase de fallo fue, en palabras y SIN el texto de `pg`: es lo que puede
 * salir por `/ready`, que es pública, y el texto original puede llevar el host
 * («getaddrinfo ENOTFOUND db.<ref>.supabase.co»).
 */
export const categoriaDeFallo = (error: unknown): string => {
  const causa = error instanceof BaseDeDatosNoDisponible ? error.causa : error;
  const codigo =
    causa !== null && typeof causa === 'object' ? (causa as { code?: unknown }).code : undefined;
  const mensaje = causa instanceof Error ? causa.message : '';
  if (codigo === '53300' || /EMAXCONN|max clients|too many|remaining connection/i.test(mensaje)) {
    return 'el pooler no admite más clientes (límite de conexiones alcanzado)';
  }
  if (codigo === 'ETIMEDOUT' || /timeout|tiempo/i.test(mensaje)) {
    return 'la base no respondió a tiempo';
  }
  if (
    ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH'].includes(
      String(codigo),
    )
  ) {
    return 'no se pudo abrir una conexión con la base';
  }
  return esErrorDeConexion(causa) ? 'la base cortó la conexión' : 'la base respondió con un error';
};

/**
 * `pool.on('error')` para un pool: registra y NO tumba. Es el `'error'` que el
 * pool re-emite cuando un cliente OCIOSO pierde su conexión; el pool ya lo sacó
 * de su lista, así que no hay nada más que hacer que decirlo.
 */
export const vigilarPool = (pool: Pool, registrar: (motivo: string) => void): Pool => {
  pool.on('error', (error: Error) => {
    anotar(pool, { corte: error });
    registrar(motivoSinSecretos(error));
  });
  return pool;
};

export const conCliente = async <T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> => {
  let cliente: PoolClient;
  try {
    cliente = await pool.connect();
  } catch (error) {
    if (esErrorDeConexion(error)) {
      anotar(pool, { corte: error as Error });
      throw new BaseDeDatosNoDisponible(error);
    }
    throw error;
  }
  let corte: Error | undefined;
  const oyente = (error: Error): void => {
    corte = error;
  };
  cliente.on('error', oyente);
  let resultado: T;
  try {
    resultado = await fn(cliente);
  } catch (error) {
    const deConexion = corte !== undefined || esErrorDeConexion(error);
    cliente.off('error', oyente);
    // Con la conexión rota, el pool la descarta (`release(error)`); si no, vuelve.
    cliente.release(deConexion ? (corte ?? (error as Error)) : undefined);
    if (deConexion) {
      anotar(pool, { corte: corte ?? (error as Error) });
      throw error instanceof BaseDeDatosNoDisponible ? error : new BaseDeDatosNoDisponible(error);
    }
    throw error;
  }
  cliente.off('error', oyente);
  if (corte !== undefined) {
    // Terminó bien, pero la conexión se cortó después de su última consulta.
    cliente.release(corte);
    anotar(pool, { corte });
  } else {
    cliente.release();
    anotar(pool, { sana: true });
  }
  return resultado;
};
