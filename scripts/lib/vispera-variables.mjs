/**
 * ═════════════════════════════════════════════════════════════════════════════
 * `pnpm sitio:ensayo` · LA VÍSPERA: LAS VARIABLES NUEVAS DESDE LA 15-N (15-S1, A2)
 *
 * ¿Están en los .env de la API y de la consola? Cuáles van con valor, cuáles
 * pueden ir vacías en sitio y cuáles DEBEN ir vacías (las de Netlify). Y las
 * combinaciones con las que la API o la consola NO arrancan. El juicio mira
 * los valores; la salida, sólo NOMBRES: ningún valor sale de este fichero.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

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
