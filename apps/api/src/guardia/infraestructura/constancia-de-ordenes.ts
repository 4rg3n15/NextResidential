import type { Bitacora } from '@ncr/domain-core';
import type { RegistroDeEventosDeEquipo } from '../../eventos';
import type { ConstanciaDeOrdenes, OrdenEjecutada } from '../aplicacion/apertura-manual';

/**
 * A1 (ETAPA 15-L) · la orden manual, en la línea de tiempo de eventos.
 *
 * El título dice quién la dio y cómo contestó el equipo, sin jerga: «el
 * equipo la aceptó», «la rechazó — <motivo del fabricante ya traducido>»,
 * «no respondió». `aceptada` sigue sin afirmar que la puerta se abrió (H-1,
 * H-2): dice que el equipo aceptó la orden.
 */
const QUIEN: Record<string, string> = {
  portero: 'el portero',
  operador_central: 'la guardia virtual',
  administrador: 'la administración',
  superadministrador: 'el superadministrador',
};

const DESENLACE: Record<string, string> = {
  aceptada: 'el equipo la aceptó',
  rechazada: 'el equipo la rechazó',
  inalcanzable: 'el equipo no respondió',
};

export class ConstanciaDeOrdenesEnLineaDeTiempo implements ConstanciaDeOrdenes {
  constructor(
    private readonly registro: Pick<RegistroDeEventosDeEquipo, 'vivo'>,
    private readonly bitacora: Bitacora,
  ) {}

  async registrar(orden: OrdenEjecutada): Promise<void> {
    try {
      const quien = QUIEN[orden.rol] ?? 'un operador';
      const abrir = orden.accion === 'abrir';
      const desenlace =
        orden.resultado === undefined || orden.resultado === null
          ? 'sin respuesta del equipo'
          : (DESENLACE[orden.resultado] ?? orden.resultado);
      const titulo = abrir
        ? `Apertura ordenada por ${quien}: ${desenlace}` +
          (orden.detalle === undefined || orden.detalle === null ? '' : ` — ${orden.detalle}`)
        : `Acceso negado a mano por ${quien}`;
      await this.registro.vivo({
        copropiedadId: orden.copropiedadId,
        dispositivoId: orden.dispositivoId,
        tipo: abrir ? 'apertura_ordenada' : 'negacion_ordenada',
        titulo: titulo.slice(0, 200),
        codigoMayor: null,
        codigoMenor: null,
        origen: 'plataforma',
        enVivo: true,
        ocurridoEn: orden.momento,
        horaDelEquipo: null,
        eventoId: orden.eventoId,
        claveIdempotencia: `${orden.copropiedadId}:${orden.dispositivoId}:plataforma:orden.${orden.id}`,
        carga: {
          ordenId: orden.id,
          operadorId: orden.operadorId,
          rol: orden.rol,
          motivo: orden.motivo,
          resultado: orden.resultado ?? null,
          detalle: orden.detalle ?? null,
        },
        creadoPor: orden.operadorId,
      });
    } catch (error) {
      this.bitacora.registrar('aviso', 'la orden no llegó a la línea de tiempo', {
        ordenId: orden.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
