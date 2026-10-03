import { errorDominio, exito, fallo } from '@ncr/domain-core';
import type { Bitacora, ErrorDominio, Reloj, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { EstadoDeAccionamiento } from './apertura-manual';
import { motivoValido } from './apertura-manual';
import type {
  AccionadorDeModo,
  AjustesDePuertas,
  ModoTemporal,
  NuevaOrdenDeModo,
  RegistroDeModosDePuerta,
} from './modo-de-puerta';
import { ROLES_QUE_FIJAN_MODO, duracionDeLaOrden } from './modo-de-puerta';

export interface PedidoDeModo {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  readonly numeroDePuerta: number;
  readonly modo: ModoTemporal;
  readonly motivo: unknown;
  readonly minutos?: number | undefined;
}

export interface OrdenDeModoCumplida {
  readonly id: string;
  readonly revierteEn: Date | null;
  readonly resultado: EstadoDeAccionamiento;
  readonly detalle: string | null;
}

const MOTIVO_POR_OMISION_AL_REVERTIR = 'Revertido antes de tiempo desde la consola';

/**
 * 15-R · P-25 · C1/C2/C5 · dejar una puerta libre o bloqueada, y revertirla.
 *
 * Cada orden se ESCRIBE antes de accionar (la fila es el rastro: si la API cae
 * entre la orden y el equipo, la orden existe y el barrido la revertirá) y se
 * anota después con lo que dijo el equipo. Lo mismo vale para la reversión
 * manual y la automática: tres orígenes, un solo camino.
 */
export class FijarModoDePuerta {
  constructor(
    private readonly registro: RegistroDeModosDePuerta,
    private readonly ajustes: AjustesDePuertas,
    private readonly accionador: AccionadorDeModo,
    private readonly reloj: Reloj,
    private readonly bitacora: Bitacora,
  ) {}

  async fijar(
    ctx: ContextoTenant,
    pedido: PedidoDeModo,
  ): Promise<Resultado<OrdenDeModoCumplida, ErrorDominio>> {
    const permitido = this.exigirRol(ctx);
    if (!permitido.ok) return permitido;
    const motivo = motivoValido(pedido.motivo);
    if (!motivo.ok) return motivo;
    const duracion = duracionDeLaOrden(
      pedido.minutos,
      await this.ajustes.duracionMaxima(pedido.copropiedadId),
    );
    if (!duracion.ok) return duracion;
    const ahora = this.reloj.ahora();
    return exito(
      await this.cumplir({
        ...pedido,
        motivo: motivo.valor,
        origen: 'consola',
        operadorId: ctx.usuarioId,
        rol: ctx.rol,
        ordenadaEn: ahora,
        revierteEn: new Date(ahora.getTime() + duracion.valor * 60_000),
      }),
    );
  }

  /** «Revertir ahora» desde la consola: el mismo camino, con su motivo. */
  async revertirAhora(
    ctx: ContextoTenant,
    puerta: Omit<PedidoDeModo, 'modo' | 'minutos'>,
  ): Promise<Resultado<OrdenDeModoCumplida, ErrorDominio>> {
    const permitido = this.exigirRol(ctx);
    if (!permitido.ok) return permitido;
    const crudo =
      typeof puerta.motivo === 'string' && puerta.motivo.trim() !== ''
        ? puerta.motivo
        : MOTIVO_POR_OMISION_AL_REVERTIR;
    const motivo = motivoValido(crudo);
    if (!motivo.ok) return motivo;
    return exito(
      await this.cumplir({
        ...puerta,
        modo: 'normal',
        motivo: motivo.valor,
        origen: 'revertir_ahora',
        operadorId: ctx.usuarioId,
        rol: ctx.rol,
        ordenadaEn: this.reloj.ahora(),
        revierteEn: null,
      }),
    );
  }

  /** El barrido: la orden automática de volver a normal, a nombre del servicio. */
  async revertirVencida(
    puerta: { copropiedadId: string; dispositivoId: string; numeroDePuerta: number },
    actorId: string,
  ): Promise<OrdenDeModoCumplida> {
    return this.cumplir({
      ...puerta,
      modo: 'normal',
      origen: 'reversion_automatica',
      motivo: 'Reversión automática: venció el plazo de la puerta libre o bloqueada',
      operadorId: actorId,
      rol: 'servicio',
      ordenadaEn: this.reloj.ahora(),
      revierteEn: null,
    });
  }

  private exigirRol(ctx: ContextoTenant): Resultado<true, ErrorDominio> {
    return ROLES_QUE_FIJAN_MODO.includes(ctx.rol)
      ? exito(true)
      : fallo(
          errorDominio(
            'OPERACION_NO_PERMITIDA',
            'Sólo la administración deja una puerta libre o bloqueada (P-25)',
          ),
        );
  }

  private async cumplir(orden: NuevaOrdenDeModo): Promise<OrdenDeModoCumplida> {
    const id = await this.registro.registrar(orden);
    let r: { estado: EstadoDeAccionamiento; detalle: string | null };
    try {
      r = await this.accionador.fijar(
        orden.dispositivoId,
        orden.numeroDePuerta,
        orden.modo,
        orden.operadorId,
      );
    } catch (error) {
      r = { estado: 'inalcanzable', detalle: error instanceof Error ? error.message : 'fallo' };
    }
    await this.registro.anotarResultado(orden.copropiedadId, id, r.estado, r.detalle);
    this.bitacora.registrar(r.estado === 'aceptada' ? 'info' : 'aviso', 'orden de modo de puerta', {
      copropiedadId: orden.copropiedadId,
      dispositivoId: orden.dispositivoId,
      numeroDePuerta: orden.numeroDePuerta,
      modo: orden.modo,
      origen: orden.origen,
      operadorId: orden.operadorId,
      estado: r.estado,
      revierteEn: orden.revierteEn?.toISOString() ?? null,
    });
    return { id, revierteEn: orden.revierteEn, resultado: r.estado, detalle: r.detalle };
  }
}
