import { NotFoundException } from '@nestjs/common';
import type { Bitacora } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { RegistroDeAuditoria } from '../../comun/auditoria';
import type { RepositorioDeEquipos } from '../aplicacion/puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL EQUIPO TAMBIÉN TIENE COPROPIEDAD · ETAPA 15-L (fuga del Bloque 0.4)
 *
 * `Aislamiento.exigirAlcance` comprueba que quien pide alcance la copropiedad
 * de la RUTA. Nada comprobaba que el EQUIPO que viaja en la petición sea de esa
 * copropiedad. Con eso, un operador de A que conoce el id de un equipo de B
 * podía, desde `/copropiedades/A/…`:
 *
 *  · ver su video en vivo (WHEP) — la fuga que encontró el Bloque 0;
 *  · abrir o bloquear su puerta, y abrir su canal de audio;
 *  · encolar su reconfiguración o su reinicio;
 *  · empujar una plantilla biométrica de A a una terminal de B.
 *
 * Es el riesgo número uno del proyecto (§2.7.6) por otra puerta. La respuesta
 * es la misma que la del aislamiento: **404**, no 403 —un 403 confirma que el
 * equipo existe—, y constancia en `auditoria_seguridad`. La fuente de verdad
 * es la tabla `dispositivos`, la que la consola escribe.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const ALCANCE_DE_EQUIPOS = Symbol.for('ncr.equipos.AlcanceDeEquipos');

export class AlcanceDeEquipos {
  constructor(
    private readonly equipos: Pick<RepositorioDeEquipos, 'copropiedadDeActivo'>,
    private readonly auditoria: RegistroDeAuditoria,
    private readonly bitacora: Bitacora,
  ) {}

  async exigir(
    ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
    recurso: string,
  ): Promise<void> {
    if ((await this.equipos.copropiedadDeActivo(dispositivoId)) === copropiedadId) return;
    this.bitacora.registrar('aviso', 'equipo de otra copropiedad (o inexistente) bloqueado', {
      usuarioId: ctx.usuarioId,
      rol: ctx.rol,
      copropiedadSolicitada: copropiedadId,
      dispositivoId,
      recurso,
    });
    await this.auditoria.registrarAccesoCruzado({
      usuarioId: ctx.usuarioId,
      rol: ctx.rol,
      copropiedadSolicitada: copropiedadId,
      recurso: `${recurso} · equipo ${dispositivoId}`,
    });
    throw new NotFoundException('Recurso no encontrado');
  }
}
