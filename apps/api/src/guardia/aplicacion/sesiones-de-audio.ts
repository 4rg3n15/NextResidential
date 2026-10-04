import type { Bitacora } from '@ncr/domain-core';
import type { ParticipantesDeConversacion } from './conversacion-de-audio';
import type { CanalDeIntercom, EstadoDeCanal } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-S1 · A1 · EL TURNO DE AUDIO SE SUELTA POR SESIÓN, NO POR EQUIPO Y OPERADOR
 *
 * La carrera de la 15-P: el operador cuelga y vuelve a llamar enseguida. El
 * turno nuevo es del MISMO equipo y del MISMO operador, y la conversación vieja
 * termina DESPUÉS —su WebSocket se cierra tarde, o espera a que el equipo
 * acepte la última trama—. Su `soltar(copropiedad, equipo, operador)` se
 * llevaba el turno nuevo y cerraba el canal en el equipo.
 *
 * Una SESIÓN es cada concesión del canal del equipo a un operador: nace cuando
 * `pedir` le deja la palabra con el canal del equipo abierto, y acaba cuando se
 * suelta o cuando el estado dice que ya no la tiene (caducidad, relevo). Cada
 * conversación se ata a la sesión vigente al aceptarse su WebSocket, y su
 * `soltar` suelta ESA o nada. Lo demás pasa tal cual: la exclusividad sigue en
 * la máquina del dominio y el transporte en `CanalIntercomConTransporte`.
 *
 * En el proceso, como los turnos (D-69): con varias instancias, las sesiones
 * tendrían que vivir donde vivan ellos.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const claveDe = (copropiedadId: string, dispositivoId: string, operadorId: string): string =>
  `${copropiedadId}|${dispositivoId}|${operadorId}`;

/** Con la palabra Y el canal del equipo abierto: lo único que admite una conversación. */
const conLaPalabra = (estado: EstadoDeCanal): boolean =>
  estado.estado === 'abierta' && estado.transporte === 'equipo';

export class CanalConSesiones implements CanalDeIntercom {
  /** La sesión vigente de cada operador en cada equipo de cada copropiedad. */
  private readonly vigentes = new Map<string, number>();
  private ultima = 0;

  constructor(
    private readonly canal: CanalDeIntercom,
    private readonly bitacora: Bitacora,
  ) {}

  async pedir(
    copropiedadId: string,
    dispositivoId: string,
    operadorId: string,
  ): Promise<EstadoDeCanal> {
    const estado = await this.canal.pedir(copropiedadId, dispositivoId, operadorId);
    const clave = claveDe(copropiedadId, dispositivoId, operadorId);
    // Pedirlo otra vez con la palabra NO abre otra sesión: es la misma.
    if (!conLaPalabra(estado)) this.vigentes.delete(clave);
    else if (!this.vigentes.has(clave)) this.vigentes.set(clave, (this.ultima += 1));
    return estado;
  }

  soltar(copropiedadId: string, dispositivoId: string, operadorId: string): Promise<EstadoDeCanal> {
    this.vigentes.delete(claveDe(copropiedadId, dispositivoId, operadorId));
    return this.canal.soltar(copropiedadId, dispositivoId, operadorId);
  }

  async estado(
    copropiedadId: string,
    dispositivoId: string,
    operadorId: string,
  ): Promise<EstadoDeCanal> {
    const estado = await this.canal.estado(copropiedadId, dispositivoId, operadorId);
    if (!conLaPalabra(estado))
      this.vigentes.delete(claveDe(copropiedadId, dispositivoId, operadorId));
    return estado;
  }

  async renovar(
    copropiedadId: string,
    dispositivoId: string,
    operadorId: string,
  ): Promise<boolean> {
    const sigue = await this.canal.renovar(copropiedadId, dispositivoId, operadorId);
    if (!sigue) this.vigentes.delete(claveDe(copropiedadId, dispositivoId, operadorId));
    return sigue;
  }

  recibirAudio(
    copropiedadId: string,
    dispositivoId: string,
    operadorId: string,
  ): AsyncIterable<Uint8Array> {
    return this.canal.recibirAudio(copropiedadId, dispositivoId, operadorId);
  }

  enviarAudio(
    copropiedadId: string,
    dispositivoId: string,
    operadorId: string,
    fragmento: Uint8Array,
  ): Promise<void> {
    return this.canal.enviarAudio(copropiedadId, dispositivoId, operadorId, fragmento);
  }

  /**
   * El canal que ve UNA conversación: el mismo, salvo `soltar`, que suelta la
   * sesión vigente cuando se creó —la de su WebSocket— o, si ya acabó, nada.
   */
  deLaConversacion(p: ParticipantesDeConversacion): CanalDeIntercom {
    const clave = claveDe(p.copropiedadId, p.dispositivoId, p.operadorId);
    const suya = this.vigentes.get(clave);
    return {
      pedir: (c, d, o) => this.pedir(c, d, o),
      estado: (c, d, o) => this.estado(c, d, o),
      renovar: (c, d, o) => this.renovar(c, d, o),
      recibirAudio: (c, d, o) => this.recibirAudio(c, d, o),
      enviarAudio: (c, d, o, fragmento) => this.enviarAudio(c, d, o, fragmento),
      soltar: (c, d, o) => {
        if (suya !== undefined && this.vigentes.get(clave) === suya) return this.soltar(c, d, o);
        this.bitacora.registrar('info', 'conversación terminada sin soltar: su sesión ya acabó', {
          dispositivoId: d,
          operadorId: o,
        });
        return this.estado(c, d, o);
      },
    };
  }
}
