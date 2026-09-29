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
import { SECRETOS_DE_ALARM_SERVER } from '../../equipos';
import type { SecretosDeAlarmServer } from '../../equipos';

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
 * Sin equipos declarados NI cámaras con secreto propio el extremo **no acredita
 * a nadie**. No es un caso borde: es la configuración por omisión, y la
 * dirección segura es que un despliegue sin equipos rechace todo en vez de
 * aceptar todo.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * C6 (15-M) · DOS FUENTES DE SECRETOS, EN ESTE ORDEN
 *
 *  1. la DECLARACIÓN de `ALARM_SERVER_EQUIPOS` (la cámara que funciona hoy, con
 *     el .env de hoy: se mira primero y no cambia nada para ella);
 *  2. el secreto PROPIO de cada cámara, emitido por la API en el alta y buscado
 *     por su huella en la base (secreto → equipo → copropiedad). Su origen
 *     admisible es el host con el que se registró.
 *
 * Con la segunda fuente cualquier número de cámaras publica sin tocar el .env
 * ni reiniciar. Si la base no contesta, la publicación se niega igual que un
 * secreto desconocido: fallo cerrado, y el motivo real en la bitácora.
 */
@Injectable()
export class GuardiaDeAlarmServer implements CanActivate {
  constructor(
    @Inject(EQUIPOS_DE_ALARM_SERVER) private readonly equipos: readonly EquipoDeclarado[],
    @Inject(BITACORA) private readonly bitacora: Bitacora,
    @Inject(SECRETOS_DE_ALARM_SERVER) private readonly propios: SecretosDeAlarmServer,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const peticion = contexto.switchToHttp().getRequest<PeticionDeEquipo>();
    const origen = normalizarOrigen(peticion.ip ?? peticion.socket.remoteAddress);

    const presentado = this.secretoPresentado(peticion);
    if (presentado === null) return this.negar('sin secreto presentado', origen);

    const equipo =
      buscarEquipoPorSecreto(this.equipos, presentado) ?? (await this.porSecretoPropio(presentado));
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

  /** La segunda fuente. Un fallo al leer la base NO acredita: se registra y se niega. */
  private async porSecretoPropio(presentado: string): Promise<EquipoDeclarado | null> {
    try {
      return await this.propios.equipoPorSecreto(presentado);
    } catch (error) {
      this.bitacora.registrar('error', 'no se pudo consultar los secretos por cámara', {
        detalle: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
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
