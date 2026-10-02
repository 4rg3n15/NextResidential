/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P1 · TRAMAS G.711 µ-LAW Y MARCAS PARA MEDIR LA LATENCIA DEL AUDIO
 *
 * Funciones puras para el banco de medida y el videoportero simulado en red:
 * tramas de 160 B (20 ms a 8 kHz, lo que el manual fija para G.711) de
 * silencio o de tono, y un detector que dice CUÁNDO empieza un tono en un
 * flujo de bytes que llega en trozos de cualquier tamaño. Con el mismo reloj
 * en los dos extremos (mismo equipo), la latencia es la resta.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** 20 ms a 8 kHz, un byte por muestra: la trama fija de G.711 en el manual. */
export const BYTES_POR_TRAMA = 160;
export const MS_POR_TRAMA = 20;
const HZ = 8000;
const SESGO = 0x84;
const TOPE = 32_635;

/** PCM16 → µ-law (ITU-T G.711). */
export const codificarUlaw = (muestra: number): number => {
  let pcm = Math.max(-32_768, Math.min(32_767, Math.round(muestra)));
  const signo = pcm < 0 ? 0x80 : 0;
  if (pcm < 0) pcm = -pcm;
  if (pcm > TOPE) pcm = TOPE;
  pcm += SESGO;
  let exponente = 7;
  for (let mascara = 0x4000; (pcm & mascara) === 0 && exponente > 0; mascara >>= 1) exponente -= 1;
  const mantisa = (pcm >> (exponente + 3)) & 0x0f;
  return ~(signo | (exponente << 4) | mantisa) & 0xff;
};

/** µ-law → PCM16. */
export const decodificarUlaw = (byte: number): number => {
  const u = ~byte & 0xff;
  const exponente = (u >> 4) & 0x07;
  const pcm = ((((u & 0x0f) << 3) + SESGO) << exponente) - SESGO;
  return (u & 0x80) !== 0 ? -pcm : pcm;
};

export const tramaDeSilencio = (): Uint8Array =>
  new Uint8Array(BYTES_POR_TRAMA).fill(codificarUlaw(0));

/** La trama `indice` de un tono continuo: la fase sigue de una trama a la siguiente. */
export const tramaDeTono = (indice: number, hz = 1000, amplitud = 8000): Uint8Array =>
  Uint8Array.from({ length: BYTES_POR_TRAMA }, (_, i) =>
    codificarUlaw(amplitud * Math.sin((2 * Math.PI * hz * (indice * BYTES_POR_TRAMA + i)) / HZ)),
  );

/** Nivel eficaz (RMS) del PCM que codifican estos bytes µ-law. */
export const nivelUlaw = (bytes: Uint8Array): number => {
  if (bytes.length === 0) return 0;
  let suma = 0;
  for (const b of bytes) {
    const m = decodificarUlaw(b);
    suma += m * m;
  }
  return Math.sqrt(suma / bytes.length);
};

/** 10 ms: la ventana del detector, la mitad de una trama, para no perder resolución. */
const VENTANA = BYTES_POR_TRAMA / 2;
/** Por encima, tono; el silencio µ-law decodifica a 0 y el tono de prueba a ~5600. */
export const UMBRAL_DE_TONO = 2000;
/** Ventanas de silencio seguidas que rearman el detector (50 ms). */
const SILENCIOS_PARA_REARMAR = 5;

/**
 * Dice el instante en que EMPIEZA cada tono. Se alimenta con lo que llegue por
 * la red, en trozos de cualquier tamaño; el instante es el de la llegada del
 * trozo que trae la primera ventana con tono, que es lo que se mide.
 */
export class DetectorDeMarcas {
  private pendiente: number[] = [];
  private armado = true;
  private silencios = SILENCIOS_PARA_REARMAR;

  constructor(
    private readonly alDetectar: (instante: number) => void,
    private readonly ahora: () => number = () => Date.now(),
  ) {}

  alimentar(bytes: Uint8Array): void {
    const instante = this.ahora();
    for (const b of bytes) this.pendiente.push(b);
    while (this.pendiente.length >= VENTANA) {
      const ventana = Uint8Array.from(this.pendiente.splice(0, VENTANA));
      if (nivelUlaw(ventana) >= UMBRAL_DE_TONO) {
        this.silencios = 0;
        if (this.armado) {
          this.armado = false;
          this.alDetectar(instante);
        }
      } else if (++this.silencios >= SILENCIOS_PARA_REARMAR) {
        this.armado = true;
      }
    }
  }
}

/**
 * La bajada del equipo: una trama cada 20 ms para todos los suscritos (el
 * `GET audioData` y la pista de audio del RTSP). `marcar` convierte las
 * siguientes en tono y apunta el instante en que la primera SALE.
 */
export class FuenteDeTramas {
  private readonly oyentes = new Set<(trama: Uint8Array) => void>();
  private temporizador: ReturnType<typeof setInterval> | null = null;
  private tonoPendiente = 0;
  private indice = 0;
  private apuntar = false;
  readonly marcasEmitidas: number[] = [];

  constructor(
    private readonly tramasDeTono = 15,
    private readonly ahora: () => number = () => Date.now(),
  ) {}

  suscribir(oyente: (trama: Uint8Array) => void): () => void {
    this.oyentes.add(oyente);
    if (this.temporizador === null) {
      this.temporizador = setInterval(() => this.emitir(), MS_POR_TRAMA);
      this.temporizador.unref();
    }
    return () => {
      this.oyentes.delete(oyente);
      if (this.oyentes.size === 0) this.detener();
    };
  }

  marcar(): void {
    this.tonoPendiente = this.tramasDeTono;
    this.apuntar = true;
  }

  detener(): void {
    if (this.temporizador !== null) clearInterval(this.temporizador);
    this.temporizador = null;
  }

  private emitir(): void {
    const conTono = this.tonoPendiente > 0;
    const trama = conTono ? tramaDeTono(this.indice++) : tramaDeSilencio();
    if (conTono) this.tonoPendiente -= 1;
    if (conTono && this.apuntar) {
      this.apuntar = false;
      this.marcasEmitidas.push(this.ahora());
    }
    for (const oyente of this.oyentes) oyente(trama);
  }
}
