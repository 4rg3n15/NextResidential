/**
 * Puertos de soporte. El dominio declara lo que necesita; no sabe quién lo da.
 *
 * `Reloj` existe por §2.4: sin él, toda regla con vigencia sería imposible de
 * probar en el minuto exacto del límite, que es justo donde fallan.
 */
export interface Reloj {
  ahora(): Date;
}

export interface GeneradorDeId {
  nuevo(): string;
}

export type NivelBitacora = 'debug' | 'info' | 'aviso' | 'error';

export interface Bitacora {
  registrar(
    nivel: NivelBitacora,
    mensaje: string,
    contexto?: Readonly<Record<string, unknown>>,
  ): void;
}

/**
 * Unidad de trabajo. El dominio no abre transacciones —no conoce la base—,
 * pero la aplicación necesita expresar «esto ocurre entero o no ocurre».
 */
export interface UnidadDeTrabajo {
  ejecutar<T>(operacion: () => Promise<T>): Promise<T>;
}

export interface Notificador {
  notificar(destinatarioId: string, asunto: string, cuerpo: string): Promise<void>;
}

/**
 * D-147 · CORREO SALIENTE CON ADJUNTOS. Puerto pequeño y aparte (§2.3 ISP):
 * `Notificador` lleva un aviso a una persona del sistema y no admite adjuntos;
 * esto manda un fichero a direcciones de correo. Mezclarlos obligaría a uno de
 * los dos adaptadores a implementar lo que no hace.
 *
 * No lanza: el resultado es un dato (§2.4). `sin-configurar` no es un error —
 * el despliegue puede no tener SMTP— y quien llama decide qué constancia deja.
 */
export interface AdjuntoDeCorreo {
  readonly nombre: string;
  readonly tipoMime: string;
  readonly contenido: Uint8Array;
}

export interface CorreoAEnviar {
  readonly destinatarios: readonly string[];
  readonly asunto: string;
  readonly cuerpo: string;
  readonly adjuntos: readonly AdjuntoDeCorreo[];
}

export type ResultadoDeCorreo =
  /**
   * Aceptado por el servidor. `rechazados` son las direcciones que el servidor
   * NO aceptó aunque el envío saliera para las demás: sin esto, un destinatario
   * rechazado constaría como enviado y no se le reintentaría nunca.
   */
  | { readonly estado: 'enviado'; readonly rechazados: readonly string[] }
  | { readonly estado: 'sin-configurar' }
  /** El motivo, sin secretos ni contenido del correo. */
  | { readonly estado: 'error'; readonly detalle: string };

export interface CorreoSaliente {
  /** `false` sin SMTP declarado: quien llama no prepara un correo que no saldrá. */
  readonly configurado: boolean;
  enviar(correo: CorreoAEnviar): Promise<ResultadoDeCorreo>;
}

export interface AlmacenEvidencia {
  guardar(clave: string, contenido: Uint8Array, tipoMime: string): Promise<string>;
  urlFirmada(clave: string, segundosDeVida: number): Promise<string>;
}
