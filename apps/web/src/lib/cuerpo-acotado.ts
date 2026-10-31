/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D-149 · EL CUERPO DE LA PETICIÓN, LEÍDO ENTERO Y CON TOPE ANTES DE REENVIARLO
 *
 * Con Node 22.23.4 (undici 6.29.1), el proxy perdía a veces el PRIMER trozo del
 * cuerpo al pasarle a `fetch` el `ReadableStream` que entrega Next
 * (`body: peticion.body, duplex: 'half'`). La API recibía un JSON que empezaba
 * a mitad del base64 de la foto («Unexpected token 't', "t6mTjFAusl"…») y
 * «Mi rostro» fallaba. Con 22.22.0 (undici 6.23.0) no ocurría nunca:
 *
 *   · recorrido del residente, con el proxy en flujo: 5 de 11 en rojo con
 *     22.23.4, 0 de 9 con 22.22.0, siempre con el mismo prefijo truncado;
 *   · un espía TCP entre la consola y la API: el `POST` ya SALÍA truncado de
 *     la consola, en el primer trozo `chunked`;
 *   · el mismo cuerpo leído en el proxy (no por undici): 8 de 8 en verde.
 *
 * Así que el proxy ya no le entrega a `fetch` un flujo: lee el cuerpo, que es
 * pequeño —el mayor es la foto, con 2200 kB de tope en la API—, y reenvía los
 * bytes. Leerlo exige un TOPE propio: sin él, cualquiera llenaría la memoria de
 * la consola con un cuerpo enorme antes de que la API pudiera rechazarlo.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** 3 MiB: por encima de la foto (2200 kB en la API) y de cualquier otro cuerpo. */
export const MAXIMO_CUERPO_DEL_PROXY = 3 * 1024 * 1024;

export type CuerpoLeido =
  | { readonly tipo: 'cuerpo'; readonly bytes: Uint8Array }
  | { readonly tipo: 'excede' };

/**
 * Lee el flujo entero, o se detiene —y lo cancela— en cuanto pasa del tope.
 * `declarado` es el `content-length` del cliente, si lo dio: si ya pasa del
 * tope, no se lee nada.
 */
export const leerCuerpoAcotado = async (
  cuerpo: ReadableStream<Uint8Array> | null,
  declarado: string | null,
  maximo: number = MAXIMO_CUERPO_DEL_PROXY,
): Promise<CuerpoLeido> => {
  if (declarado !== null && Number(declarado) > maximo) {
    await cuerpo?.cancel().catch(() => undefined);
    return { tipo: 'excede' };
  }
  if (cuerpo === null) return { tipo: 'cuerpo', bytes: new Uint8Array(0) };
  const lector = cuerpo.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximo) {
      await lector.cancel().catch(() => undefined);
      return { tipo: 'excede' };
    }
    trozos.push(value);
  }
  const bytes = new Uint8Array(total);
  let desde = 0;
  for (const trozo of trozos) {
    bytes.set(trozo, desde);
    desde += trozo.byteLength;
  }
  return { tipo: 'cuerpo', bytes };
};
