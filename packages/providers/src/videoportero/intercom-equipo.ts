import {
  TIMEOUT_DE_CANAL_SEGUNDOS,
  canalLibre,
  conVencimientosAplicados,
  esExito,
  renovarActividad,
  solicitarCanal,
  soltarCanal,
} from '@ncr/domain-core';
import type {
  EstadoDelCanal,
  EstadoSesionIntercom,
  IntercomProvider,
  Reloj,
} from '@ncr/domain-core';
import { ClienteDeEquipo } from '../equipo/cliente';
import type { OpcionesDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';

/**
 * AUDIO BIDIRECCIONAL CONTRA EL EQUIPO · ADR-01.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ESTÁ ESCRITO Y **NO ESTÁ HABILITADO**. LAS DOS COSAS A LA VEZ
 *
 * El canal del equipo está **deshabilitado de fábrica** en el aparato: se midió
 * el 18/09/2026, junto con que lo soporta con G.711 µ-law. Habilitarlo es un
 * cambio de configuración **del equipo**, lo hace el usuario, y el
 * procedimiento está en la guía de validación. Este adaptador no lo habilita ni
 * lo intenta: un adaptador que encendiera por su cuenta una vía de audio hacia
 * la calle sería una decisión de seguridad tomada por el código.
 *
 * `disponible()` lo dice sin rodeos, y `abrirSesion` falla con un motivo que
 * distingue «el equipo no puede» de «el canal está ocupado». Son dos cosas
 * distintas y el operador las resuelve distinto.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA EXCLUSIVIDAD NO LA APLICA EL EQUIPO: LA APLICAMOS NOSOTROS
 *
 * Un canal de audio suele ser exclusivo en el aparato, pero su forma de
 * negarlo es un error de protocolo, no una cola. La máquina de estados del
 * dominio —la MISMA que usa el simulado— reparte el turno, encola y libera por
 * caducidad, así que lo que el operador aprendió sin hardware sigue valiendo
 * con hardware. Lo que cambia es el transporte, no las reglas.
 */

export class CanalDeEquipoNoHabilitado extends Error {
  constructor(readonly dispositivoId: string) {
    super(
      `El canal de audio del equipo ${dispositivoId} está deshabilitado. Es un ajuste DEL ` +
        'EQUIPO y lo activa un operador: docs/guias/VALIDACION_HIKVISION_EN_SITIO.md §8.3',
    );
    this.name = 'CanalDeEquipoNoHabilitado';
  }
}

export interface OpcionesDeIntercom extends OpcionesDeEquipo {
  readonly reloj: Reloj;
  /**
   * Se **declara**, no se descubre. Mientras sea `false`, este adaptador no
   * emite una sola petición hacia el canal de audio del equipo.
   */
  readonly canalHabilitado: boolean;
  readonly margenSegundos?: number;
}

export class IntercomDeEquipo implements IntercomProvider {
  private readonly cliente: ClienteDeEquipo;
  private readonly canales = new Map<string, EstadoDelCanal>();
  private readonly ultimoDispositivo = new Map<string, string>();
  private abierto: string | null = null;

  constructor(private readonly opciones: OpcionesDeIntercom) {
    this.cliente = new ClienteDeEquipo(opciones);
  }

  /** `false` mientras el equipo no tenga el canal activado. */
  disponible(): boolean {
    return this.opciones.canalHabilitado;
  }

  private estado(dispositivoId: string): EstadoDelCanal {
    return this.canales.get(dispositivoId) ?? canalLibre(dispositivoId);
  }

  async abrirSesion(dispositivoId: string, operadorId: string): Promise<EstadoSesionIntercom> {
    if (!this.disponible()) throw new CanalDeEquipoNoHabilitado(dispositivoId);

    const ahora = this.opciones.reloj.ahora();
    const vigente = conVencimientosAplicados(
      this.estado(dispositivoId),
      ahora,
      this.opciones.margenSegundos ?? TIMEOUT_DE_CANAL_SEGUNDOS,
    );
    const solicitud = solicitarCanal(vigente, operadorId, ahora);
    this.canales.set(dispositivoId, solicitud.estado);
    if (solicitud.resultado === 'en_espera') {
      // Ocupado: queda en la cola. NO se toca el equipo, porque abrir el canal
      // del aparato para quien está esperando se lo quitaría al que habla.
      return 'en_espera';
    }

    this.ultimoDispositivo.set(operadorId, dispositivoId);

    const ruta = rutaPara('abrir el canal de audio bidireccional', 'videoportero');
    const respuesta = await this.cliente.pedir(ruta.metodo, ruta.ruta);
    if (!respuesta.ok) {
      // El equipo dijo que no: se suelta el turno en vez de dejar al operador
      // con un canal que cree tener. Un turno retenido sobre un canal muerto
      // bloquea al siguiente hasta que caduque.
      this.canales.set(dispositivoId, soltarCanal(solicitud.estado, operadorId, ahora).estado);
      throw new Error(`El equipo no abrió el canal de audio (HTTP ${String(respuesta.estado)})`);
    }
    this.abierto = dispositivoId;
    return 'abierta';
  }

  /**
   * El audio **no se implementa aquí, y se dice**.
   *
   * El transporte del flujo es un socket de audio sostenido con su códec y su
   * cadencia, y escribirlo contra un canal que nadie ha podido abrir ni una vez
   * sería escribir contra una suposición: qué códec negocia ESTE firmware, si
   * es semiduplex, y con qué tamaño de paquete, son medidas que no existen.
   * Lanzar es honesto; devolver silencio sería simular que funciona.
   */
  async enviarAudio(_fragmento: Uint8Array): Promise<void> {
    throw new Error(
      'El transporte de audio del equipo no está implementado: falta medir códec, cadencia y ' +
        'duplex contra el aparato (guía §8.3). Hasta entonces, la consola usa el simulado',
    );
  }

  recibirAudio(): AsyncIterable<Uint8Array> {
    throw new Error(
      'El transporte de audio del equipo no está implementado: falta medir códec, cadencia y ' +
        'duplex contra el aparato (guía §8.3). Hasta entonces, la consola usa el simulado',
    );
  }

  async cerrarSesion(motivo: string): Promise<void> {
    const dispositivoId = this.abierto;
    this.abierto = null;
    if (dispositivoId === null) return;

    const ahora = this.opciones.reloj.ahora();
    const titular = this.estado(dispositivoId).titular;
    if (titular !== null) {
      this.canales.set(
        dispositivoId,
        soltarCanal(this.estado(dispositivoId), titular.operadorId, ahora).estado,
      );
    }

    // El cierre se manda SIEMPRE, aunque el turno ya se hubiera soltado por
    // caducidad: un canal que el equipo cree abierto no admite al siguiente, y
    // ese estado sobrevive a nuestro proceso.
    const ruta = rutaPara('cerrar el canal de audio bidireccional', 'videoportero');
    try {
      await this.cliente.pedir(ruta.metodo, ruta.ruta);
    } catch {
      // Si no se pudo cerrar, el equipo lo soltará por su propio vencimiento.
      // No se reintenta aquí: `motivo` ya está en el histórico y encadenar
      // reintentos retrasaría la respuesta al operador que está colgando.
      void motivo;
    }
  }

  async estadoSesion(): Promise<EstadoSesionIntercom> {
    if (this.abierto === null) return 'cerrada';
    const estado = this.estado(this.abierto);
    return estado.titular === null ? 'cerrada' : 'abierta';
  }

  /**
   * Renueva la actividad del turno para que no caduque mientras se habla.
   *
   * Devuelve `false` cuando quien renueva **no** es el titular: que un operador
   * en cola pudiera renovar el turno ajeno dejaría el canal retenido para
   * siempre. El dominio ya lo impide; aquí sólo se respeta su respuesta.
   */
  renovar(dispositivoId: string, operadorId: string): boolean {
    const resultado = renovarActividad(
      this.estado(dispositivoId),
      operadorId,
      this.opciones.reloj.ahora(),
    );
    if (!esExito(resultado)) return false;
    this.canales.set(dispositivoId, resultado.valor);
    return true;
  }
}
