/**
 * Puertos de proveedor. Aquí vive la frontera con el hardware.
 *
 * El dominio expresa INTENCIÓN, nunca protocolo. ADR-01 fija cuál se usa para
 * el audio bidireccional, y esa decisión **no debe poder leerse desde aquí**:
 * el verificador de KPI-11 lo comprueba, y por eso este comentario tampoco lo
 * nombra. Si algún día se cambia de protocolo, esta interfaz no se entera — que
 * es exactamente la prueba de OE-03.
 */
export interface ResultadoAccionamiento {
  readonly aceptado: boolean;
  readonly latenciaMs: number;
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
  sincronizar(dispositivoId: string, plantillaId: string, plantilla: Uint8Array): Promise<void>;
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
