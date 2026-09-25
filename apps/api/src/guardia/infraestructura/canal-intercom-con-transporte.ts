import type { Bitacora } from '@ncr/domain-core';
import { soporta } from '@ncr/providers';
import type { ProveedorDeEquipos } from '@ncr/providers';
import type { CanalDeIntercom, EstadoDeCanal } from '../aplicacion/puertos';
import { SinTransporteDeAudio, TransporteDeAudioNoDisponible } from '../aplicacion/puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL CANAL DE INTERCOM CON TRANSPORTE · ETAPA 15-E (A1)
 *
 * `CanalIntercomEnProceso` reparte TURNOS con la máquina de estados del
 * dominio: quién habla, quién espera, cuándo caduca. Es correcto y se queda.
 * Lo que no hacía nadie era abrir el canal del APARATO cuando el turno se
 * concedía: `INTERCOM_PROVIDER` no tenía consumidor, así que con el proveedor
 * real la consola decía «tienes la palabra» sobre un equipo que nunca recibió
 * la orden de abrir su canal (ADR-01).
 *
 * Este decorador une las dos cosas y en este orden: **primero el turno, luego
 * el transporte**. Pedir el canal del equipo a quien todavía espera se lo
 * quitaría al que habla; y si el equipo no abre, el turno se suelta antes de
 * informar, porque un turno retenido sobre un canal muerto bloquea al
 * siguiente hasta la caducidad.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * SE DECIDE POR CAPACIDAD, NO POR CLASE DE PROVEEDOR (ADR-019)
 *
 * Si el equipo no declara `audioBidireccional = si` —o no está en el registro,
 * que para el simulado es cualquier dispositivo que no conozca— no se le pide
 * nada: el turno vale, el estado lo dice (`transporte: ninguno`, con motivo) y
 * la consola puede avisar. Así el simulado sigue funcionando igual con
 * cualquier identificador (ADR-03) y el real sólo habla con equipos que
 * declararon poder.
 */
export class CanalIntercomConTransporte implements CanalDeIntercom {
  /** Dispositivos cuyo canal el proveedor tiene abierto, y para quién. */
  private readonly abiertos = new Map<string, string>();
  /** A4 · el códec que el equipo anunció, por clave, mientras el canal esté abierto. */
  private readonly formatos = new Map<string, string | null>();

  constructor(
    private readonly turnos: CanalDeIntercom,
    private readonly proveedor: ProveedorDeEquipos,
    private readonly bitacora: Bitacora,
  ) {}

  private clave(copropiedadId: string, dispositivoId: string): string {
    return `${copropiedadId}|${dispositivoId}`;
  }

  /** El transporte es de QUIEN tiene la palabra: quien espera no tiene audio. */
  private conTransporte(
    estado: EstadoDeCanal,
    clave: string,
    operadorId: string,
    detalleSinTransporte: string | null,
  ): EstadoDeCanal {
    const abierto = this.abiertos.get(clave) === operadorId;
    return {
      ...estado,
      transporte: abierto ? 'equipo' : 'ninguno',
      detalleTransporte: abierto ? null : detalleSinTransporte,
      formatoDeAudio: abierto ? (this.formatos.get(clave) ?? null) : null,
    };
  }

