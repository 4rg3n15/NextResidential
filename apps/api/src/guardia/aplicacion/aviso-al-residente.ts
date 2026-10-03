import { Alerta, errorDominio, esFallo, exito, fallo } from '@ncr/domain-core';
import type { ErrorDominio, GeneradorDeId, Reloj, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { EscalamientoDeAlerta } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * HU-28 · CU-03 flujo alterno 1 — EL AVISO AL RESIDENTE, QUE AHORA LLEGA
 *
 * DT-15N-02 / P-23 (15-R): hasta aquí quedaba la alerta y la constancia, y la
 * respuesta decía «no le llega a la app». Ahora, además, sale por Web Push
 * (ADR-036) a los navegadores suscritos de ESA vivienda y la respuesta dice a
 * cuántos llegó. Cero sigue siendo cero, dicho: sin llaves VAPID o sin
 * aparatos suscritos, la guardia lee que no le llegó y que avise por teléfono.
 *
 * El aviso se intenta DESPUÉS de dejar la alerta: la constancia no depende de
 * que un servicio de push conteste.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** La forma que la guardia necesita del notificador de `eventos` (ver `puertos.ts`). */
export interface AvisoAlTelefono {
  aVivienda(
    copropiedadId: string,
    viviendaId: string,
    titulo: string,
    cuerpo: string,
    destino?: 'notificaciones' | 'historial',
  ): Promise<number>;
}

export interface PedidoDeAviso {
  readonly viviendaId: string;
  readonly dispositivoId?: string | undefined;
  readonly texto: string;
}

/** O3 (15-N) · quién avisó, en la constancia del aviso al residente. */
const QUIEN_AVISA: Readonly<Record<string, string>> = {
  portero: 'el portero',
  operador_central: 'la guardia virtual',
  administrador: 'la administración',
  superadministrador: 'el superadministrador',
};

/** Lo que lee la guardia. Conserva «no le llega a la app del residente» cuando es 0. */
export const detalleDelAviso = (enviados: number): string =>
  enviados > 0
    ? `Aviso registrado en Alertas y enviado a ${String(enviados)} ` +
      `${enviados === 1 ? 'aparato' : 'aparatos'} del residente.`
    : 'Aviso registrado en Alertas, pero no le llega a la app del residente: no tiene avisos ' +
      'activados en ningún aparato (o el servidor no tiene llaves VAPID). Avísele por ' +
      'teléfono o por el citófono';

export class AvisarAlResidente {
  constructor(
    private readonly escalar: EscalamientoDeAlerta,
    private readonly telefono: AvisoAlTelefono,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeId,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    pedido: PedidoDeAviso,
  ): Promise<Resultado<{ readonly enviados: number }, ErrorDominio>> {
    const alerta = Alerta.abrir({
      id: this.ids.nuevo(),
      copropiedadId,
      tipo: 'acceso_dudoso',
      severidad: 'informativa',
      generadaEn: this.reloj.ahora(),
      // O3 (15-N) · a nombre del EQUIPO que se atiende (o de la consola) y del
      // operador que avisa; la vivienda va en la constancia.
      dispositivoId: pedido.dispositivoId ?? 'consola-guardia',
      notas:
        `Aviso al residente de la vivienda ${pedido.viviendaId}, ` +
        `de ${QUIEN_AVISA[ctx.rol] ?? 'un operador'}: ${pedido.texto}`,
    });
    if (esFallo(alerta)) return fallo(errorDominio('DATO_INVALIDO', alerta.error.detalle));
    await this.escalar.ejecutar(alerta.valor, ctx.usuarioId);
    const titulo = `Aviso de ${QUIEN_AVISA[ctx.rol] ?? 'la portería'}`;
    let enviados = 0;
    try {
      enviados = await this.telefono.aVivienda(
        copropiedadId,
        pedido.viviendaId,
        titulo,
        pedido.texto,
      );
    } catch {
      enviados = 0; // la alerta ya quedó: la constancia no depende del push.
    }
    return exito({ enviados });
  }
}
