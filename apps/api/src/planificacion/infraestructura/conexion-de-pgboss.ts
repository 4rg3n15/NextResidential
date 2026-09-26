/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-07 · QUÉ CONEXIÓN USA pg-boss, DICHO AL ARRANCAR
 *
 * En sitio, el 26/09/2026, el planificador no arrancó: `DATABASE_URL` era la
 * conexión DIRECTA de Supabase (`db.<ref>.supabase.co`), que sólo resuelve por
 * IPv6, y la red del conjunto era sólo IPv4. `ENOTFOUND`, y RN-11 sin barrido.
 *
 * pg-boss necesita una conexión de SESIÓN —cerrojos consultivos y `LISTEN`—:
 * vale la directa o el pooler en modo sesión (puerto 5432), no el pooler en
 * modo transacción (6543), que es lo que usa el pool de la API. Por eso tiene
 * su propia variable y no hereda `DATABASE_POOLER_URL`.
 *
 * Esto sólo CLASIFICA la cadena para la bitácora: nunca devuelve el usuario ni
 * la contraseña.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type ClaseDeConexion =
  | 'directa_supabase'
  | 'pooler_sesion'
  | 'pooler_transaccion'
  | 'otra'
  | 'ilegible';

export interface ConexionDePgBoss {
  readonly variable: 'PGBOSS_DATABASE_URL' | 'DATABASE_URL';
  readonly cadena: string;
  readonly clase: ClaseDeConexion;
  /** `host:puerto`, sin credencial. */
  readonly destino: string;
  /** `null` si nada que avisar; si no, qué va a fallar y cómo se arregla. */
  readonly aviso: string | null;
}

const clasificar = (cadena: string): { clase: ClaseDeConexion; destino: string } => {
  let url: URL;
  try {
    url = new URL(cadena);
  } catch {
    return { clase: 'ilegible', destino: '(cadena ilegible)' };
  }
  const puerto = url.port === '' ? '5432' : url.port;
  const destino = `${url.hostname}:${puerto}`;
  if (/\.pooler\.supabase\.com$/i.test(url.hostname)) {
    return { clase: puerto === '6543' ? 'pooler_transaccion' : 'pooler_sesion', destino };
  }
  if (/^db\.[a-z0-9]+\.supabase\.co$/i.test(url.hostname)) {
    return { clase: 'directa_supabase', destino };
  }
  return { clase: 'otra', destino };
};

const AVISOS: Readonly<Record<ClaseDeConexion, string | null>> = {
  directa_supabase:
    'conexión DIRECTA de Supabase: sólo resuelve por IPv6. En una red sólo IPv4 fallará con ' +
    'ENOTFOUND y los barridos no se ejecutarán. Use PGBOSS_DATABASE_URL con el pooler en modo ' +
    'SESIÓN (puerto 5432): guía CONEXION_SUPABASE.md',
  pooler_transaccion:
    'pooler en modo TRANSACCIÓN (6543): pg-boss necesita sesión (cerrojos y LISTEN). Use el ' +
    'mismo pooler en el puerto 5432',
  pooler_sesion: null,
  otra: null,
  ilegible: 'la cadena no es una URL: pg-boss no podrá conectar',
};

export const conexionDePgBoss = (entorno: {
  readonly PGBOSS_DATABASE_URL?: string | undefined;
  readonly DATABASE_URL: string;
}): ConexionDePgBoss => {
  const propia = entorno.PGBOSS_DATABASE_URL;
  const variable = propia === undefined || propia === '' ? 'DATABASE_URL' : 'PGBOSS_DATABASE_URL';
  const cadena = variable === 'DATABASE_URL' ? entorno.DATABASE_URL : (propia as string);
  const { clase, destino } = clasificar(cadena);
  return { variable, cadena, clase, destino, aviso: AVISOS[clase] };
};
