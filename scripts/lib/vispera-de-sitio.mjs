/**
 * ═════════════════════════════════════════════════════════════════════════════
 * `pnpm sitio:ensayo` · LA VÍSPERA DE SITIO (15-S1, A2)
 *
 * Además de las comprobaciones del Mac de siempre, tres preguntas de la noche
 * antes, todas de SÓLO LECTURA:
 *
 *  · ¿Tiene la base REAL las migraciones 0047–0054? Una línea por migración,
 *    con su nombre. Lo dice el registro de la CLI; si el rol de la API no puede
 *    leerlo, la huella que cada una deja en el catálogo.
 *  · ¿Están en los .env de la API y de la consola las variables que entraron
 *    desde la 15-N? Eso, en `vispera-variables.mjs`.
 *  · ¿Se sirve la consola de forma que la guardia tenga micrófono? El
 *    navegador sólo lo da en contexto seguro —en el propio Mac, por el bucle
 *    local—, y el audio necesita el reenvío de `servidor.mjs` hasta la API.
 *
 * Nada de lo que imprime lleva un valor de un .env ni una IP de la red: sólo
 * nombres de variable, números de migración y el bucle local.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { randomBytes } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { comprobacionesDelMac } from './comprobaciones-del-mac.mjs';
import { sondearSalud } from './ensayo-plataforma.mjs';
import { leerEntornos, lineasDeVariables } from './vispera-variables.mjs';

/** Lo que cada migración de la 15-P a la 15-R deja en el catálogo. */
export const MIGRACIONES_DE_LA_VISPERA = [
  { numero: '0047', huella: { tabla: 'conversaciones_de_guardia' } },
  { numero: '0048', huella: { tabla: 'puntos_de_acceso', columna: 'numero_de_puerta' } },
  { numero: '0049', huella: { funcion: 'tg_version_reglas_monotona' } },
  { numero: '0050', huella: { tabla: 'edge_gateways', columna: 'puente' } },
  { numero: '0051', huella: { tabla: 'bloqueos_de_acceso' } },
  { numero: '0052', huella: { tabla: 'dispositivos_de_notificacion', columna: 'clave_p256dh' } },
  { numero: '0053', huella: { tabla: 'ordenes_de_modo_de_puerta' } },
  { numero: '0054', huella: { tabla: 'usuarios', politica: 'usuarios_lectura_servicio' } },
];

/** Del catálogo, que cualquier rol lee: no hace falta el registro de la CLI. */
const tieneLaHuella = async (pool, h) => {
  const [sql, parametros] =
    h.funcion !== undefined
      ? [
          `SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'app' AND p.proname = $1`,
          [h.funcion],
        ]
      : h.politica !== undefined
        ? [
            `SELECT 1 FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid = p.polrelid
               JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relname = $1 AND p.polname = $2`,
            [h.tabla, h.politica],
          ]
        : [
            `SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
               LEFT JOIN pg_catalog.pg_attribute a
                 ON a.attrelid = c.oid AND a.attname = $2 AND NOT a.attisdropped
              WHERE n.nspname = 'public' AND c.relname = $1 AND ($2::text IS NULL OR a.attname IS NOT NULL)`,
            [h.tabla, h.columna ?? null],
          ];
  const { rows } = await pool.query(sql, parametros);
  return rows.length > 0;
};

/** 0047–0054, cada una con su nombre y si la base la tiene. */
export const migracionesDeLaVispera = async (pool, carpeta) => {
  const ficheros = readdirSync(carpeta);
  let aplicadas = null;
  try {
    const { rows } = await pool.query('SELECT version FROM supabase_migrations.schema_migrations');
    aplicadas = new Set(rows.map((r) => String(r.version)));
  } catch {
    // El rol de la API puede no leer el registro de la CLI: queda la huella.
  }
  const migraciones = [];
  for (const { numero, huella } of MIGRACIONES_DE_LA_VISPERA) {
    const fichero = ficheros.find((f) => new RegExp(`^\\d{14}_${numero}_.+\\.sql$`).test(f));
    migraciones.push({
      numero,
      nombre: fichero === undefined ? '(sin fichero en el repositorio)' : fichero.slice(20, -4),
      aplicada:
        aplicadas !== null && fichero !== undefined
          ? aplicadas.has(fichero.slice(0, 14))
          : await tieneLaHuella(pool, huella),
    });
  }
  return { porRegistro: aplicadas !== null, migraciones };
};

