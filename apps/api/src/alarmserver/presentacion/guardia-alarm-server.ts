import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Bitacora } from '@ncr/domain-core';
import { BITACORA } from '@ncr/domain-core';
import type { PeticionDeEquipo } from '../../comun/sobre-de-equipo';
import type { EquipoDeclarado } from '../../comun/equipos-de-alarm-server';
import {
  buscarEquipoPorSecreto,
  normalizarOrigen,
  origenAdmisible,
} from '../../comun/equipos-de-alarm-server';

export const EQUIPOS_DE_ALARM_SERVER = Symbol.for('ncr.alarmserver.EquiposDeclarados');

/**
 * Acredita al equipo por **secreto largo y origen**, las dos cosas (H-15-1).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * SE FALLA CERRADO, Y SIN DECIR POR QUÉ
 *
 * Todas las salidas negativas devuelven el mismo 401 con el mismo texto. Decir
 * «el secreto es correcto pero la IP no» le confirma a quien lo intenta que
 * tiene la mitad, y le dice exactamente qué le falta. El motivo real se
 * registra —con el secreto **nunca**, ni truncado: un prefijo es una pista—.
 *
 * Sin equipos declarados el extremo **no acredita a nadie**. No es un caso
 * borde: es la configuración por omisión, y la dirección segura es que un
 * despliegue sin declarar equipos rechace todo en vez de aceptar todo.
 */
@Injectable()
export class GuardiaDeAlarmServer implements CanActivate {
  constructor(
    @Inject(EQUIPOS_DE_ALARM_SERVER) private readonly equipos: readonly EquipoDeclarado[],
    @Inject(BITACORA) private readonly bitacora: Bitacora,
  ) {}

  canActivate(contexto: ExecutionContext): boolean {
    const peticion = contexto.switchToHttp().getRequest<PeticionDeEquipo>();
    const origen = normalizarOrigen(peticion.ip ?? peticion.socket.remoteAddress);

    const presentado = this.secretoPresentado(peticion);
    if (presentado === null) return this.negar('sin secreto presentado', origen);

    const equipo = buscarEquipoPorSecreto(this.equipos, presentado);
    if (equipo === null) return this.negar('secreto desconocido', origen);

    if (!origenAdmisible(equipo, origen)) {
      return this.negar('origen no declarado para el equipo', origen, equipo.dispositivoId);
    }

    peticion.equipoAcreditado = equipo;
    return true;
  }

  /**
   * Dos formas, porque no todos los firmware admiten las dos.
   *
   * `Basic` es la buena: no queda en los registros de ningún intermediario. La
   * ruta es el repliegue para los equipos cuya configuración de «servidor de
   * alarma» solo deja escribir una URL — **y su secreto SÍ acaba en los
   * registros del proxy**, que es parte de H-15-1 y está en la guía.
   */
  private secretoPresentado(peticion: PeticionDeEquipo): string | null {
    const autorizacion = peticion.headers.authorization;
    if (typeof autorizacion === 'string' && /^basic /i.test(autorizacion)) {
      const descifrado = Buffer.from(autorizacion.slice(6).trim(), 'base64').toString('utf8');
      const corte = descifrado.indexOf(':');
      const clave = corte === -1 ? '' : descifrado.slice(corte + 1);
      if (clave !== '') return clave;
    }
    const enRuta = (peticion.params as Record<string, string | undefined>)['secreto'];
    return enRuta === undefined || enRuta === '' ? null : enRuta;
  }

  private negar(motivo: string, origen: string, dispositivoId?: string): never {
    this.bitacora.registrar('aviso', 'publicación de equipo rechazada', {
      motivo,
      origen,
      ...(dispositivoId === undefined ? {} : { dispositivoId }),
      equiposDeclarados: this.equipos.length,
    });
    throw new UnauthorizedException('No acreditado');
  }
}