  async pedir(
    copropiedadId: string,
    dispositivoId: string,
    operadorId: string,
  ): Promise<EstadoDeCanal> {
    const clave = this.clave(copropiedadId, dispositivoId);
    const turno = await this.turnos.pedir(copropiedadId, dispositivoId, operadorId);
    if (turno.estado !== 'abierta') {
      return this.conTransporte(
        turno,
        clave,
        operadorId,
        'en espera: el canal del equipo lo tiene otro',
      );
    }
    if (this.abiertos.get(clave) === operadorId) {
      return this.conTransporte(turno, clave, operadorId, null);
    }

    const capacidades = await this.proveedor.capacidadesDe(dispositivoId);
    if (!soporta(capacidades, 'audioBidireccional')) {
      const motivo =
        capacidades.audioBidireccional.estado === 'no'
          ? 'el equipo declara que no tiene audio bidireccional'
          : 'el equipo no está en el registro o no declaró si tiene audio: sin transporte';
      this.bitacora.registrar('aviso', 'turno de intercom concedido SIN transporte de audio', {
        dispositivoId,
        operadorId,
        motivo,
      });
      return this.conTransporte(turno, clave, operadorId, motivo);
    }

    try {
      const sesion = await this.proveedor.abrirSesion(dispositivoId, operadorId);
      if (sesion !== 'abierta') {
        // El proveedor lleva su propia exclusividad (el aparato). Que discrepe
        // del turno es un hecho raro y se registra: no se finge audio.
        throw new TransporteDeAudioNoDisponible(
          dispositivoId,
          `el proveedor devolvió «${sesion}» aunque el turno era de este operador`,
        );
      }
    } catch (error) {
      await this.turnos.soltar(copropiedadId, dispositivoId, operadorId);
      const motivo = error instanceof Error ? error.message : String(error);
      this.bitacora.registrar('aviso', 'el equipo no abrió el canal de audio; turno liberado', {
        dispositivoId,
        operadorId,
        motivo,
      });
      throw error instanceof TransporteDeAudioNoDisponible
        ? error
        : new TransporteDeAudioNoDisponible(dispositivoId, motivo);
    }
    this.abiertos.set(clave, operadorId);
    this.formatos.set(clave, capacidades.audioBidireccional.formato);
    this.bitacora.registrar('info', 'canal de audio del equipo abierto por el proveedor', {
      dispositivoId,
      operadorId,
    });
    return this.conTransporte(turno, clave, operadorId, null);
  }

  async soltar(
    copropiedadId: string,
    dispositivoId: string,
    operadorId: string,
  ): Promise<EstadoDeCanal> {
    const clave = this.clave(copropiedadId, dispositivoId);
    if (this.abiertos.get(clave) === operadorId) {
      this.abiertos.delete(clave);
      this.formatos.delete(clave);
      try {
        await this.proveedor.cerrarSesion('el operador colgó');
      } catch (error) {
        // El cierre en el equipo es lo mejor que se puede hacer; si falla, el
        // aparato lo suelta por su vencimiento. Se registra y no se retiene.
        this.bitacora.registrar('aviso', 'no se pudo cerrar el canal de audio en el equipo', {
          dispositivoId,
          motivo: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const turno = await this.turnos.soltar(copropiedadId, dispositivoId, operadorId);
    return this.conTransporte(turno, clave, operadorId, 'canal cerrado');
  }

  async estado(
    copropiedadId: string,
    dispositivoId: string,
    operadorId: string,
  ): Promise<EstadoDeCanal> {
    const clave = this.clave(copropiedadId, dispositivoId);
    const turno = await this.turnos.estado(copropiedadId, dispositivoId, operadorId);
    if (turno.estado !== 'abierta' && this.abiertos.get(clave) === operadorId) {
      // El turno caducó por inactividad y el equipo seguía con el canal
      // abierto: se cierra ahí también, que es lo que ADR-01 exige del cierre.
      this.abiertos.delete(clave);
      await this.proveedor.cerrarSesion('turno caducado por inactividad').catch(() => undefined);
    }
    return this.conTransporte(
      turno,
      clave,
      operadorId,
      turno.estado === 'abierta' ? 'turno sin transporte de audio' : null,
    );
  }

  /**
   * A4 · el audio es de QUIEN tiene la palabra. Un operador en cola que
   * pudiera escuchar oiría una conversación ajena; uno que pudiera hablar
   * pisaría al titular. Ninguna de las dos es una opción, y por eso aquí no
   * hay «modo escucha».
   */
  private exigirTitular(copropiedadId: string, dispositivoId: string, operadorId: string): void {
    const titular = this.abiertos.get(this.clave(copropiedadId, dispositivoId));
    if (titular === undefined) {
      throw new SinTransporteDeAudio(dispositivoId, 'el canal del equipo no está abierto');
    }
    if (titular !== operadorId) {
      throw new SinTransporteDeAudio(dispositivoId, 'la palabra la tiene otro operador');
    }
  }

  async *recibirAudio(
    copropiedadId: string,
    dispositivoId: string,
    operadorId: string,
  ): AsyncIterable<Uint8Array> {
    this.exigirTitular(copropiedadId, dispositivoId, operadorId);
    for await (const trozo of this.proveedor.recibirAudio()) yield trozo;
  }

  async enviarAudio(
    copropiedadId: string,
    dispositivoId: string,
    operadorId: string,
    fragmento: Uint8Array,
  ): Promise<void> {
    this.exigirTitular(copropiedadId, dispositivoId, operadorId);
    await this.proveedor.enviarAudio(fragmento);
  }
}
