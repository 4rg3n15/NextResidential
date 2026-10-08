/**
 * A5 (ETAPA 15-E) · de dónde sale el VIDEO de un equipo.
 *
 * El navegador nunca recibe una URL RTSP: llevaría la credencial del equipo
 * (RN-12, RN-21). El proveedor —el único que conoce la marca, el camino del
 * flujo y la credencial— construye el origen y se lo entrega al PUENTE de
 * video (go2rtc), que vive del lado del servidor. Lo que el navegador ve es
 * un nombre de flujo y un SDP.
 */
export interface OrigenDeVideo {
  /** URL RTSP completa, credencial incluida. SÓLO para el puente; jamás al cliente. */
  readonly rtsp: string;
  /** Qué flujo es: principal (mayor calidad) o secundario (menor latencia). */
  readonly flujo: 'principal' | 'secundario';
  readonly detalle: string;
  /**
   * A2 (15-S2) · el códec que el equipo declara para ESTE canal (o, si no lo
   * declara, el de su última respuesta RTSP en él): «H.264», «H.265». `null` o
   * ausente si no se sabe. Con él y la oferta del navegador, la API decide si
   * el video va directo, transcodificado o no se puede ver (`via-de-video.ts`).
   */
  readonly codec?: string | null;
  /** A2 (15-S2) · el canal elegido (canal×100+flujo), para nombrarlo al operador. */
  readonly canal?: string | null;
}

/**
 * V5 (15-N) · por qué no hay video, preguntado al EQUIPO cuando el puente no
 * lo dice (go2rtc contesta «wrong response on DESCRIBE» para 403, 404, 412 y
 * 454 por igual). Neutral: la frase ya viene en palabras, sin marca.
 */
export type CausaDeVideo =
  | 'ninguna'
  | 'credencial'
  | 'solo_sha256'
  | 'sin_permiso'
  | 'sin_canal'
  | 'sesion'
  | 'codec'
  | 'inalcanzable'
  | 'otro';

export interface DiagnosticoDeVideo {
  readonly canal: string | null;
  readonly causa: CausaDeVideo;
  readonly codec: string | null;
  /** En palabras y con el remedio; nunca la credencial. */
  readonly frase: string;
}
