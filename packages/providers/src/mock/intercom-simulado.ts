import {
  TIMEOUT_DE_CANAL_SEGUNDOS,
  canalLibre,
  conVencimientosAplicados,
  esperaDe,
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
import { esExito } from '@ncr/domain-core';

/**
 * `IntercomProvider` simulado — ETAPA 10, ADR-01 y ADR-03.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ SIMULA Y QUÉ NO
 *
 * **No simula** la exclusividad del canal: la aplica de verdad, con la máquina
 * de estados de `@ncr/domain-core`. Es la misma que gobernará el adaptador
 * ISAPI de la ETAPA 15, así que el comportamiento que el operador aprende hoy
 * —a quién le toca hablar, quién espera, cuándo se cae el canal— es el que
 * tendrá con hardware. Lo que se sustituye en la 15 es el transporte del audio,
 * no las reglas.
 *
 * **Sí simula** el audio: devuelve silencio con la cadencia de un códec real
 * (paquetes de 20 ms) para que la consola pueda ejercer el ciclo completo
 * —abrir, hablar, escuchar, cerrar— sin equipo. Un proveedor que no emitiera
 * nada dejaría sin probar el lado receptor, que es donde vive el semiduplex.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EL RELOJ ENTRA POR EL CONSTRUCTOR
 *
 * La caducidad del canal es una comparación de instantes, no un `setTimeout`.
 * Con reloj inyectado, la prueba adelanta el tiempo y comprueba el relevo sin
 * esperar noventa segundos — y, más importante, dos procesos distintos llegan a
 * la misma conclusión sobre quién tiene la palabra.
 */
export class IntercomSimulado implements IntercomProvider {
  private readonly canales = new Map<string, EstadoDelCanal>();
  /** Último dispositivo sobre el que actuó cada operador, para `enviarAudio`. */
  private readonly ultimoDispositivo = new Map<string, string>();
  private cerrado = false;

  constructor(
    private readonly reloj: Reloj,
    private readonly margenSegundos: number = TIMEOUT_DE_CANAL_SEGUNDOS,
  ) {}

  private estado(dispositivoId: string): EstadoDelCanal {
    return this.canales.get(dispositivoId) ?? canalLibre(dispositivoId);
  }

  async abrirSesion(dispositivoId: string, operadorId: string): Promise<EstadoSesionIntercom> {
    const ahora = this.reloj.ahora();
    const r = solicitarCanal(this.estado(dispositivoId), operadorId, ahora, this.margenSegundos);
    this.canales.set(dispositivoId, r.estado);
    this.ultimoDispositivo.set(operadorId, dispositivoId);
    this.cerrado = false;
    return r.resultado;
  }

  /**
   * Cada fragmento **renueva la señal de vida**. No es un detalle: es lo que
   * distingue a un operador que sigue hablando de uno que cerró el navegador,
   * y sin ello el canal caducaría en mitad de una conversación.
   */
  async enviarAudio(_fragmento: Uint8Array): Promise<void> {
    for (const [operadorId, dispositivoId] of this.ultimoDispositivo) {
      const renovado = renovarActividad(
        this.estado(dispositivoId),
        operadorId,
        this.reloj.ahora(),
        this.margenSegundos,
      );
      if (esExito(renovado)) this.canales.set(dispositivoId, renovado.valor);
    }
  }

  /** Silencio con la cadencia de un códec real: 20 ms por paquete. */
  async *recibirAudio(): AsyncIterable<Uint8Array> {
    while (!this.cerrado) {
      yield new Uint8Array(160);
      await new Promise((listo) => setTimeout(listo, 20));
    }
  }

  async cerrarSesion(_motivo: string): Promise<void> {
    this.cerrado = true;
    for (const [operadorId, dispositivoId] of this.ultimoDispositivo) {
      const cierre = soltarCanal(
        this.estado(dispositivoId),
        operadorId,
        this.reloj.ahora(),
        this.margenSegundos,
      );
      this.canales.set(dispositivoId, cierre.estado);
    }
    this.ultimoDispositivo.clear();
  }

  async estadoSesion(): Promise<EstadoSesionIntercom> {
    const entrada = [...this.ultimoDispositivo.entries()][0];
    if (entrada === undefined) return 'cerrada';
    const [operadorId, dispositivoId] = entrada;
    const vigente = conVencimientosAplicados(
      this.estado(dispositivoId),
      this.reloj.ahora(),
      this.margenSegundos,
    );
    if (vigente.titular?.operadorId === operadorId) return 'abierta';
    return esperaDe(vigente, operadorId, this.reloj.ahora()) === null ? 'cerrada' : 'en_espera';
  }

  /* ── Superficie para la aplicación, fuera del puerto ────────────────────
   * El puerto del dominio habla de UNA sesión porque eso es lo que un
   * operador ve. La consola de guardia virtual necesita además el estado del
   * canal por dispositivo —quién lo tiene, cuántos esperan—, y eso no es
   * intención de dominio: es información de operación. Va aparte, y por eso el
   * puerto no crece.
   */

  canalDe(dispositivoId: string): EstadoDelCanal {
    return conVencimientosAplicados(
      this.estado(dispositivoId),
      this.reloj.ahora(),
      this.margenSegundos,
    );
  }

  soltar(dispositivoId: string, operadorId: string): { nuevoTitular: string | null } {
    const cierre = soltarCanal(
      this.estado(dispositivoId),
      operadorId,
      this.reloj.ahora(),
      this.margenSegundos,
    );
    this.canales.set(dispositivoId, cierre.estado);
    this.ultimoDispositivo.delete(operadorId);
    return { nuevoTitular: cierre.nuevoTitular };
  }
}
