/**
 * El único fichero del Edge que sabe que existe HTTP.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q · EL EDGE FIRMA CON SU IDENTIDAD, NO CON EL SECRETO DE LA PLATAFORMA
 *
 * Hasta la 15-Q firmaba con el secreto de ingesta de la API: un gateway robado
 * firmaba por cualquier copropiedad. Ahora `EDGE_INGESTA_SECRETO` es la
 * credencial DE ESTE gateway (la emite la API al darlo de alta, derivada con su
 * copropiedad dentro) y cada petición lleva `x-ncr-edge` con su identificador.
 * Se firma `<marca>.<MÉTODO> <ruta>\n<cuerpo crudo>`: el método y la ruta van
 * dentro, así que la firma de una descarga no vale para otra ruta.
 *
 * El cuerpo se firma CRUDO y se envía exactamente esa cadena: reserializarlo
 * cambiaría los bytes sin cambiar el contenido. Y la marca tiene ventana
 * simétrica: el reloj del equipo importa (DESPLIEGUE_EDGE.md §5).
 */
import { createHmac } from 'node:crypto';
import type { InstantaneaDeReglas, ReglasVigentes } from '../../aplicacion/instantanea-de-reglas';
import type { ClienteDeNube, EnvioPendiente, ResultadoDeEnvio } from '../../aplicacion/puertos';

export const CABECERA_FIRMA = 'x-ncr-firma';
export const CABECERA_MARCA = 'x-ncr-marca-temporal';
export const CABECERA_EDGE = 'x-ncr-edge';

/** El mismo mensaje canónico de la API. Cambiarlo invalida todas las firmas. */
export const mensajeCanonico = (marca: string, cuerpoCrudo: string): string =>
  `${marca}.${cuerpoCrudo}`;

export const firmar = (secreto: string, marca: string, cuerpoCrudo: string): string =>
  createHmac('sha256', secreto).update(mensajeCanonico(marca, cuerpoCrudo)).digest('hex');

/** 15-Q · lo que se firma: método, ruta con su consulta, y el cuerpo crudo. */
export const solicitudCanonica = (metodo: string, ruta: string, cuerpo: string): string =>
  `${metodo.toUpperCase()} ${ruta}\n${cuerpo}`;

export interface OpcionesDelCliente {
  readonly urlBase: string;
  readonly secreto: string;
  readonly copropiedadId: string;
  /** `edge_gateways.id`: la identidad con que la API lo acredita (15-Q). */
  readonly gatewayId: string;
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
    const ruta = `/copropiedades/${this.opciones.copropiedadId}/edge/reconciliacion`;
    const respuesta = await this.enviar(ruta, cuerpo);

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
  ): Promise<InstantaneaDeReglas | ReglasVigentes | null> {
    const ruta = `/copropiedades/${copropiedadId}/reglas/instantanea?desde=${versionActual}`;
    const respuesta = (await this.enviar(ruta, '', 'GET')) as
      | (Partial<InstantaneaDeReglas> & {
          readonly sinCambios?: boolean;
        })
      | null;
    // Sin versión o de otra copropiedad NO se guarda: sería decidir accesos de
    // este conjunto con las reglas de otro (RN-15).
    if (respuesta === null || typeof respuesta.version !== 'number') return null;
    if (respuesta.copropiedadId !== copropiedadId) return null;
    if (respuesta.sinCambios === true) {
      return {
        sinCambios: true,
        version: respuesta.version,
        generadaEn: String(respuesta.generadaEn),
      };
    }
    return respuesta as InstantaneaDeReglas;
  }

  private async enviar(ruta: string, cuerpo: string, metodo: 'POST' | 'GET' = 'POST') {
    const marca = String(Math.floor((this.opciones.ahora?.() ?? new Date()).getTime() / 1000));
    const transporte = this.opciones.transporte ?? fetch;
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), this.opciones.tiempoLimiteMs ?? 10_000);
    try {
      const respuesta = await transporte(`${this.opciones.urlBase}${ruta}`, {
        method: metodo,
        headers: {
          'content-type': 'application/json',
          [CABECERA_EDGE]: this.opciones.gatewayId,
          [CABECERA_MARCA]: marca,
          [CABECERA_FIRMA]: firmar(
            this.opciones.secreto,
            marca,
            solicitudCanonica(metodo, ruta, cuerpo),
          ),
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

// La sonda del enlace vive en su fichero desde la 15-Q; se reexporta aquí.
export { SondaHttp } from './sonda-http';
