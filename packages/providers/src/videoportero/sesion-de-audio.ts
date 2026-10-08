import type { Bitacora } from '@ncr/domain-core';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B2/B5 (15-S2) · LA SESIÓN TwoWayAudio: SU `sessionId` Y LO QUE PASÓ EN ELLA
 *
 * Medido en el DS-KD9633-WBE6 (V2.3.9, 06/10): `PUT …/open` contesta 200 con
 * `<sessionId>`, y hasta la 15-S1 nadie lo usaba. `[SUPUESTO]` S-15S2-02: que
 * `audioData` (subida y bajada) y `close` lo acepten como `?sessionId=<id>` y
 * que algún firmware lo EXIJA —la terminal que no oía al operador es la
 * candidata—. No hay documento del fabricante en el repositorio que lo fije,
 * así que se diseña para que UNA prueba en sitio lo resuelva:
 *
 *  · si el equipo lo dio, se manda en `audioData` y `close`;
 *  · si el equipo rechaza la petición CON él (400 o 403), se repite UNA vez
 *    sin él y se recuerda para el resto de la sesión;
 *  · si no lo dio, nada cambia respecto a la 15-S1.
 *
 * Y lo que pasó se anota al cerrar (B5): bytes en cada sentido, cuándo llegó
 * el primero de cada uno, los estados HTTP y si se usó el `sessionId`. Nunca
 * el audio, nunca la credencial: la voz es un dato personal (Ley 1581).
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** El `sessionId` de la respuesta de `open` (XML o JSON), o `null` si no trae. */
export const sessionIdDe = (cuerpo: string): string | null => {
  const xml = /<sessionId>\s*([^<\s]+)\s*<\/sessionId>/i.exec(cuerpo)?.[1];
  const json = /"sessionId"\s*:\s*"?([^",}\s]+)"?/i.exec(cuerpo)?.[1];
  const id = xml ?? json ?? null;
  return id !== null && /^[A-Za-z0-9._-]{1,64}$/.test(id) ? id : null;
};

/** La ruta con `?sessionId=` cuando hay uno y se usa. */
export const rutaConSesion = (ruta: string, id: string | null): string =>
  id === null
    ? ruta
    : `${ruta}${ruta.includes('?') ? '&' : '?'}sessionId=${encodeURIComponent(id)}`;

/** ¿Este rechazo puede ser por el `sessionId`? Sólo si se mandó, y con 400 o 403. */
export const rechazoPorSesion = (estado: number, conSesion: boolean): boolean =>
  conSesion && (estado === 400 || estado === 403);

type Sentido = 'subida' | 'bajada';

/** El estado de una sesión: su id, si se usa, y lo que pasó (B5). */
export class SesionDeAudio {
  private id: string | null = null;
  private usarId = true;
  private abiertaEn = 0;
  private readonly bytes = { subida: 0, bajada: 0 };
  private readonly primero: Record<Sentido, number | null> = { subida: null, bajada: null };
  private readonly estados: string[] = [];

  constructor(private readonly ahora: () => number = Date.now) {}

  /** Al abrir: el id que dio el equipo, y los contadores a cero. */
  abrir(cuerpoDeOpen: string, estado: number): void {
    this.id = sessionIdDe(cuerpoDeOpen);
    this.usarId = true;
    this.abiertaEn = this.ahora();
    this.bytes.subida = 0;
    this.bytes.bajada = 0;
    this.primero.subida = null;
    this.primero.bajada = null;
    this.estados.length = 0;
    this.estados.push(`open ${String(estado)}`);
  }

  /** La ruta para `audioData` o `close`: con `?sessionId=` mientras el equipo lo acepte. */
  ruta(base: string): string {
    return rutaConSesion(base, this.usarId ? this.id : null);
  }

  /** `true` si lo que se mandó llevaba `sessionId`. */
  get conId(): boolean {
    return this.usarId && this.id !== null;
  }

  /**
   * Anota un estado HTTP; si el rechazo puede ser por el `sessionId` —la
   * petición lo LLEVABA (`conId`, tomado al enviarla: otra respuesta pudo
   * apagarlo entre tanto)—, deja de usarlo y devuelve `true` para que quien
   * llama repita sin él.
   */
  anotar(que: string, estado: number, conId: boolean = this.conId): boolean {
    this.estados.push(`${que} ${String(estado)}`);
    if (!rechazoPorSesion(estado, conId)) return false;
    this.usarId = false;
    this.estados.push(`${que}: se repite sin sessionId`);
    return true;
  }

  contar(sentido: Sentido, n: number): void {
    if (n <= 0) return;
    this.bytes[sentido] += n;
    this.primero[sentido] ??= this.ahora() - this.abiertaEn;
  }

  /** B5 · lo que se anota al cerrar: cifras y estados, nunca audio ni credencial. */
  resumen(formato: string | null): Readonly<Record<string, unknown>> {
    return {
      bytesSubidos: this.bytes.subida,
      bytesBajados: this.bytes.bajada,
      primerByteSubidaMs: this.primero.subida,
      primerByteBajadaMs: this.primero.bajada,
      estadosHttp: [...this.estados],
      sessionId: this.id === null ? 'no lo dio el equipo' : this.usarId ? 'usado' : 'rechazado',
      formato,
    };
  }

  /** B5 · una línea por sesión en la bitácora del equipo, si la hay. */
  registrar(traza: Bitacora | undefined, dispositivoId: string, formato: string | null): void {
    traza?.registrar('info', 'sesión de audio terminada', {
      dispositivoId,
      ...this.resumen(formato),
    });
  }
}
