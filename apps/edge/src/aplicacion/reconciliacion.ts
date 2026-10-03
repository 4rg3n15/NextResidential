/**
 * CU-04 · Reconciliación al reconectar. RN-17, CA-22, KPI-28, KPI-29.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LAS CUATRO REGLAS, Y LA QUE CUESTA MÁS ENTENDER
 *
 * 1. **En orden.** La bandeja se vacía por secuencia de llegada: en desorden,
 *    alguien saldría antes de entrar y ningún informe lo arregla.
 *
 * 2. **El duplicado se descarta EN SILENCIO** (CA-22): el Edge reintenta a
 *    propósito, la nube responde «ya lo tenía» y sale de la bandeja igual que si
 *    lo hubiera creado. Tratarlo como fallo sería un reintento infinito.
 *
 * 3. **Se reanuda desde el último confirmado**, no desde el principio: los ya
 *    confirmados de un lote cortado no se reenvían (ventana de la DoD y límite).
 *
 * 4. **Lo que falla no se borra**: retroceso; si la nube lo RECHAZA hasta agotar
 *    los intentos, a la cuarentena (E6, 15-R). En los dos casos, con su clave.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA QUE CUESTA: POR QUÉ UN FALLO CORTA EL LOTE
 *
 * Al primer envío que no se confirma, la reconciliación **se detiene**: si el 3
 * falló por un corte, del 4 al 50 fallarán igual (red y limitador), y si el 4
 * se confirmara sin el 3, la regla 1 dejaría de cumplirse.
 */
import type { BandejaDeSalida, ClienteDeNube, EnvioPendiente } from './puertos';
import { agotaLosIntentos } from './cuarentena';
import type { Cuarentena } from './cuarentena';

export interface OpcionesDeReconciliacion {
  readonly lote: number;
  readonly intentosMaximos: number;
  readonly backoffBaseMs: number;
  /** Se inyecta para que la prueba no dependa del azar (§2.4). */
  readonly aleatorio?: () => number;
  readonly cuarentena?: Cuarentena; // E6 (15-R) · P-31 · lo rechazado hasta agotar intentos
}

export interface ResumenDeReconciliacion {
  readonly enviados: number;
  readonly creados: number;
  readonly duplicados: number;
  readonly fallidos: number;
  /** `true` si quedó trabajo: hay que volver a llamar. */
  readonly quedanPendientes: boolean;
  readonly apartados?: number; // E6 (15-R) · rechazados por última vez → cuarentena
}

/**
 * Retroceso exponencial **con jitter que resta** (§2.7.5): entre el 50 % y el
 * 100 % del nominal, así el tope sigue siendo un tope y varios gateways que
 * reconectan a la vez se dispersan sin alargar a ninguno.
 */
export const esperaDelIntento = (
  intento: number,
  baseMs: number,
  aleatorio: () => number = Math.random,
): number => {
  const nominal = Math.min(baseMs * 2 ** Math.max(0, intento - 1), 5 * 60_000);
  return Math.round(nominal * (0.5 + aleatorio() * 0.5));
};

export class Reconciliacion {
  constructor(
    private readonly bandeja: BandejaDeSalida,
    private readonly nube: ClienteDeNube,
    private readonly opciones: OpcionesDeReconciliacion,
  ) {}

  async ejecutar(ahora: Date): Promise<ResumenDeReconciliacion> {
    const pendientes = this.bandeja.pendientes(ahora, this.opciones.lote);
    if (pendientes.length === 0) {
      return {
        enviados: 0,
        creados: 0,
        duplicados: 0,
        fallidos: 0,
        quedanPendientes: this.bandeja.cuantosPendientes() > 0,
      };
    }

    let creados = 0;
    let duplicados = 0;
    let fallidos = 0;

    let resultados: readonly {
      claveIdempotencia: string;
      aceptado: boolean;
      duplicado: boolean;
      detalle?: string;
    }[];
    try {
      resultados = await this.nube.reconciliar(pendientes);
    } catch (e) {
      // El lote entero no salió: se marca sólo el PRIMERO (falló una vez, no cincuenta).
      const primero = pendientes[0];
      /* c8 ignore next */
      if (primero === undefined) throw e;
      this.marcarFallo(primero, mensaje(e), ahora);
      return {
        enviados: 0,
        creados: 0,
        duplicados: 0,
        fallidos: 1,
        quedanPendientes: true,
      };
    }

    const porClave = new Map(resultados.map((r) => [r.claveIdempotencia, r]));
    let apartados = 0;
    for (const [i, envio] of pendientes.entries()) {
      // E6 · la nube rechaza con clave vacía cuando no pudo construirla: es la de
      // ESA posición (contesta en orden y se corta en el primero), y su motivo cuenta.
      const enSuSitio = resultados[i]?.claveIdempotencia === '' ? resultados[i] : undefined;
      const r = porClave.get(envio.claveIdempotencia) ?? enSuSitio;
      if (r === undefined) {
        // La nube no dijo nada de este: no se confirma y se corta el lote.
        this.marcarFallo(envio, 'la nube no devolvió resultado para esta clave', ahora);
        fallidos += 1;
        break;
      }
      if (!r.aceptado) {
        const motivo = r.detalle ?? 'rechazado por la nube';
        const { cuarentena } = this.opciones;
        if (cuarentena && agotaLosIntentos(envio, this.opciones.intentosMaximos)) {
          cuarentena.apartar(envio, motivo, ahora); // y la bandeja sigue en el próximo tic
          apartados += 1;
        } else {
          this.marcarFallo(envio, motivo, ahora);
          fallidos += 1;
        }
        break;
      }
      // Creado o duplicado: en los dos casos la nube lo tiene. Sale igual.
      this.bandeja.confirmar(envio.claveIdempotencia);
      if (r.duplicado) duplicados += 1;
      else creados += 1;
    }

    return {
      enviados: creados + duplicados,
      creados,
      duplicados,
      fallidos,
      quedanPendientes: this.bandeja.cuantosPendientes() > 0,
      ...(apartados > 0 ? { apartados } : {}),
    };
  }

  private marcarFallo(envio: EnvioPendiente, detalle: string, ahora: Date): void {
    const intento = envio.intentos + 1;
    const espera = esperaDelIntento(
      intento,
      this.opciones.backoffBaseMs,
      this.opciones.aleatorio ?? Math.random,
    );
    this.bandeja.fallo(envio.claveIdempotencia, detalle, new Date(ahora.getTime() + espera));
  }
}

const mensaje = (e: unknown): string =>
  e instanceof Error ? e.message : `fallo no identificado: ${String(e)}`;

/** ¿Se rindió? Lo que agota los intentos **no se borra** (RN-02): ver `cuarentena.ts`. */
export const seRindio = (envio: EnvioPendiente, intentosMaximos: number): boolean =>
  envio.intentos >= intentosMaximos;
