/**
 * 15-Q2 · E2 · LOS STUN/TURN CON QUE LA CONSOLA NEGOCIA EL VIDEO.
 *
 * Con el Edge como puente, el go2rtc que sirve el video está en la red del
 * conjunto y la consola puede estar fuera: sin STUN el navegador no sabe su
 * dirección pública, y detrás de un NAT simétrico hace falta un TURN. Los da
 * la API (`…/guardia/video/ice`), el TURN con una credencial EFÍMERA atada a
 * quien la pide; el secreto del TURN nunca llega aquí.
 *
 * Se guardan la MITAD de su vida y se piden otra vez. Si la API no los da —no
 * están configurados, es una versión anterior, falló—, la lista vacía de
 * siempre: consola y go2rtc en la misma red (R1). El video no se pierde por
 * esto; como mucho, no atraviesa un NAT que antes tampoco atravesaba.
 */
export interface OpcionesDeIce {
  /** Inyectable para las pruebas: por omisión, los que da la API. */
  readonly servidoresIce?: () => Promise<RTCIceServer[]>;
}

const vigentes = new Map<string, { readonly servidores: RTCIceServer[]; readonly hasta: number }>();

/** `…/video/<equipo>/whep` → `…/video/ice`: la ruta hermana, por el mismo proxy. */
export const rutaIce = (urlWhep: string): string | null => {
  const ruta = urlWhep.replace(/\/[^/]+\/whep$/, '/ice');
  return ruta === urlWhep ? null : ruta;
};

const esUrlIce = (u: unknown): u is string => typeof u === 'string' && /^(stun|turns?):/.test(u);

const servidorValido = (s: unknown): RTCIceServer | null => {
  if (typeof s !== 'object' || s === null) return null;
  const { urls, username, credential } = s as Record<string, unknown>;
  if (!Array.isArray(urls) || urls.length === 0 || !urls.every(esUrlIce)) return null;
  return {
    urls,
    ...(typeof username === 'string' ? { username } : {}),
    ...(typeof credential === 'string' ? { credential } : {}),
  };
};

export const servidoresIce = async (
  urlWhep: string,
  fetchFn: typeof fetch = (entrada, init) => fetch(entrada, init),
  ahora: () => number = Date.now,
): Promise<RTCIceServer[]> => {
  const ruta = rutaIce(urlWhep);
  if (ruta === null) return [];
  const guardado = vigentes.get(ruta);
  if (guardado !== undefined && guardado.hasta > ahora()) return guardado.servidores;
  try {
    const respuesta = await fetchFn(ruta, { cache: 'no-store' });
    if (!respuesta.ok) return [];
    const cuerpo = (await respuesta.json()) as { iceServers?: unknown; ttlSegundos?: unknown };
    const lista = Array.isArray(cuerpo.iceServers) ? cuerpo.iceServers : [];
    const servidores = lista.map(servidorValido).filter((s): s is RTCIceServer => s !== null);
    const ttl = typeof cuerpo.ttlSegundos === 'number' ? cuerpo.ttlSegundos : 0;
    vigentes.set(ruta, { servidores, hasta: ahora() + (ttl * 1000) / 2 });
    return servidores;
  } catch {
    return [];
  }
};

/** Lo que usa `negociarVistaEnVivo`: el inyectado, o los de la API para esa ruta. */
export const iceDe = (urlWhep: string, opciones: OpcionesDeIce): Promise<RTCIceServer[]> =>
  opciones.servidoresIce?.() ?? servidoresIce(urlWhep);

/** Sólo para las pruebas: lo guardado se olvida. */
export const olvidarIce = (): void => vigentes.clear();
