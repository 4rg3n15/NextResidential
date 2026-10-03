/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · D1/D2 · ¿EL NAVEGADOR HABLA CON LA API DIRECTAMENTE? (P-20)
 *
 * Con `API_ORIGEN_PUBLICO` declarado (consola en Netlify), la raíz de la
 * consola deja ese origen en `<meta name="ncr-api-origen">`. No es un secreto:
 * ya está en la CSP. Sin la meta, todo va como en sitio (D3): el flujo por el
 * proxy `/api/ncr` y el audio por `/api/ncr-audio` de `servidor.mjs`.
 *
 * Con ella, el flujo y el audio se abren CONTRA LA API con un billete de un
 * solo uso que se pide por el proxy (pasa por sesión, rol y copropiedad): el
 * token nunca sale de la cookie `httpOnly`, y la URL lleva sólo el billete.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const META_DEL_ORIGEN = 'ncr-api-origen';

export const origenDirecto = (
  doc: Pick<Document, 'querySelector'> | undefined = typeof document === 'undefined'
    ? undefined
    : document,
): string | null => {
  const valor = doc?.querySelector(`meta[name="${META_DEL_ORIGEN}"]`)?.getAttribute('content');
  return typeof valor === 'string' && /^https?:\/\/[^/\s?#]+$/.test(valor) ? valor : null;
};

/** `https://api` → `wss://api`; `http://localhost:3000` → `ws://localhost:3000`. */
export const comoWebSocket = (origenHttp: string): string => origenHttp.replace(/^http/, 'ws');

/** La URL del WebSocket del audio: directa a la API, o por la consola en sitio. */
export const urlDelAudio = (
  billete: string,
  origen: string | null = origenDirecto(),
  ubicacion: Pick<Location, 'protocol' | 'host'> = window.location,
): string => {
  const consulta = `billete=${encodeURIComponent(billete)}`;
  if (origen !== null) return `${comoWebSocket(origen)}/guardia/audio?${consulta}`;
  const esquema = ubicacion.protocol === 'https:' ? 'wss' : 'ws';
  return `${esquema}://${ubicacion.host}/api/ncr-audio?${consulta}`;
};

/**
 * La URL del flujo directo: pide el billete por el proxy (`…/eventos/billete`)
 * y lo pega a la ruta que devuelve la API, en su origen público.
 */
export const urlDelFlujoDirecto = async (
  rutaDeEventos: string,
  origen: string,
  pedir: typeof fetch = fetch,
): Promise<string> => {
  const r = await pedir(`${rutaDeEventos}/billete`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`Sin billete para el flujo en vivo (HTTP ${String(r.status)})`);
  const { billete, ruta } = (await r.json()) as { billete?: unknown; ruta?: unknown };
  if (typeof billete !== 'string' || typeof ruta !== 'string' || !ruta.startsWith('/')) {
    throw new Error('Respuesta de billete ilegible');
  }
  return `${origen}${ruta}?billete=${encodeURIComponent(billete)}`;
};
