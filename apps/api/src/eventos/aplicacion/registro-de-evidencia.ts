/**
 * ═════════════════════════════════════════════════════════════════════════════
 * REGISTRO DE EVIDENCIA · ETAPA 15-I (hallazgo H-15I-07, del ensayo previo)
 *
 * La cámara guardaba la foto en el almacén y pasaba su RUTA como identificador
 * de evidencia del evento. En memoria funcionaba; contra PostgreSQL,
 * `eventos.evidencia_id` es un UUID que referencia una fila de `evidencias`
 * —la tabla de solo inserción con hash y tamaño (ADR-005)—, y el INSERT del
 * evento fallaba con TODA lectura de placa con foto: ningún acceso por placa
 * quedaba registrado (RN-02). El ensayo simulado contra base real lo destapó.
 *
 * Este puerto cierra el hueco sin tocar el agregado ni el motor: quien guarda la
 * foto la REGISTRA (fila con su SHA-256 y su tamaño) y entrega la referencia que
 * el evento lleva; quien sirve la URL firmada la RESUELVE a su ruta. Sin base,
 * la referencia sigue siendo la propia ruta, como hasta ahora.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const REGISTRO_DE_EVIDENCIA = Symbol.for('ncr.puerto.RegistroDeEvidencia');

export type TipoDeEvidencia = 'foto_completa' | 'recorte_placa' | 'captura_rostro';

export interface EvidenciaGuardada {
  readonly copropiedadId: string;
  /** La ruta con la que el almacén la guardó. */
  readonly clave: string;
  readonly tipo: TipoDeEvidencia;
  readonly contenido: Uint8Array;
  readonly tipoMime: string;
}

export interface RegistroDeEvidencia {
  /** Devuelve la referencia que el evento lleva en `evidenciaId`. */
  registrar(evidencia: EvidenciaGuardada): Promise<string>;
  /** La ruta en el almacén de una referencia; `null` si no es de esa copropiedad. */
  rutaDe(copropiedadId: string, referencia: string): Promise<string | null>;
}

/** Sin base: la referencia ES la ruta (el comportamiento de siempre). */
export const registroSinBase: RegistroDeEvidencia = {
  registrar: async (e) => e.clave,
  rutaDe: async (_copropiedadId, referencia) => referencia,
};
