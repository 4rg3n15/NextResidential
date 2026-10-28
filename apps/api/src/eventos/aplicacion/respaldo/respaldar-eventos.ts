import type { Bitacora, Reloj } from '@ncr/domain-core';
import { DIAS_DE_RECUPERACION, diasAnteriores, diasSinRespaldo } from './dias';
import type { EnviarRespaldos } from './enviar-respaldos';
import type { GenerarRespaldo } from './generar-respaldo';
import type { RepositorioDeRespaldos } from './puertos';

/**
 * D-147 · EL RESPALDO DIARIO DE UNA COPROPIEDAD
 *
 * Lo invoca el trabajo programado `ncr.respaldar-eventos-del-dia` a las 00:15
 * de Bogotá, y la superadministración a mano. Idempotente, como todo trabajo
 * programado (pg-boss puede reintentar):
 *
 *   1. Genera los días que falten de los últimos 31 —el de ayer, y los que se
 *      perdieron si el servidor estuvo apagado—, del más antiguo al más
 *      reciente. Un día con respaldo no se regenera.
 *   2. Envía los pendientes de esos 31 días, como mucho 7 correos, del más
 *      antiguo al más reciente; un envío fallido se reintenta aquí.
 *
 * Un día que no se puede generar no detiene a los demás: se registra y sigue,
 * igual que una copropiedad que falla no detiene a las otras (planificación).
 */
export interface ParteDelRespaldo {
  readonly generados: number;
  readonly fallidosAlGenerar: number;
  readonly enviados: number;
  readonly fallidosAlEnviar: number;
  readonly sinConfigurar: number;
}

const VACIO: ParteDelRespaldo = {
  generados: 0,
  fallidosAlGenerar: 0,
  enviados: 0,
  fallidosAlEnviar: 0,
  sinConfigurar: 0,
};

export class RespaldarEventos {
  /**
   * Las ejecuciones en curso, por copropiedad. Si la programada y una a mano
   * coinciden, o dos a mano, la segunda espera a la primera en vez de correr a
   * la vez: las dos verían el mismo destinatario pendiente y enviarían dos
   * veces antes de que ninguna anotara su intento. Al terminar la primera, la
   * segunda ya no encuentra nada que hacer.
   *
   * Riesgo residual, declarado: el cerrojo es del proceso. Con dos instancias
   * de la API a la vez, una ejecución a mano en una y la programada en otra en
   * el mismo instante pueden duplicar un correo; nunca un respaldo, que lo
   * impide la clave única de la base. El despliegue es de una instancia.
   */
  private readonly enCurso = new Map<string, Promise<ParteDelRespaldo>>();

  constructor(
    private readonly respaldos: RepositorioDeRespaldos,
    private readonly generar: GenerarRespaldo,
    private readonly enviar: EnviarRespaldos,
    private readonly reloj: Reloj,
    private readonly bitacora: Bitacora,
  ) {}

  async ejecutar(copropiedadId: string, actorId: string): Promise<ParteDelRespaldo> {
    const anterior = this.enCurso.get(copropiedadId) ?? Promise.resolve(VACIO);
    const esta = anterior.catch(() => VACIO).then(() => this.respaldar(copropiedadId, actorId));
    this.enCurso.set(copropiedadId, esta);
    try {
      return await esta;
    } finally {
      if (this.enCurso.get(copropiedadId) === esta) this.enCurso.delete(copropiedadId);
    }
  }

  private async respaldar(copropiedadId: string, actorId: string): Promise<ParteDelRespaldo> {
    const ahora = this.reloj.ahora();
    const ventana = diasAnteriores(ahora, DIAS_DE_RECUPERACION);
    const primero = ventana[0]?.fecha;
    if (primero === undefined) return VACIO;

    const yaEstaban = await this.respaldos.desde(copropiedadId, primero);
    let generados = 0;
    let fallidosAlGenerar = 0;
    for (const dia of diasSinRespaldo(ahora, new Set(yaEstaban.map((r) => r.fecha)))) {
      try {
        const { generado } = await this.generar.ejecutar(copropiedadId, dia, actorId);
        if (generado) generados += 1;
      } catch (error) {
        fallidosAlGenerar += 1;
        this.bitacora.registrar('error', 'respaldo diario: no se pudo generar un día', {
          copropiedadId,
          fecha: dia.fecha,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const candidatos = await this.respaldos.desde(copropiedadId, primero);
    const envio = await this.enviar.ejecutar(copropiedadId, candidatos, actorId);
    return {
      generados,
      fallidosAlGenerar,
      enviados: envio.enviados,
      fallidosAlEnviar: envio.fallidos,
      sinConfigurar: envio.sinConfigurar,
    };
  }
}
