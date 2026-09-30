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
