import type { EstadoDeDispositivo, UmbralDeLatido, VentanaDelDia } from '@ncr/domain-core';

/**
 * Puertos del tablero operativo (W-02).
 *
 * Es un módulo de **lectura**: no decide nada, no muta nada y no tiene
 * agregado. Existe porque la consola necesita cuatro cifras, un histograma y un
 * listado de equipos, y ninguno de los módulos que poseen esos datos debe
 * exponer su tabla a los demás (§2.2). La aplicación define qué necesita; la
 * infraestructura lo resuelve con SQL parametrizado.
 *
 * **Lo que este puerto NO devuelve nunca:** `credencial_ref`. Ni completo, ni
 * enmascarado, ni como referencia a la bóveda. RN-21 lo prohíbe y el CHECK de
 * la migración 0009 solo impide guardar el secreto, no publicarlo: el que no
 * salga de la API es responsabilidad de este contrato. Por eso el tipo de abajo
 * no tiene ese campo — no se puede filtrar lo que no se puede nombrar.
 */

export interface ConfiguracionDeTablero {
  readonly copropiedadId: string;
  /** Zona IANA de `copropiedades.zona_horaria` (migración 0004). */
  readonly zonaHoraria: string;
  /** Umbral de latido de la copropiedad (migración 0020, P-06). */
  readonly umbralDeLatido: UmbralDeLatido;
}

export interface ConteosDelPadron {
  readonly residentesActivos: number;
  /** Altas dentro de la ventana, para el «+4 nuevo» del mockup. */
  readonly residentesAltaEnVentana: number;
  readonly vehiculosActivos: number;
  readonly vehiculosAltaEnVentana: number;
}

export interface ConteosDeVisitantes {
  /** Autorizaciones de visitante cuya vigencia toca el día local. */
  readonly autorizacionesDelDia: number;
  /** Los que ya entraron y no consta su salida: el «8 activos» del mockup. */
  readonly dentroAhora: number;
}

export type SeveridadDeAlerta = 'informativa' | 'media' | 'alta' | 'critica';

export interface ConteosDeAlertas {
  readonly pendientes: number;
  /** `null` cuando no hay ninguna: la tarjeta no inventa «prioridad baja». */
  readonly severidadMaxima: SeveridadDeAlerta | null;
}

/** Una barra del histograma «Accesos por hora» del mockup. */
export interface FranjaDeAccesos {
  /** Hora local de la copropiedad, 0–23. */
  readonly hora: number;
  readonly permitidos: number;
  readonly negados: number;
}

/**
 * Dispositivo tal como lo ve el tablero. `host`, `puerto`, `modelo` y
 * `firmware` son datos de inventario, no secretos (C-11), y la presentación
 * decide para qué roles se rellenan.
 */
export interface DispositivoDelTablero {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: string;
  readonly zonaId: string | null;
  readonly host: string;
  readonly puerto: number;
  readonly modelo: string | null;
  readonly firmware: string | null;
  readonly ultimoLatido: Date | null;
  readonly ultimaSincronizacion: Date | null;
}

/** El mismo dispositivo con el estado ya derivado por el dominio. */
export interface DispositivoConEstado extends DispositivoDelTablero {
  readonly estado: EstadoDeDispositivo;
  readonly segundosSinLatir: number | null;
}

export interface RepositorioTablero {
  /** `null` si la copropiedad no existe: el caso de uso lo traduce a 404. */
  configuracion(copropiedadId: string): Promise<ConfiguracionDeTablero | null>;
  conteosDelPadron(copropiedadId: string, ventana: VentanaDelDia): Promise<ConteosDelPadron>;
  conteosDeVisitantes(copropiedadId: string, ventana: VentanaDelDia): Promise<ConteosDeVisitantes>;
  conteosDeAlertas(copropiedadId: string): Promise<ConteosDeAlertas>;
  accesosPorHora(
    copropiedadId: string,
    ventana: VentanaDelDia,
  ): Promise<readonly FranjaDeAccesos[]>;
  dispositivos(copropiedadId: string): Promise<readonly DispositivoDelTablero[]>;
}

export const REPOSITORIO_TABLERO = Symbol.for('ncr.puerto.RepositorioTablero');
