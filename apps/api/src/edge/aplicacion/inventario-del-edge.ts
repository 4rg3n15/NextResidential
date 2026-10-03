import type { Bitacora } from '@ncr/domain-core';
import type { SesionDeTunel } from '@ncr/providers';
import type { EquiposDelConjunto } from './alerta-de-desconexion';

/**
 * 15-Q2 · D2 · al abrirse el túnel, la API le dice al Edge qué equipos SIGUEN
 * de alta en su copropiedad (aviso `equipos.vigentes`). El Edge retira de su
 * registro cifrado los que no estén: una baja dada en la consola mientras el
 * túnel estaba caído no deja una credencial huérfana en el conjunto.
 */
export class InventarioDelEdge {
  constructor(
    private readonly equipos: EquiposDelConjunto,
    private readonly bitacora: Bitacora,
  ) {}

  async enviar(sesion: SesionDeTunel, copropiedadId: string): Promise<void> {
    try {
      const vigentes = (await this.equipos.activos())
        .filter((e) => e.copropiedadId === copropiedadId)
        .map((e) => e.dispositivoId);
      sesion.avisar('equipos.vigentes', { vigentes });
    } catch (error) {
      this.bitacora.registrar('aviso', 'no se pudo enviar el inventario al Edge', {
        copropiedadId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
