import { Injectable } from '@nestjs/common';
import {
  TIMEOUT_DE_CANAL_SEGUNDOS,
  canalLibre,
  conVencimientosAplicados,
  esperaDe,
  solicitarCanal,
  soltarCanal,
} from '@ncr/domain-core';
import type { EstadoDelCanal, Reloj } from '@ncr/domain-core';
import type { CanalDeIntercom, EstadoDeCanal } from '../aplicacion/puertos';
import { SinTransporteDeAudio } from '../aplicacion/puertos';

/**
 * Canal de intercom en el proceso, sobre la máquina de estados del dominio.
 *
 * **La clave incluye la copropiedad.** Sin ella, dos copropiedades con el mismo
 * identificador de dispositivo compartirían canal, y un operador de central que
 * conmuta entre proyectos —KPI-35— vería el estado del canal de otra. Es una
 * fuga por la puerta de atrás: no viaja ningún dato del tenant ajeno, pero sí
 * la información de que alguien está hablando con esa puerta.
 *
 * En proceso y no en base a propósito: el estado del canal es efímero por
 * definición —caduca en 90 segundos— y persistirlo obligaría a purgarlo. Lo que
 * NO es efímero es lo que se decidió mientras se hablaba, y eso ya son eventos
 * y órdenes, que sí se guardan.
 *
 * Con varias instancias detrás de un balanceador harían falta dos operadores en
 * instancias distintas para que la exclusividad se rompiera. Queda declarado
 * como **D-69**: la salida es el mismo estado en PostgreSQL con la misma
 * máquina, y por eso la máquina vive en el dominio y no aquí.
 */
@Injectable()
export class CanalIntercomEnProceso implements CanalDeIntercom {
  private readonly canales = new Map<string, EstadoDelCanal>();

  constructor(
    private readonly reloj: Reloj,
    private readonly margenSegundos: number = TIMEOUT_DE_CANAL_SEGUNDOS,
  ) {}

  private clave(copropiedadId: string, dispositivoId: string): string {
    return `${copropiedadId}|${dispositivoId}`;
  }

  private leer(copropiedadId: string, dispositivoId: string): EstadoDelCanal {
    return this.canales.get(this.clave(copropiedadId, dispositivoId)) ?? canalLibre(dispositivoId);
  }

  private aDto(estado: EstadoDelCanal, operadorId: string): EstadoDeCanal {
    const ahora = this.reloj.ahora();
    const vigente = conVencimientosAplicados(estado, ahora, this.margenSegundos);
    const espera = esperaDe(vigente, operadorId, ahora);
    const puesto = vigente.cola.findIndex((e) => e.operadorId === operadorId);
    return {
      dispositivoId: vigente.dispositivoId,
      estado:
        vigente.titular?.operadorId === operadorId
          ? 'abierta'
          : espera === null
            ? 'cerrada'
            : 'en_espera',
      porDelante: puesto < 0 ? 0 : puesto + 1,
      titular: vigente.titular?.operadorId ?? null,
      timeoutSegundos: this.margenSegundos,
      // El canal en proceso reparte TURNOS; el transporte lo pone quien lo
      // decore (`CanalIntercomConTransporte`). Solo, no hay audio y lo dice.
      transporte: 'ninguno',
      formatoDeAudio: null,
      detalleTransporte: 'canal sin transporte de audio: sólo exclusividad',
    };
  }

  async pedir(
    copropiedadId: string,
    dispositivoId: string,
    operadorId: string,
  ): Promise<EstadoDeCanal> {
    const r = solicitarCanal(
      this.leer(copropiedadId, dispositivoId),
      operadorId,
      this.reloj.ahora(),
      this.margenSegundos,
    );
    this.canales.set(this.clave(copropiedadId, dispositivoId), r.estado);
    return this.aDto(r.estado, operadorId);
  }

  async soltar(
    copropiedadId: string,
    dispositivoId: string,
    operadorId: string,
  ): Promise<EstadoDeCanal> {
    const cierre = soltarCanal(
      this.leer(copropiedadId, dispositivoId),
      operadorId,
      this.reloj.ahora(),
      this.margenSegundos,
    );
    this.canales.set(this.clave(copropiedadId, dispositivoId), cierre.estado);
    return this.aDto(cierre.estado, operadorId);
  }

  async estado(
    copropiedadId: string,
    dispositivoId: string,
    operadorId: string,
  ): Promise<EstadoDeCanal> {
    const vigente = conVencimientosAplicados(
      this.leer(copropiedadId, dispositivoId),
      this.reloj.ahora(),
      this.margenSegundos,
    );
    this.canales.set(this.clave(copropiedadId, dispositivoId), vigente);
    return this.aDto(vigente, operadorId);
  }

  /** En proceso no hay equipo: el turno existe, el audio no. */
  recibirAudio(_c: string, dispositivoId: string): AsyncIterable<Uint8Array> {
    const error = new SinTransporteDeAudio(
      dispositivoId,
      'los turnos en proceso no tienen transporte',
    );
    return {
      [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }),
    };
  }

  async enviarAudio(_c: string, dispositivoId: string): Promise<void> {
    throw new SinTransporteDeAudio(dispositivoId, 'los turnos en proceso no tienen transporte');
  }
}
