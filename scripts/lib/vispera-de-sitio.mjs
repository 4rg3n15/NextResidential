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
 *    desde la 15-N? Cuáles van con valor, cuáles pueden ir vacías en sitio y
 *    cuáles DEBEN ir vacías (las de Netlify). Y las combinaciones con las que
 *    la API o la consola NO arrancan.
 *  · ¿Se sirve la consola de forma que la guardia tenga micrófono? El
 *    navegador sólo lo da en contexto seguro —en el propio Mac, por el bucle
 *    local—, y el audio necesita el reenvío de `servidor.mjs` hasta la API.
 *
 * Nada de lo que imprime lleva un valor de un .env ni una IP de la red: sólo
 * nombres de variable, números de migración y el bucle local.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { request } from 'node:http';
import { join, relative } from 'node:path';
import { comprobacionesDelMac } from './comprobaciones-del-mac.mjs';
import { sondearSalud } from './ensayo-plataforma.mjs';

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

/**
 * Las variables nuevas desde la 15-N y lo que piden EN SITIO (Mac directo):
 * `valor`, obligatoria con valor (el `.env.example` la trae así; sin ella la
 * API usa su omisión); `vacia`, puede ir vacía (Web Push y TURN no se prueban
 * en sitio); `netlify`, vacía en sitio; `nunca-vacia`, puede faltar, pero
 * vacía la consola no arranca.
 */
export const VARIABLES_DESDE_LA_15N = {
  api: {
    GUARDIA_AUDIO_TRANSPORTE: 'valor',
    GUARDIA_VIGENCIA_EN_COLA_S: 'valor',
    EVENTOS_HISTORICOS_LOTE: 'valor',
    EVENTOS_HISTORICOS_POR_SEGUNDO: 'valor',
    PGBOSS_POOL_MAX: 'valor',
    SUPABASE_POOLER_MAX_CLIENTES: 'valor',
    WEB_PUSH_VAPID_PUBLICA: 'vacia',
    WEB_PUSH_VAPID_PRIVADA: 'vacia',
    WEB_PUSH_SUJETO: 'vacia',
    WEB_PUSH_SERVICIOS_PERMITIDOS: 'vacia',
    WEB_PUSH_TTL_SEGUNDOS: 'vacia',
    WEBRTC_STUN_URLS: 'vacia',
    WEBRTC_TURN_URLS: 'vacia',
    WEBRTC_TURN_SECRETO: 'vacia',
    WEBRTC_TURN_TTL_SEGUNDOS: 'vacia',
    API_IP_FIRMA_SECRETO: 'netlify',
  },
  consola: {
    API_ORIGEN_PUBLICO: 'netlify',
    CONSOLA_CABECERA_IP_DE_CONFIANZA: 'netlify',
    CONSOLA_IP_FIRMA_SECRETO: 'netlify',
    RECUPERACION_POR_CORREO: 'nunca-vacia',
  },
};

/** Qué decir de las que no están, por clase. */
const SI_FALTAN = {
  valor: [
    '✗',
    'obligatorias, sin valor',
    'cópielas del .env.example (mientras, la API usa su omisión)',
  ],
  vacia: [
    '·',
    'pueden ir vacías en sitio y no están',
    'basta la línea vacía (entorno:diff la reclama)',
  ],
  netlify: ['·', 'de Netlify, no están', 'en sitio, la línea vacía'],
  'nunca-vacia': [
    '·',
    'pueden faltar, NUNCA vacías',
    'sin la línea vale; si la pone, «desactivada»',
  ],
};

