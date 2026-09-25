/**
 * G.711 · µ-law y A-law ↔ PCM de 16 bits. Funciones puras, sin `AudioContext`.
 *
 * Es el códec que el videoportero del proyecto ANUNCIA para su canal de audio
 * (`g711u`, medido en la 15-C). La consola decodifica lo que el equipo dice
 * por `formatoDeAudio` del canal; lo que no conoce, no lo reproduce ni lo
 * inventa. 8 kHz, un canal, un byte por muestra: 160 bytes son 20 ms.
 */
export type FormatoG711 = 'g711u' | 'g711a';

const SESGO_ULAW = 0x84;
const TOPE_ULAW = 32_635;

/** PCM16 → µ-law (ITU-T G.711). */
export const codificarUlaw = (muestra: number): number => {
  let pcm = Math.max(-32_768, Math.min(32_767, Math.round(muestra)));
  const signo = pcm < 0 ? 0x80 : 0;
  if (pcm < 0) pcm = -pcm;
  if (pcm > TOPE_ULAW) pcm = TOPE_ULAW;
  pcm += SESGO_ULAW;
  let exponente = 7;
  for (let mascara = 0x4000; (pcm & mascara) === 0 && exponente > 0; mascara >>= 1) exponente -= 1;
  const mantisa = (pcm >> (exponente + 3)) & 0x0f;
  return ~(signo | (exponente << 4) | mantisa) & 0xff;
};

/** µ-law → PCM16. */
export const decodificarUlaw = (byte: number): number => {
  const u = ~byte & 0xff;
  const signo = u & 0x80;
  const exponente = (u >> 4) & 0x07;
  const mantisa = u & 0x0f;
  let pcm = ((mantisa << 3) + SESGO_ULAW) << exponente;
  pcm -= SESGO_ULAW;
  return signo ? -pcm : pcm;
};

/** PCM16 → A-law (ITU-T G.711). */
export const codificarAlaw = (muestra: number): number => {
  let pcm = Math.max(-32_768, Math.min(32_767, Math.round(muestra)));
  const signo = pcm >= 0 ? 0x80 : 0;
  if (pcm < 0) pcm = -pcm - 1;
  let comprimido: number;
  if (pcm < 256) {
    comprimido = pcm >> 4;
  } else {
    let exponente = 7;
    for (let mascara = 0x4000; (pcm & mascara) === 0 && exponente > 1; mascara >>= 1) {
      exponente -= 1;
    }
    const mantisa = (pcm >> (exponente + 3)) & 0x0f;
    comprimido = (exponente << 4) | mantisa;
  }
  return (comprimido | signo) ^ 0x55;
};

/** A-law → PCM16. */
export const decodificarAlaw = (byte: number): number => {
  const a = byte ^ 0x55;
  const signo = a & 0x80;
  const exponente = (a >> 4) & 0x07;
  const mantisa = a & 0x0f;
  let pcm = exponente === 0 ? (mantisa << 4) + 8 : ((mantisa << 4) + 0x108) << (exponente - 1);
  pcm = signo ? pcm : -pcm;
  return pcm;
};

const codificadores: Record<FormatoG711, (m: number) => number> = {
  g711u: codificarUlaw,
  g711a: codificarAlaw,
};
const decodificadores: Record<FormatoG711, (b: number) => number> = {
  g711u: decodificarUlaw,
  g711a: decodificarAlaw,
};

/** `null` si el equipo anuncia algo que esta consola no sabe reproducir. */
export const formatoG711De = (anunciado: string | null): FormatoG711 | null => {
  if (anunciado === null) return null;
  const f = anunciado.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (f === 'g711u' || f === 'g711ulaw' || f === 'ulaw' || f === 'mulaw' || f === 'pcmu') {
    return 'g711u';
  }
  if (f === 'g711a' || f === 'g711alaw' || f === 'alaw' || f === 'pcma') return 'g711a';
  return null;
};

/** Bytes G.711 → muestras en [-1, 1], listas para un `AudioBuffer`. */
export const decodificar = (formato: FormatoG711, bytes: Uint8Array): Float32Array => {
  const decodificarByte = decodificadores[formato];
  const salida = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    salida[i] = (decodificarByte(bytes[i] ?? 0) ?? 0) / 32_768;
  }
  return salida;
};

/** Muestras en [-1, 1] → bytes G.711. */
export const codificar = (formato: FormatoG711, muestras: Float32Array): Uint8Array => {
  const codificarMuestra = codificadores[formato];
  const salida = new Uint8Array(muestras.length);
  for (let i = 0; i < muestras.length; i += 1) {
    const m = Math.max(-1, Math.min(1, muestras[i] ?? 0));
    salida[i] = codificarMuestra(m * 32_767);
  }
  return salida;
};

/**
 * Remuestreo por interpolación lineal: del muestreo del micrófono (44,1 o 48
 * kHz) a los 8 kHz del canal, y a la inversa. Basta para voz de portería; un
 * filtro anti-solape es refinamiento que se mide en sitio, no aquí.
 */
export const remuestrear = (muestras: Float32Array, deHz: number, aHz: number): Float32Array => {
  if (deHz === aHz || muestras.length === 0) return muestras;
  const razon = deHz / aHz;
  const largo = Math.max(1, Math.floor(muestras.length / razon));
  const salida = new Float32Array(largo);
  for (let i = 0; i < largo; i += 1) {
    const pos = i * razon;
    const a = Math.floor(pos);
    const b = Math.min(a + 1, muestras.length - 1);
    const t = pos - a;
    salida[i] = (muestras[a] ?? 0) * (1 - t) + (muestras[b] ?? 0) * t;
  }
  return salida;
};

/** Frecuencia del canal G.711. */
export const HZ_DEL_CANAL = 8000;
