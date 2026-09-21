/**
 * El único fichero del Edge que sabe que existe HTTP.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA FIRMA ES LA MISMA QUE LA DEL ALARM SERVER, A PROPÓSITO
 *
 * `HMAC-SHA256` sobre `<marca>.<cuerpo crudo>`, con la marca dentro del mensaje
 * firmado. No se inventa un segundo esquema para el Edge: un sistema con dos
 * formas de acreditar al emisor tiene dos superficies que revisar y dos que
 * pueden divergir. El contrato está fijado en la API
 * (`presentacion/firma-ingesta.ts`) y aquí solo se cumple.
 *
 * **Sobre el cuerpo CRUDO**, no sobre el objeto reserializado: dos
 * serializaciones del mismo objeto difieren en el orden de las claves y la
 * firma dejaría de cuadrar. Por eso se serializa UNA vez y se firma y se envía
 * exactamente esa cadena.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * EL RELOJ DEL EQUIPO IMPORTA, Y POR ESO ESTÁ EN LA GUÍA
 *
 * La firma lleva ventana de frescura simétrica: un reloj adelantado es tan
 * rechazable como uno atrasado. Un gateway que pasa 24 h sin conexión también
 * pasa 24 h sin NTP, y su deriva puede sacarlo de la ventana justo cuando
 * intenta reconciliar. `docs/guias/DESPLIEGUE_EDGE.md` §5 lo trata como lo que
 * es: un requisito de despliegue, no un detalle.
 */
import { createHmac } from 'node:crypto';
import type { InstantaneaDeReglas } from '../../aplicacion/instantanea-de-reglas';
import type { ClienteDeNube, EnvioPendiente, ResultadoDeEnvio } from '../../aplicacion/puertos';

export const CABECERA_FIRMA = 'x-ncr-firma';
export const CABECERA_MARCA = 'x-ncr-marca-temporal';

/** El mismo mensaje canónico de la API. Cambiarlo invalida todas las firmas. */
export const mensajeCanonico = (marca: string, cuerpoCrudo: string): string =>
  `${marca}.${cuerpoCrudo}`;

export const firmar = (secreto: string, marca: string, cuerpoCrudo: string): string =>
  createHmac('sha256', secreto).update(mensajeCanonico(marca, cuerpoCrudo)).digest('hex');

export interface OpcionesDelCliente {
  readonly urlBase: string;
  readonly secreto: string;
  readonly copropiedadId: string;
  readonly tiempoLimiteMs?: number;
  /** Se inyecta para probar sin red y para no depender del reloj (§2.4). */
  readonly ahora?: () => Date;
  readonly transporte?: typeof fetch;
}

interface RespuestaDeLote {
  readonly aceptado: boolean;
  readonly resultados?: readonly {
    readonly claveIdempotencia: string;
    readonly aceptado: boolean;
    readonly duplicado: boolean;
    readonly detalle?: string;
  }[];
}

export class ClienteHttpDeNube implements ClienteDeNube {
  constructor(private readonly opciones: OpcionesDelCliente) {}

  async reconciliar(lote: readonly EnvioPendiente[]): Promise<readonly ResultadoDeEnvio[]> {
    if (lote.length === 0) return [];
    // El cuerpo de cada pendiente se guardó ya serializado: se reenvía TAL
    // CUAL. Parsearlo y volverlo a serializar aquí cambiaría los bytes que se
    // firman sin cambiar el contenido, y la firma dejaría de cuadrar.
    const cuerpo = `{"eventos":[${lote.map((e) => e.cuerpo).join(',')}]}`;
    const respuesta = await this.enviar('/ingesta/reconciliacion', cuerpo);

    const datos = respuesta as RespuestaDeLote;
    const porClave = new Map(
      (datos.resultados ?? []).map((r) => [r.claveIdempotencia, r] as const),
    );
    return lote.map((e) => {
      const r = porClave.get(e.claveIdempotencia);
      return r === undefined
        ? {
            claveIdempotencia: e.claveIdempotencia,
            aceptado: false,
            duplicado: false,
            detalle: 'la nube no devolvió resultado para esta clave',
          }
        : {
            claveIdempotencia: e.claveIdempotencia,
            aceptado: r.aceptado,
            duplicado: r.duplicado,
            ...(r.detalle === undefined ? {} : { detalle: r.detalle }),
          };
    });
  }

  async descargarReglas(
    copropiedadId: string,
    versionActual: number,
  ): Promise<InstantaneaDeReglas | null> {
    const ruta = `/copropiedades/${copropiedadId}/reglas/instantanea?desde=${versionActual}`;
    const respuesta = await this.enviar(ruta, '', 'GET');
    if (respuesta === null) return null;
    const instantanea = respuesta as InstantaneaDeReglas;
    // Una respuesta sin versión o de otra copropiedad NO se guarda: sería
    // decidir accesos de este conjunto con las reglas de otro (RN-15).
    if (typeof instantanea.version !== 'number' || instantanea.copropiedadId !== copropiedadId) {
      return null;
    }
    return instantanea;
  }

  private async enviar(ruta: string, cuerpo: string, metodo: 'POST' | 'GET' = 'POST') {
    const marca = String(Math.floor((this.opciones.ahora?.() ?? new Date()).getTime() / 1000));
    const transporte = this.opciones.transporte ?? fetch;
    const control = new AbortController();
    const temporizador = setTimeout(
      () => control.abort(),
      this.opciones.tiempoLimiteMs ?? 10_000,
    );
    try {
      const respuesta = await transporte(`${this.opciones.urlBase}${ruta}`, {
        method: metodo,
        headers: {
          'content-type': 'application/json',
          [CABECERA_MARCA]: marca,
          [CABECERA_FIRMA]: firmar(this.opciones.secreto, marca, cuerpo),
        },
        ...(metodo === 'POST' ? { body: cuerpo } : {}),
        signal: control.signal,
      });
      if (respuesta.status === 204 || respuesta.status === 304) return null;
      if (!respuesta.ok) {
        // El estado va en el mensaje porque distingue casos que se tratan
        // distinto aguas arriba: un 401 es una credencial que hay que rotar y
        // un 503 es esperar. Ocultarlo dejaría los dos como «falló».
        throw new Error(`la nube respondió ${respuesta.status}`);
      }
      return (await respuesta.json()) as unknown;
    } finally {
      clearTimeout(temporizador);
    }
  }
}

/**
 * La sonda del enlace: una llamada barata que solo pregunta si hay nube.
 *
 * `/health` y no la ruta de reconciliación: sondear con el trabajo real haría
 * que cada comprobación de enlace enviara eventos, y que un fallo del lote se
 * confundiera con un fallo de red. Son dos preguntas distintas.
 */
export class SondaHttp {
  constructor(
    private readonly urlBase: string,
    private readonly transporte: typeof fetch = fetch,
    private readonly tiempoLimiteMs = 3_000,
  ) {}

  async hayEnlace(): Promise<boolean> {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), this.tiempoLimiteMs);
    try {
      const r = await this.transporte(`${this.urlBase}/health`, { signal: control.signal });
      return r.ok;
    } catch {
      // Cualquier fallo es «no hay enlace». No se distingue el motivo porque la
      // respuesta del Edge es la misma: seguir solo.
      return false;
    } finally {
      clearTimeout(temporizador);
    }
  }
}
