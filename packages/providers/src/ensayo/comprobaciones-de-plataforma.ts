import { CLASES_DE_PROVEEDOR } from '../fabrica';
import { sinSecretosConocidos } from './informe-de-ensayo';
import type { EstadoDePaso } from './tipos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE EL ENSAYO COMPRUEBA DE LA PLATAFORMA, NO DE UN EQUIPO (corrección 15-L)
 *
 * Dos defectos de sitio que ningún paso por equipo veía, porque el equipo
 * contestaba bien y el problema estaba en el `.env` de la API:
 *
 *  · **F3 · la API en modo simulado con equipos reales dados de alta.** Con
 *    `PROVEEDOR_DE_EQUIPOS=simulado` la consola «abre» y el simulado dice que
 *    sí: la orden no llega a ningún equipo. En el ensayo parecía todo en orden.
 *  · **C1 · pg-boss contra la conexión DIRECTA de Supabase.** `db.<ref>.
 *    supabase.co` sólo resuelve por IPv6; en una red sólo IPv4 el planificador
 *    muere con `ENOTFOUND` y la supresión de plantillas (RN-11) no se ejecuta.
 *    Se aplica LA MISMA regla que la API (`planificacion/infraestructura/
 *    conexion-de-pgboss.ts`): `PGBOSS_DATABASE_URL` si está, si no
 *    `DATABASE_URL`; y un valor vacío cuenta como ausente, como en su esquema.
 *
 * Cuentan en el VEREDICTO igual que un paso: un FALLO aquí es un FALLO.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface ComprobacionDePlataforma {
  readonly titulo: string;
  readonly estado: EstadoDePaso;
  readonly causa: string;
  readonly accion: string | null;
  readonly detalle: readonly string[];
}

/** Lo que el ensayo lee del `.env` de la API para estas comprobaciones. */
export interface EntornoDeLaPlataforma {
  readonly PROVEEDOR_DE_EQUIPOS?: string | undefined;
  readonly DATABASE_URL?: string | undefined;
  readonly PGBOSS_DATABASE_URL?: string | undefined;
}

const valor = (v: string | undefined): string | undefined =>
  v === undefined || v.trim() === '' ? undefined : v.trim();

/** El proveedor que habla con equipos de verdad: el que no es el simulado. */
export const PROVEEDORES_REALES = CLASES_DE_PROVEEDOR.filter((c) => c !== 'simulado');

export const juzgarProveedorDeEquipos = (
  entorno: EntornoDeLaPlataforma,
  equiposReales: number | null,
): ComprobacionDePlataforma => {
  const titulo = 'Proveedor de equipos de la API';
  // Como el esquema de la API: sin valor, `simulado`.
  const proveedor = valor(entorno.PROVEEDOR_DE_EQUIPOS) ?? 'simulado';
  const real = PROVEEDORES_REALES.join(' o ');
  const detalle = [
    `PROVEEDOR_DE_EQUIPOS=${proveedor}` +
      (equiposReales === null ? '' : ` · equipos reales registrados: ${String(equiposReales)}`),
  ];
  if (proveedor !== 'simulado') {
    return {
      titulo,
      estado: 'ok',
      causa: `La API habla con los equipos (${proveedor})`,
      accion: null,
      detalle,
    };
  }
  if (equiposReales === null) {
    return {
      titulo,
      estado: 'omitido',
      causa: 'La API está en modo simulado y sin la base no se sabe si hay equipos reales',
      accion: 'Repita con DATABASE_URL en apps/api/.env',
      detalle,
    };
  }
  if (equiposReales === 0) {
    return {
      titulo,
      estado: 'ok',
      causa: 'La API está en modo simulado y no hay equipos reales registrados',
      accion: null,
      detalle,
    };
  }
  return {
    titulo,
    estado: 'fallo',
    causa:
      `Equipos simulados: las órdenes no llegan a ningún equipo real (hay ` +
      `${String(equiposReales)} registrados en la consola)`,
    accion: `En apps/api/.env ponga PROVEEDOR_DE_EQUIPOS=${real} y reinicie la API`,
    detalle,
  };
};

