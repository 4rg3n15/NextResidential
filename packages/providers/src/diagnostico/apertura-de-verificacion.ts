import type { OpcionesDeEquipo } from '../equipo/cliente';
import { ClienteDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';
import { abrirPuertaRemota } from '../equipo/puerta-remota';
import { resumenIsapi } from '../equipo/errores-del-fabricante';
import { documentoSaneado } from './diagnostico-de-equipo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ANEXO 15-K · `--abrir` · LA APERTURA QUE ABRIÓ EN SITIO, PARA REPETIRLA
 *
 * La verificación de la próxima visita. Abre la puerta de la terminal o del
 * videoportero por el MISMO camino que usa la API (`abrirPuertaRemota` con la
 * ruta del catálogo) y devuelve cada petición tal como salió y cada respuesta
 * tal como llegó, para comparar con lo demostrado el 26/09/2026:
 *
 *   PUT door/<n> · Content-Type `application/x-www-form-urlencoded;
 *   charset=UTF-8` · cuerpo con el espacio de nombres ISAPI y `version="2.0"`
 *   · el cuerpo YA en la petición que recibe el 401 · después 200 con
 *   `statusCode 1` y su `subStatusCode`.
 *
 * Lo que NO puede decir es si la puerta se movió: eso lo contesta la persona
 * delante de ella (el guion se lo pregunta). «Aceptada» es la orden (H-1).
 * Vive aquí y no en el guion por la frontera de extensibilidad (O2).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type FamiliaConPuerta = 'terminal' | 'videoportero';

export interface PeticionDeLaApertura {
  readonly metodo: string;
  readonly ruta: string;
  readonly tipo: string | null;
  /** El cuerpo enviado, saneado. */
  readonly cuerpo: string;
  readonly conCredencial: boolean;
  readonly estado: number;
  /** Lo que contestó el equipo, saneado. */
  readonly recibido: string;
}

export interface ResultadoDeAperturaDeVerificacion {
  readonly familia: FamiliaConPuerta;
  readonly puerta: number;
  readonly peticiones: readonly PeticionDeLaApertura[];
  /** La orden aceptada: HTTP 2xx, `statusCode 1` y un `subStatusCode`. */
  readonly aceptada: boolean;
  readonly statusCode: number | null;
  readonly subStatusCode: string | null;
  readonly latenciaMs: number | null;
  /** En qué se aparta lo que pasó de lo demostrado en sitio. Vacío: nada. */
  readonly desviaciones: readonly string[];
  readonly error: string | null;
}

/** El propósito de la apertura en el catálogo, por familia. */
const PROPOSITO: Readonly<Record<FamiliaConPuerta, string>> = {
  terminal: 'abrir la puerta desde la plataforma',
  videoportero: 'abrir la puerta del videoportero',
};

/**
 * El cuerpo de la respuesta sin consumirlo: la de `fetch` se clona; la del
 * simulado no se puede clonar, pero se puede leer más de una vez.
 */
const leerSinConsumir = (respuesta: Response): Promise<string> =>
  (typeof respuesta.clone === 'function' ? respuesta.clone() : respuesta).text();

const cabecera = (cabeceras: RequestInit['headers'], nombre: string): string | null =>
  new Headers(cabeceras).get(nombre);

/** El transporte del cliente, con cada petición y su respuesta anotadas. */
const anotado = (
  base: typeof fetch,
  peticiones: PeticionDeLaApertura[],
): { peticion: typeof fetch; pendientes: Promise<void>[] } => {
  const pendientes: Promise<void>[] = [];
  const peticion: typeof fetch = async (url, opciones) => {
    // El sitio se reserva al salir: las lecturas de cuerpo acaban en otro orden.
    const indice = pendientes.length;
    const respuesta = await base(url, opciones);
    const { pathname } = new URL(String(url));
    pendientes.push(
      leerSinConsumir(respuesta)
        .catch(() => '(no se pudo leer)')
        .then((recibido) => {
          peticiones[indice] = {
            // El cliente declara siempre método y cuerpo en una apertura: sin
            // cuerpo, ni sale (EscrituraSinCuerpo).
            metodo: String(opciones?.method),
            ruta: pathname,
            tipo: cabecera(opciones?.headers, 'content-type'),
            cuerpo: documentoSaneado(String(opciones?.body)),
            conCredencial: cabecera(opciones?.headers, 'authorization') !== null,
            estado: respuesta.status,
            recibido: documentoSaneado(recibido),
          };
        }),
    );
    return respuesta;
  };
  return { peticion, pendientes };
};

/** Lo demostrado en sitio, comparado con lo que acaba de pasar. */
const desviacionesDe = (peticiones: readonly PeticionDeLaApertura[]): string[] => {
  const d: string[] = [];
  if (peticiones.some((p) => /badXmlContent/.test(p.recibido))) {
    d.push('el equipo contestó badXmlContent: le llegó el cuerpo vacío o malformado (H-SITIO-15)');
  }
  const primera = peticiones[0];
  if (primera !== undefined && primera.estado !== 401) {
    d.push(`la primera petición no recibió el desafío Digest (HTTP ${String(primera.estado)})`);
  }
  if (peticiones.map((p) => p.estado).join(' → ') !== '401 → 200') {
    d.push(
      `la secuencia fue ${peticiones.map((p) => String(p.estado)).join(' → ') || 'vacía'}, no 401 → 200`,
    );
  }
  return d;
};

export const aperturaDeVerificacion = async (
  conexion: OpcionesDeEquipo,
  familia: FamiliaConPuerta,
  puerta: number,
): Promise<ResultadoDeAperturaDeVerificacion> => {
  const ruta = rutaPara(PROPOSITO[familia], familia, puerta);
  const peticiones: PeticionDeLaApertura[] = [];
  const { peticion, pendientes } = anotado(conexion.peticion ?? fetch, peticiones);
  // Un cliente NUEVO: sin desafío guardado, la primera petición es la del 401.
  const cliente = new ClienteDeEquipo({ ...conexion, peticion });
  let latenciaMs: number | null = null;
  let error: string | null = null;
  try {
    const r = await abrirPuertaRemota(cliente, ruta, `verificacion-${familia}`);
    latenciaMs = r.latenciaMs;
    if (!r.aceptado) error = 'el equipo no contestó a tiempo: inalcanzable';
  } catch (e) {
    // `abrirPuertaRemota` sólo lanza errores con clase: neutral, sin confirmar…
    error = (e as Error).message;
  }
  await Promise.all(pendientes);
  const ultima = peticiones[peticiones.length - 1];
  const resumen = resumenIsapi(ultima?.recibido ?? '');
  return {
    familia,
    puerta,
    peticiones,
    aceptada: error === null && ultima !== undefined,
    statusCode: resumen.statusCode,
    subStatusCode: resumen.subStatusCode,
    latenciaMs,
    desviaciones: desviacionesDe(peticiones),
    error,
  };
};
