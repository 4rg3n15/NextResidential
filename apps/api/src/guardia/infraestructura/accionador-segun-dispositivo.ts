import { Injectable } from '@nestjs/common';
import type { Bitacora, ControlDeBarrera, ResultadoDeAccionamiento } from '@ncr/domain-core';
import type { AccionadorDePuerta, BloqueoDeAcceso } from '../aplicacion/apertura-manual';

/**
 * Decide **por dispositivo** si una orden va al equipo real o al simulado.
 *
 * **Por dispositivo y no por entorno**, y esa distinción no es teórica: tres
 * defectos seguidos de este proyecto —D-67, D-68 y el arnés de pruebas que
 * apagaba la cookie segura— tenían la misma forma. Algo que depende del caso
 * concreto se decidía por modo de compilación, y se rompía justo en el caso que
 * nadie probaba. Un conjunto puede tener una barrera conectada y tres puertas
 * que no lo están; `NODE_ENV` no sabe nada de eso.
 *
 * El simulado **sigue siendo el de por omisión**: sin equipo configurado, esta
 * clase no cambia nada de lo que ya había. Y se registra cuál atendió cada
 * orden, porque una consola que dice «abriendo» sin que nada se mueva es
 * indistinguible de una que funciona — la misma razón por la que el simulado ya
 * se anunciaba en la bitácora.
 */
@Injectable()
export class AccionadorSegunDispositivo implements AccionadorDePuerta, BloqueoDeAcceso {
  constructor(
    private readonly simulado: AccionadorDePuerta & BloqueoDeAcceso,
    private readonly bitacora: Bitacora,
    /** El control real, si el entorno lo configuró. `null` es lo normal. */
    private readonly real: ControlDeBarrera | null,
    /** Qué dispositivo atiende el equipo real. Vacío = ninguno. */
    private readonly dispositivoReal: string,
  ) {}

  private elegir(dispositivoId: string): {
    readonly destino: AccionadorDePuerta & BloqueoDeAcceso;
    readonly esReal: boolean;
  } {
    const esReal =
      this.real !== null && this.dispositivoReal !== '' && this.dispositivoReal === dispositivoId;
    return { destino: esReal ? (this.real as ControlDeBarrera) : this.simulado, esReal };
  }

  async accionar(dispositivoId: string, abrir: boolean): Promise<ResultadoDeAccionamiento> {
    const { destino, esReal } = this.elegir(dispositivoId);
    const resultado = await destino.accionar(dispositivoId, abrir);
    this.anotar('accionar', dispositivoId, esReal, resultado);
    return resultado;
  }

  async fijarBloqueo(dispositivoId: string, bloqueado: boolean): Promise<ResultadoDeAccionamiento> {
    const { destino, esReal } = this.elegir(dispositivoId);
    const resultado = await destino.fijarBloqueo(dispositivoId, bloqueado);
    this.anotar('bloqueo', dispositivoId, esReal, resultado);
    return resultado;
  }

  private anotar(
    operacion: string,
    dispositivoId: string,
    esReal: boolean,
    resultado: ResultadoDeAccionamiento,
  ): void {
    this.bitacora.registrar(
      resultado.estado === 'aceptada' ? 'info' : 'aviso',
      `orden de ${operacion} atendida por el proveedor ${esReal ? 'REAL' : 'SIMULADO'}`,
      {
        dispositivoId,
        estado: resultado.estado,
        latenciaMs: resultado.latenciaMs,
        // `aceptada` NO significa que el paso se franqueara: sin señal de
        // posición cableada el sistema no puede afirmarlo, y el registro
        // tampoco debe sugerirlo.
        pasoFranqueadoObservable: false,
      },
    );
  }
}
