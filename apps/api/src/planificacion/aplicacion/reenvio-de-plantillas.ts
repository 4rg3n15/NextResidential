import type { Bitacora } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { ReenvioDePlantillasAEquipo } from '../../equipos';
import type { ColaAPedido, TrabajoAPedido } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * R1 (15-N) · EL REENVÍO DE PLANTILLAS AL EQUIPO QUE EMPIEZA A RECIBIRLAS
 *
 * Se ENCOLA en pg-boss (`ncr.reenviar-plantillas`, una por equipo a la vez):
 * sus reintentos y su registro son los del resto de trabajos, y el alta del
 * equipo no espera a que se suban cien fotos. Sin planificador en marcha —la
 * suite, un proceso sólo HTTP, `PLANIFICADOR_HABILITADO=false`— se hace en el
 * proceso, sin esperar, y se dice en la bitácora: no hay «encolado» que nadie
 * vaya a atender.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const COLA_DE_REENVIO = 'ncr.reenviar-plantillas';

export interface EnvioAEquipo {
  ejecutar(
    ctx: ContextoTenant,
    dispositivoId: string,
  ): Promise<{ readonly enviadas: number; readonly fallidas: number; readonly noVigentes: number }>;
}

/** El trabajo corre sin sesión: con la identidad del planificador y SU copropiedad. */
const contextoDeServicio = (actorId: string, copropiedadId: string): ContextoTenant => ({
  usuarioId: actorId,
  rol: 'servicio',
  copropiedadId,
  copropiedadesAtendidas: [copropiedadId],
  mfaVerificado: true,
});

export class ReenvioDePlantillas implements ReenvioDePlantillasAEquipo {
  constructor(
    private readonly cola: ColaAPedido,
    private readonly envio: () => EnvioAEquipo,
    private readonly actorId: string,
    private readonly bitacora: Bitacora,
  ) {}

  /** Lo que atiende la cola. Se registra antes de arrancar el planificador. */
  trabajo(): TrabajoAPedido {
    return {
      nombre: COLA_DE_REENVIO,
      descripcion:
        'R1 · envía al equipo que empieza a recibir plantillas las vigentes que le faltan ' +
        '(RN-09: sólo con consentimiento vigente)',
      ejecutar: async (datos) => {
        const copropiedadId = datos['copropiedadId'];
        const dispositivoId = datos['dispositivoId'];
        if (copropiedadId === undefined || dispositivoId === undefined) {
          return { enviadas: 0, fallidas: 0, noVigentes: 0 };
        }
        const r = await this.envio().ejecutar(
          contextoDeServicio(this.actorId, copropiedadId),
          dispositivoId,
        );
        return { enviadas: r.enviadas, fallidas: r.fallidas, noVigentes: r.noVigentes };
      },
    };
  }

  async encolar(copropiedadId: string, dispositivoId: string): Promise<void> {
    try {
      const encolado = await this.cola.encolar(
        COLA_DE_REENVIO,
        { copropiedadId, dispositivoId },
        `reenvio:${dispositivoId}`,
      );
      if (encolado) {
        this.bitacora.registrar('info', 'reenvío de plantillas encolado', {
          copropiedadId,
          dispositivoId,
        });
        return;
      }
      this.bitacora.registrar('aviso', 'reenvío de plantillas en el proceso: sin planificador', {
        copropiedadId,
        dispositivoId,
      });
      void this.trabajo()
        .ejecutar({ copropiedadId, dispositivoId })
        .catch((error: unknown) => {
          this.bitacora.registrar('error', 'reenvío de plantillas fallido', {
            dispositivoId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    } catch (error) {
      this.bitacora.registrar('error', 'no se pudo encolar el reenvío de plantillas', {
        dispositivoId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