/** Nombre → valor ya sin comillas ni comentario. El valor NUNCA sale de aquí. */
export const leerDotenv = (contenido) => {
  const definidas = new Map();
  for (const linea of contenido.split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=(.*)$/.exec(linea);
    if (m === null) continue;
    const crudo = m[2].trim();
    const entre = /^(["'])(.*)\1$/.exec(crudo);
    definidas.set(m[1], entre === null ? crudo.replace(/\s+#.*$/, '') : entre[2]);
  }
  return definidas;
};

/** La consola en `pnpm start` es producción: Next lee estos, y el último manda. */
const DE_LA_CONSOLA = ['.env', '.env.production', '.env.local', '.env.production.local'];

export const leerEntornos = (raiz, rutaEnvApi) => {
  const api = existsSync(rutaEnvApi) ? leerDotenv(readFileSync(rutaEnvApi, 'utf8')) : null;
  const leidos = DE_LA_CONSOLA.filter((f) => existsSync(join(raiz, 'apps/web', f)));
  const consola = new Map();
  for (const f of leidos)
    for (const [k, v] of leerDotenv(readFileSync(join(raiz, 'apps/web', f), 'utf8')))
      consola.set(k, v);
  const nombreApi = relative(raiz, rutaEnvApi);
  return {
    api,
    consola: leidos.length === 0 ? null : consola,
    rotulos: {
      api: nombreApi.startsWith('..') ? 'el .env de --env' : nombreApi,
      consola: leidos.map((f) => `apps/web/${f}`).join(' + ') || 'apps/web/.env',
    },
  };
};

const lleno = (entorno, n) => (entorno.get(n) ?? '') !== '';

/** Lo que con esa combinación impide arrancar (o estropea la prueba de mañana). */
const bloqueos = (cual, e) => {
  const b = [];
  if (cual === 'api') {
    const avisos = ['WEB_PUSH_VAPID_PUBLICA', 'WEB_PUSH_VAPID_PRIVADA', 'WEB_PUSH_SUJETO'];
    const puestas = avisos.filter((n) => lleno(e, n)).length;
    if (puestas > 0 && puestas < 3)
      b.push(
        'Web Push: VAPID pública, privada y sujeto van las tres o ninguna → la API NO arranca',
      );
    if (lleno(e, 'WEBRTC_TURN_URLS') !== lleno(e, 'WEBRTC_TURN_SECRETO'))
      b.push('TURN: WEBRTC_TURN_URLS y WEBRTC_TURN_SECRETO van juntas → la API NO arranca');
    if (lleno(e, 'GUARDIA_AUDIO_TRANSPORTE') && e.get('GUARDIA_AUDIO_TRANSPORTE') !== 'websocket')
      b.push(
        'GUARDIA_AUDIO_TRANSPORTE no es websocket: mañana se prueba el audio por WebSocket (§8.4.1)',
      );
  } else {
    const r = e.get('RECUPERACION_POR_CORREO');
    if (r !== undefined && r !== 'activa' && r !== 'desactivada')
      b.push(
        `RECUPERACION_POR_CORREO ${r === '' ? 'vacía' : 'con un valor no admitido'}: la consola NO arranca → «desactivada» o sin la línea`,
      );
    const motivos = {
      API_ORIGEN_PUBLICO: 'el flujo y el audio irían directos a ese origen, no por la consola',
      CONSOLA_CABECERA_IP_DE_CONFIANZA:
        'la IP del navegador saldría de una cabecera que en sitio nadie escribe',
      CONSOLA_IP_FIRMA_SECRETO: 'es la firma de Netlify',
    };
    for (const [n, motivo] of Object.entries(motivos))
      if (lleno(e, n)) b.push(`${n} con valor: en sitio va vacía (${motivo})`);
  }
  return b;
};

export const lineasDeVariables = ({ api, consola, rotulos }) => {
  const lineas = ['── La víspera · variables nuevas desde la 15-N (sólo nombres; ningún valor)'];
  for (const cual of ['api', 'consola']) {
    const entorno = cual === 'api' ? api : consola;
    lineas.push(`  ${rotulos[cual]}`);
    if (entorno === null) {
      lineas.push(
        `    ✗ no existe: copie apps/${cual === 'api' ? 'api' : 'web'}/.env.example y rellénelo`,
      );
      continue;
    }
    const clases = Object.entries(VARIABLES_DESDE_LA_15N[cual]);
    // `valor` vacía cuenta como ausente: la API la trata así. Las demás, por la línea.
    const falta = ([n, clase]) => (clase === 'valor' ? !lleno(entorno, n) : !entorno.has(n));
    const faltan = clases.filter(falta);
    if (faltan.length === 0) lineas.push(`    ✓ las ${clases.length} nuevas están declaradas`);
    for (const [clase, [marca, que, remedio]] of Object.entries(SI_FALTAN)) {
      const nombres = faltan.filter(([, c]) => c === clase).map(([n]) => n);
      if (nombres.length > 0)
        lineas.push(`    ${marca} ${que}: ${nombres.join(', ')} → ${remedio}`);
    }
    for (const b of bloqueos(cual, entorno)) lineas.push(`    ✗ ${b}`);
  }
  return lineas;
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
