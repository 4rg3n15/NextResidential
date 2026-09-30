import { esFallo } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { SincronizarPlantilla } from './casos-de-uso';
import type { RepositorioPlantillas } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * R1 (15-N) · EL EQUIPO QUE EMPIEZA A RECIBIR PLANTILLAS RECIBE LAS QUE LE FALTAN
 *
 * El 29/09 el videoportero se omitió en cada alta («aún no se sabe si admite
 * rostros») hasta que alguien pulsó «Probar conexión». Las visitas creadas
 * antes no le llegaban nunca: la sincronización sólo corre al dar de alta la
 * foto. Aquí, cuando un equipo pasa a «recibe plantillas», se le envían las
 * que no tiene.
 *
 * Nada se decide aquí: `SincronizarPlantilla` vuelve a preguntar por el
 * consentimiento vigente (RN-09) y por la vigencia de la autorización en el
 * instante de empujar. Lo que ya no es vigente se CUENTA y se deja; lo que el
 * equipo no acepta queda escrito por equipo, como en la sincronización de una
 * visita. Idempotente: lo que el equipo ya tiene no se vuelve a pedir.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface ResultadoDeEnvioAEquipo {
  readonly enviadas: number;
  readonly fallidas: number;
  /** Sin consentimiento vigente, autorización vencida o revocada: no se envían. */
  readonly noVigentes: number;
}

export class EnviarPlantillasAEquipo {
  constructor(
    private readonly plantillas: RepositorioPlantillas,
    private readonly sincronizar: SincronizarPlantilla,
    private readonly bitacora: Bitacora,
  ) {}

  async ejecutar(ctx: ContextoTenant, dispositivoId: string): Promise<ResultadoDeEnvioAEquipo> {
    const copropiedadId = ctx.copropiedadId;
    if (copropiedadId === null) return { enviadas: 0, fallidas: 0, noVigentes: 0 };
    const pendientes = await this.plantillas.pendientesParaEquipo(copropiedadId, dispositivoId);
    let enviadas = 0;
    let fallidas = 0;
    let noVigentes = 0;
    for (const plantillaId of pendientes) {
      const r = await this.sincronizar.ejecutar(ctx, { plantillaId, dispositivoId });
      if (!esFallo(r)) {
        enviadas += 1;
        continue;
      }
      if (r.error.codigo !== 'CONFLICTO_DE_CONCURRENCIA') {
        noVigentes += 1;
        continue;
      }
      fallidas += 1;
      await this.plantillas.registrarFallo(
        { copropiedadId, plantillaId, dispositivoId },
        r.error.detalle,
        ctx.usuarioId,
      );
    }
    this.bitacora.registrar('info', 'plantillas enviadas al equipo que empezó a recibirlas', {
      copropiedadId,
      dispositivoId,
      pendientes: pendientes.length,
      enviadas,
      fallidas,
      noVigentes,
    });
    return { enviadas, fallidas, noVigentes };
  }
}
