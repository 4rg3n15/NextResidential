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

export interface AlmacenEvidencia {
  guardar(clave: string, contenido: Uint8Array, tipoMime: string): Promise<string>;
  urlFirmada(clave: string, segundosDeVida: number): Promise<string>;
}
