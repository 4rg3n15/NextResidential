/**
 * CU-04 · Reconciliación al reconectar. RN-17, CA-22, KPI-28, KPI-29.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LAS CUATRO REGLAS, Y LA QUE CUESTA MÁS ENTENDER
 *
 * 1. **En orden.** La bandeja se vacía por secuencia de llegada. Un histórico
 *    que recibe los eventos de un corte en desorden es un histórico en el que
 *    alguien salió antes de entrar, y ningún informe posterior lo arregla.
 *
 * 2. **El duplicado se descarta EN SILENCIO** (CA-22). No es un error del
 *    emisor: el Edge reintenta a propósito porque no sabe si el envío anterior
 *    llegó. La nube responde «ya lo tenía» y el Edge lo saca de la bandeja
 *    exactamente igual que si lo hubiera creado. Tratarlo como fallo
 *    produciría un reintento infinito de algo que ya está bien.
 *
 * 3. **Se reanuda desde el último confirmado**, no desde el principio. Con
 *    conexión intermitente —que es la normal en una portería— un lote de 50 se
 *    corta a la mitad; al volver, los 20 ya confirmados no se reenvían. La
 *    idempotencia los descartaría igual, pero reenviarlos consume la ventana de
 *    5 minutos de la DoD y el límite de peticiones de la API.
 *
 * 4. **Lo que falla no se borra.** Se queda con su clave y su retroceso
 *    exponencial. Es la misma mecánica de la bandeja de la app del residente, y
 *    es a propósito: un solo concepto, dos sitios, una sola forma de razonar.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA QUE CUESTA: POR QUÉ UN FALLO CORTA EL LOTE
 *
 * Al primer envío que no se confirma, la reconciliación **se detiene** en vez de
 * seguir con el resto. Parece desperdicio y es lo contrario: si el número 3
 * falló por un corte, los números 4 a 50 van a fallar igual, y cada uno gasta un
 * tiempo de espera de red y una entrada del limitador. Peor: si el 3 falló y el
 * 4 se confirmó, el histórico tendría el 4 sin el 3 hasta el siguiente ciclo, y
 * la regla 1 dejaría de cumplirse.
 */
import type { BandejaDeSalida, ClienteDeNube, EnvioPendiente } from './puertos';

export interface OpcionesDeReconciliacion {
  readonly lote: number;
  readonly intentosMaximos: number;
  readonly backoffBaseMs: number;
  /** Se inyecta para que la prueba no dependa del azar (§2.4). */
  readonly aleatorio?: () => number;
}

export interface ResumenDeReconciliacion {
  readonly enviados: number;
  readonly creados: number;
  readonly duplicados: number;
  readonly fallidos: number;
  /** `true` si quedó trabajo: hay que volver a llamar. */
  readonly quedanPendientes: boolean;
}

/**
 * Retroceso exponencial **con jitter que resta**, nunca que suma.
 *
 * §2.7.5 lo pide para no chocar con el limitador de la API. Y el jitter resta y
 * no suma por una razón concreta: si sumara, el tope configurado dejaría de ser
 * un tope y una cola larga acabaría esperando más de lo previsto. Restando, la
 * espera queda entre el 50 % y el 100 % del retroceso nominal, que es lo que
 * dispersa a varios gateways reconectando a la vez sin alargar a ninguno.
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

    let resultados: readonly { claveIdempotencia: string; aceptado: boolean; duplicado: boolean; detalle?: string }[];
    try {
      resultados = await this.nube.reconciliar(pendientes);
    } catch (e) {
      // El lote entero no salió. Se marca el PRIMERO y se deja el resto
      // intacto: marcar los cincuenta multiplicaría por cincuenta el retroceso
      // de una cola que en realidad falló una sola vez.
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
    for (const envio of pendientes) {
      const r = porClave.get(envio.claveIdempotencia);
      if (r === undefined) {
        // La nube no dijo nada de este. No se confirma —confirmarlo sería dar
        // por escrito algo que nadie escribió— y se corta el lote.
        this.marcarFallo(envio, 'la nube no devolvió resultado para esta clave', ahora);
        fallidos += 1;
        break;
      }
      if (!r.aceptado) {
        this.marcarFallo(envio, r.detalle ?? 'rechazado por la nube', ahora);
        fallidos += 1;
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

/**
 * ¿Se rindió? Lo que agota los intentos **no se borra**: se queda visible con su
 * clave, y un reintento a mano sigue siendo idempotente. Borrarlo sería perder
 * un acceso que ocurrió de verdad, y RN-02 no admite eso.
 */
export const seRindio = (envio: EnvioPendiente, intentosMaximos: number): boolean =>
  envio.intentos >= intentosMaximos;
