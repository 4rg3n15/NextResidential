/**
 * Puertos de proveedor. Aquí vive la frontera con el hardware.
 *
 * El dominio expresa INTENCIÓN, nunca protocolo. ADR-01 fija cuál se usa para
 * el audio bidireccional, y esa decisión **no debe poder leerse desde aquí**:
 * el verificador de KPI-11 lo comprueba, y por eso este comentario tampoco lo
 * nombra. Si algún día se cambia de protocolo, esta interfaz no se entera — que
 * es exactamente la prueba de OE-03.
 */
import type { Vigencia } from '../autorizaciones/vigencia';

export interface ResultadoAccionamiento {
  readonly aceptado: boolean;
  readonly latenciaMs: number;
  /**
   * O1 (15-N) · con `aceptado: false`, el equipo CONTESTÓ y dijo que no: por
   * qué, en lenguaje del operador. Ausente, «no aceptado» es que no contestó.
   * Opcional y aditivo: quien no lo lee se comporta como antes.
   */
  readonly rechazo?: string;
}

export interface AccessPointProvider {
  abrir(dispositivoId: string, actorId: string): Promise<ResultadoAccionamiento>;
  estado(dispositivoId: string): Promise<'en_linea' | 'fuera_de_linea' | 'degradado'>;
}

export interface LecturaDePlaca {
  readonly placa: string;
  readonly confianza: number;
  readonly dispositivoId: string;
  readonly ocurridoEn: Date;
}

export interface PlateEventSource {
  suscribir(alLeer: (lectura: LecturaDePlaca) => Promise<void>): Promise<void>;
}

export interface FaceTemplateProvider {
  /**
   * `vigencia` (ETAPA 15-L · A2, autorizada por el cliente el 2026-09-27) es
   * OPCIONAL y ADITIVA: con ella, el equipo caduca la credencial por su cuenta
   * aunque la supresión de RN-11 no llegue; sin ella, el comportamiento es
   * exactamente el de antes. El dominio dice el intervalo; cómo se escribe en
   * el aparato —hora local, zona, tipo de persona— es asunto del adaptador.
   */
  sincronizar(
    dispositivoId: string,
    plantillaId: string,
    plantilla: Uint8Array,
    vigencia?: Vigencia,
  ): Promise<void>;
  suprimir(dispositivoId: string, plantillaId: string): Promise<void>;
}

export type EstadoSesionIntercom = 'abierta' | 'en_espera' | 'cerrada';

export interface IntercomProvider {
  abrirSesion(dispositivoId: string, operadorId: string): Promise<EstadoSesionIntercom>;
  enviarAudio(fragmento: Uint8Array): Promise<void>;
  recibirAudio(): AsyncIterable<Uint8Array>;
  cerrarSesion(motivo: string): Promise<void>;
  estadoSesion(): Promise<EstadoSesionIntercom>;
}
