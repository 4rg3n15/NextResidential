import type { Bitacora } from '@ncr/domain-core';
import type { CanalTiempoReal } from '../aplicacion/puertos';

export interface SuscriptorDeCanal {
  /** Escribe un mensaje ya serializado. Devuelve `false` si el destino murió. */
  entregar(tema: string, carga: unknown): boolean;
}

/**
 * Canal de tiempo real **en proceso**, con difusión a los suscriptores SSE.
 *
 * POR QUÉ EXISTE ESTE ADAPTADOR Y NO SOLO EL DE SUPABASE REALTIME.
 * El documento de requisitos señala Supabase Realtime como riesgo de
 * cronograma, y §6 de la ETAPA 06 pide medir su latencia bajo carga «desde ya»
 * con plan de contingencia documentado. La contingencia no puede ser un
 * documento: tiene que ser un adaptador que exista. Este es ese adaptador, y
 * además es el que hace medible el camino completo sin credenciales — que es la
 * única forma de tener una cifra en esta etapa y no en la 10.
 *
 * AISLAMIENTO. Los suscriptores se guardan **por copropiedad**, y `publicar`
 * nunca recorre otro conjunto. No es una optimización: la consola de guardia
 * virtual conmuta entre copropiedades (KPI-35), y un canal con una sola lista
 * global filtraría eventos de una a los operadores de la otra en cuanto alguien
 * olvidara un `if`. Aquí no hay `if` que olvidar.
 */
export class CanalEnProceso implements CanalTiempoReal {
  private readonly porCopropiedad = new Map<string, Set<SuscriptorDeCanal>>();

  constructor(private readonly bitacora?: Bitacora) {}

  /** Devuelve la función de baja: quien se suscribe se da de baja, nadie más. */
  suscribir(copropiedadId: string, suscriptor: SuscriptorDeCanal): () => void {
    const conjunto = this.porCopropiedad.get(copropiedadId) ?? new Set<SuscriptorDeCanal>();
    conjunto.add(suscriptor);
    this.porCopropiedad.set(copropiedadId, conjunto);
    return () => {
      conjunto.delete(suscriptor);
      if (conjunto.size === 0) this.porCopropiedad.delete(copropiedadId);
    };
  }

  async publicar(copropiedadId: string, tema: string, carga: unknown): Promise<number> {
    const conjunto = this.porCopropiedad.get(copropiedadId);
    if (conjunto === undefined) return 0;

    let entregados = 0;
    for (const suscriptor of [...conjunto]) {
      let vivo = false;
      try {
        vivo = suscriptor.entregar(tema, carga);
      } catch (e) {
        this.bitacora?.registrar('aviso', 'suscriptor de tiempo real falló al recibir', {
          copropiedadId,
          tema,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      // Un socket muerto se retira en el acto. Dejarlo dentro haría que
      // `publicar` siguiera contándolo como destinatario y KPI-25 diera verde
      // sobre entregas que no ocurrieron.
      if (vivo) entregados += 1;
      else conjunto.delete(suscriptor);
    }
    if (conjunto.size === 0) this.porCopropiedad.delete(copropiedadId);
    return entregados;
  }

  suscriptoresDe(copropiedadId: string): number {
    return this.porCopropiedad.get(copropiedadId)?.size ?? 0;
  }
}
