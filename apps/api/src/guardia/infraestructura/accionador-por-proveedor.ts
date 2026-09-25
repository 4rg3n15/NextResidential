import type { Bitacora, ControlDeBarrera, ResultadoDeAccionamiento } from '@ncr/domain-core';
import { ordenAceptada, ordenInalcanzable, ordenRechazada } from '@ncr/domain-core';
import { ErrorDeEquipo } from '@ncr/providers';
import type { ProveedorDeEquipos } from '@ncr/providers';
import type { AccionadorDePuerta, BloqueoDeAcceso } from '../aplicacion/apertura-manual';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL ACCIONADOR QUE PASA POR EL PUERTO · ETAPA 15-E (A1)
 *
 * Hasta aquí `ACCESS_POINT_PROVIDER` no tenía **ningún consumidor** en la API:
 * la apertura de puertas iba por `crearControlDeBarreraDesdeEntorno()` para UN
 * dispositivo (`BARRERA_DISPOSITIVO_ID`) y el resto caía al simulado, en
 * silencio. Con el registro de equipos (D5) cualquier equipo dado de alta en
 * la consola tiene dirección y credencial, así que la apertura de CUALQUIER
 * dispositivo resuelve por el proveedor —por dispositivo y por capacidad
 * (ADR-019)— y ya no hay un segundo camino mudo.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * `BARRERA_*` SIGUE, COMO COMPATIBILIDAD DECLARADA, Y MANDA SOBRE EL REGISTRO
 *
 * Es el único adaptador VERIFICADO contra el equipo (15/09/2026), y quien lo
 * validó lo hizo con esas variables. No se retira en la misma ronda en que se
 * cambia todo lo demás: si `BARRERA_DISPOSITIVO_ID` nombra un equipo, sus
 * órdenes van por ese control y el arranque lo dice. El resto va por el
 * proveedor. Dos caminos, los dos anunciados, y cada orden anota cuál la
 * atendió: eso es lo contrario de «dos caminos silenciosos».
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA TRADUCCIÓN DE RESULTADOS, Y POR QUÉ NINGUNA RAMA «PASA»
 *
 * El puerto del dominio devuelve `{ aceptado, latenciaMs }` y lanza errores
 * neutrales tipados (`CapacidadNoSoportada`, `EquipoOcupado`…). El puerto de
 * aplicación que la consola consume devuelve tres estados —aceptada,
 * rechazada, inalcanzable— porque un portero delante de la barrera necesita
 * distinguirlos (H-1, H-2). Aquí se traduce y se registra; un error del
 * proveedor se convierte en `rechazada` con su motivo, nunca en excepción
 * hacia la consola ni en una aceptación por omisión.
 */

export interface CompatibilidadDeBarrera {
  readonly control: ControlDeBarrera;
  readonly dispositivoId: string;
}

export class AccionadorPorProveedor implements AccionadorDePuerta, BloqueoDeAcceso {
  constructor(
    private readonly proveedor: ProveedorDeEquipos,
    /** Sólo para el rótulo de la bitácora: `simulado` o el nombre del adaptador. */
    private readonly clase: string,
    private readonly bitacora: Bitacora,
    private readonly compatibilidad: CompatibilidadDeBarrera | null,
  ) {}

  private porEntorno(dispositivoId: string): ControlDeBarrera | null {
    return this.compatibilidad !== null && this.compatibilidad.dispositivoId === dispositivoId
      ? this.compatibilidad.control
      : null;
  }

  async accionar(
    dispositivoId: string,
    abrir: boolean,
    actorId: string,
  ): Promise<ResultadoDeAccionamiento> {
    const control = this.porEntorno(dispositivoId);
    if (control !== null) {
      const resultado = await control.accionar(dispositivoId, abrir);
      this.anotar('accionar', dispositivoId, 'barrera por entorno (BARRERA_*)', resultado);
      return resultado;
    }
    if (!abrir) {
      // El puerto del dominio abre; el cierre momentáneo sólo existe en la
      // barrera. No se finge: se dice, y el estado persistente es el bloqueo.
      const resultado = ordenRechazada(
        'el proveedor de equipos no expone un cierre momentáneo: use el bloqueo (H-3)',
        0,
      );
      this.anotar('accionar', dispositivoId, this.rotulo(), resultado);
      return resultado;
    }
    const resultado = await this.traducir(async () => {
      const r = await this.proveedor.abrir(dispositivoId, actorId);
      return r.aceptado
        ? ordenAceptada(r.latenciaMs)
        : ordenInalcanzable('el equipo no respondió a la orden de apertura', r.latenciaMs);
    });
    this.anotar('accionar', dispositivoId, this.rotulo(), resultado);
    return resultado;
  }

  async fijarBloqueo(dispositivoId: string, bloqueado: boolean): Promise<ResultadoDeAccionamiento> {
    const control = this.porEntorno(dispositivoId);
    if (control !== null) {
      const resultado = await control.fijarBloqueo(dispositivoId, bloqueado);
      this.anotar('bloqueo', dispositivoId, 'barrera por entorno (BARRERA_*)', resultado);
      return resultado;
    }
    const resultado = await this.traducir(() =>
      this.proveedor.fijarBloqueo(dispositivoId, bloqueado),
    );
    this.anotar('bloqueo', dispositivoId, this.rotulo(), resultado);
    return resultado;
  }

  private rotulo(): string {
    return `proveedor ${this.clase} (registro de equipos)`;
  }

  /**
   * Un error del proveedor NO sube a la consola como 500: baja como orden
   * rechazada con el motivo en lenguaje del operador. `EquipoNoRegistrado`,
   * `EquipoDecidePorSuCuenta` o un fallo del simulado entran por la misma
   * puerta: son «el sistema no accionó, y esto es por qué».
   */
  private async traducir(
    orden: () => Promise<ResultadoDeAccionamiento>,
  ): Promise<ResultadoDeAccionamiento> {
    try {
      return await orden();
    } catch (error) {
      const motivo =
        error instanceof ErrorDeEquipo || error instanceof Error
          ? error.message
          : 'el proveedor de equipos rechazó la orden';
      return ordenRechazada(motivo, 0);
    }
  }

  private anotar(
    operacion: string,
    dispositivoId: string,
    atendidoPor: string,
    resultado: ResultadoDeAccionamiento,
  ): void {
    this.bitacora.registrar(
      resultado.estado === 'aceptada' ? 'info' : 'aviso',
      `orden de ${operacion} atendida por ${atendidoPor}`,
      {
        dispositivoId,
        atendidoPor,
        estado: resultado.estado,
        latenciaMs: resultado.latenciaMs,
        ...(resultado.estado === 'aceptada' ? {} : { motivo: resultado.motivo }),
        // `aceptada` NO significa que el paso se franqueara (H-1, H-2): sin
        // señal de posición cableada el sistema no puede afirmarlo.
        pasoFranqueadoObservable: false,
      },
    );
  }
}