type ClaseDeConexion = 'directa_supabase' | 'pooler_transaccion' | 'otra' | 'ilegible';

const clasificar = (cadena: string): { clase: ClaseDeConexion; destino: string } => {
  let url: URL;
  try {
    url = new URL(cadena);
  } catch {
    return { clase: 'ilegible', destino: '(cadena ilegible)' };
  }
  const puerto = url.port === '' ? '5432' : url.port;
  const destino = `${url.hostname}:${puerto}`;
  if (/\.pooler\.supabase\.com$/i.test(url.hostname) && puerto === '6543') {
    return { clase: 'pooler_transaccion', destino };
  }
  if (/^db\.[a-z0-9]+\.supabase\.co$/i.test(url.hostname)) {
    return { clase: 'directa_supabase', destino };
  }
  return { clase: 'otra', destino };
};

export const juzgarConexionDePgBoss = (
  entorno: EntornoDeLaPlataforma,
): ComprobacionDePlataforma => {
  const titulo = 'Conexión del planificador (pg-boss)';
  const propia = valor(entorno.PGBOSS_DATABASE_URL);
  const variable = propia === undefined ? 'DATABASE_URL' : 'PGBOSS_DATABASE_URL';
  const cadena = propia ?? valor(entorno.DATABASE_URL);
  if (cadena === undefined) {
    return {
      titulo,
      estado: 'omitido',
      causa: 'Sin DATABASE_URL ni PGBOSS_DATABASE_URL: no se sabe a dónde conectará pg-boss',
      accion: 'Complete apps/api/.env',
      detalle: [],
    };
  }
  const { clase, destino } = clasificar(cadena);
  // Sólo `host:puerto`: la cadena lleva usuario y contraseña.
  const detalle = [`pg-boss usará ${variable} → ${destino}`];
  const cambiar =
    variable === 'DATABASE_URL'
      ? 'Defina PGBOSS_DATABASE_URL en apps/api/.env'
      : 'Cambie PGBOSS_DATABASE_URL en apps/api/.env';
  const accion = `${cambiar}: use el pooler en modo sesión (:5432) —«Session pooler» en Connect del panel de Supabase— y reinicie la API`;
  if (clase === 'directa_supabase') {
    return {
      titulo,
      estado: 'fallo',
      causa:
        `pg-boss usaría la conexión DIRECTA de Supabase (${destino}), que sólo resuelve por ` +
        'IPv6: en una red sólo IPv4 muere con ENOTFOUND y la supresión de plantillas no corre',
      accion,
      detalle,
    };
  }
  if (clase === 'pooler_transaccion') {
    return {
      titulo,
      estado: 'fallo',
      causa: `pg-boss usaría el pooler en modo TRANSACCIÓN (${destino}): necesita sesión`,
      accion,
      detalle,
    };
  }
  if (clase === 'ilegible') {
    return { titulo, estado: 'fallo', causa: `${variable} no es una URL`, accion, detalle };
  }
  return { titulo, estado: 'ok', causa: `pg-boss conecta a ${destino}`, accion: null, detalle };
};

const MARCA: Readonly<Record<EstadoDePaso, string>> = {
  ok: 'OK',
  fallo: 'FALLO',
  omitido: 'OMITIDO',
  no_aplica: 'NO APLICA',
};

export const lineasDeComprobaciones = (
  comprobaciones: readonly ComprobacionDePlataforma[],
  secretos: readonly string[],
): string[] =>
  comprobaciones
    .flatMap((c) => [
      `  · ${c.titulo.padEnd(38, '.')} ${MARCA[c.estado]} — ${c.causa}`,
      ...(c.accion !== null && c.estado !== 'ok' ? [`     → ${c.accion}`] : []),
      ...c.detalle.map((d) => `       ${d}`),
    ])
    .map((l) => sinSecretosConocidos(l, secretos));
