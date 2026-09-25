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