export const lineasDeMigraciones = ({ porRegistro, migraciones }) => {
  const faltan = migraciones.filter((m) => !m.aplicada).length;
  return [
    `── La víspera · migraciones 0047–0054 en la base (${porRegistro ? 'por el registro de la CLI' : 'por su huella: el rol de la API no lee el registro de la CLI'})`,
    ...migraciones.map((m) => `  ${m.aplicada ? '✓' : '✗'} ${m.numero} ${m.nombre}`),
    faltan === 0
      ? '  ✓ están las ocho'
      : `  → faltan ${faltan} de ${migraciones.length}: supabase db push y reinicie la API (ENTREGA_EN_SITIO §0)`,
  ];
};

/** Una actualización a `/api/ncr-audio` con un billete inventado: la API debe decir 401. */
export const sondearReenvioDeAudio = (origen, plazoMs = 3000) =>
  new Promise((listo) => {
    let hecho = false;
    const peticion = request(new URL('/api/ncr-audio?billete=vispera-de-sitio', origen), {
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': randomBytes(16).toString('base64'),
      },
      timeout: plazoMs,
    });
    const acabar = (estado) => {
      if (hecho) return;
      hecho = true;
      peticion.destroy();
      listo(estado);
    };
    peticion.on('upgrade', (_r, socket) => {
      socket.destroy();
      acabar(101);
    });
    peticion.on('response', (r) => {
      r.resume();
      acabar(r.statusCode ?? null);
    });
    peticion.on('timeout', () => acabar(null));
    peticion.on('error', () => acabar(null));
    peticion.end();
  });

export const lineasDeLaConsola = async (origen, plazoMs = 3000) => {
  const lineas = ['── La víspera · la consola de la guardia (el micrófono pide contexto seguro)'];
  if (!(await sondearSalud(`${origen}/`, plazoMs)).alcanzada) {
    lineas.push(
      `  ✗ la consola no contesta en ${origen} → pnpm --filter @ncr/web start: sin ella ahí, la guardia no tiene micrófono`,
    );
    return lineas;
  }
  const estado = await sondearReenvioDeAudio(origen, plazoMs);
  lineas.push(
    estado === 401
      ? '  ✓ contesta por el bucle local y reenvía el audio a la API (servidor.mjs)'
      : estado === 502
        ? '  ✗ la consola no llega a la API con el audio → API_URL de la consola y la API en marcha'
        : estado === 404
          ? '  ✗ la API no atiende el audio por WebSocket → GUARDIA_AUDIO_TRANSPORTE=websocket y reinicio'
          : estado === 101
            ? '  ✗ algo aceptó un billete inventado en /api/ncr-audio: no es servidor.mjs ante la API'
            : '  ✗ la consola no reenvía el audio → arránquela con pnpm --filter @ncr/web start, no con next start',
    `  ▶ la guardia (micrófono), SÓLO en el propio Mac por ${origen}: por la IP del Mac el navegador lo niega`,
  );
  return lineas;
};

/** Lo que `sitio:ensayo` llama: las del Mac de siempre y, detrás, las de la víspera. */
export const comprobacionesDeLaVispera = async ({
  pool,
  decir,
  raiz,
  rutaEnv,
  consola = 'http://127.0.0.1:3100',
}) => {
  await comprobacionesDelMac({ pool, decir, raiz });
  if (pool !== null) {
    try {
      const m = await migracionesDeLaVispera(pool, join(raiz, 'supabase/migrations'));
      for (const l of lineasDeMigraciones(m)) decir(l);
    } catch {
      decir('  ✗ no se pudieron leer las migraciones 0047–0054 de la base');
    }
  }
  for (const l of lineasDeVariables(leerEntornos(raiz, rutaEnv))) decir(l);
  for (const l of await lineasDeLaConsola(consola)) decir(l);
};
