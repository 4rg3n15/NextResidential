/**
 * A4 (ETAPA 15-E) · una ESCUCHA activa sobre un equipo que EMITE.
 *
 * Una cámara publica al servidor de alarma y no hace falta escucharla; una
 * terminal o un videoportero emiten por un flujo que la plataforma abre y
 * mantiene (`alertStream` o suscripción, según CAPACIDAD). Lo que sale de esa
 * escucha entra por la MISMA fuente que lo que publica la cámara: un solo
 * camino hacia el ingestor, nunca dos silenciosos.
 *
 * Es del paquete, no del dominio: el dominio sabe de lecturas y accesos, no
 * de transportes.
 */
export type TransporteDeEscucha = 'escucha' | 'suscripcion' | 'ninguna';

export interface EscuchaActiva {
  readonly dispositivoId: string;
  /** `ninguna` cuando no procede escuchar (cámara, simulado): se dice por qué. */
  readonly transporte: TransporteDeEscucha;
  readonly detalle: string;
  /** Cierra el flujo y deja de reintentar. Idempotente. */
  detener(): void;
}
