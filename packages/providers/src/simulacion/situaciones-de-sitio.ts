import { RUTAS } from '../equipo/catalogo-de-rutas';
import { caminoCasa, respuestaDe } from './respuesta-simulada';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * C7 Y F4 (corrección de la 15-L) · LO QUE PASÓ EN SITIO, A PETICIÓN
 *
 * Los equipos del conjunto están dados de alta TAMBIÉN en HikCentral, y eso
 * produce dos síntomas que el simulado no sabía reproducir:
 *
 *  · **La escucha rechazada.** El equipo tiene un máximo de conexiones de
 *    eventos, o ya tiene la suya otra plataforma: la de la API no entra.
 *  · **El rostro que desaparece.** Otra plataforma sincroniza el equipo con su
 *    propia lista y borra lo que no es suyo: el rostro de prueba estaba al
 *    darlo de alta y un minuto después ya no.
 *
 * Y el firmware «Ultra» del videoportero dejó en «desconocida» la biblioteca y
 * las personas (F4): aquí contesta `400 badParameters` a esas consultas
 * (`[SUPUESTO]` S-103: en sitio no se capturó QUÉ contestó; es un ejemplo con
 * la forma de error de la guía, y el ensayo anotará el de verdad).
 *
 * Es un envoltorio del `fetch` simulado: el equipo sigue siendo el mismo, con
 * su Digest; esto cambia SÓLO la respuesta de las rutas afectadas. Un guion
 * que no pide ninguna situación obtiene el equipo conforme, como siempre.
 *
 * `[SUPUESTO]` S-102: los cuerpos de rechazo de la escucha no están en la guía
 * del catálogo. Se usan los del código de estado general —«Device Busy» con
 * `deviceBusy` para el máximo de conexiones, «Invalid Operation» con
 * `alreadyArmed` para la otra plataforma— y se confirman en sitio.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface SituacionesDeSitio {
  /** C7 · la conexión de eventos, rechazada: máximo alcanzado u otra plataforma. */
  readonly escuchaRechazada?: 'limite_de_conexiones' | 'otra_plataforma';
  /** C7 · a los N ms del alta, otra plataforma ha borrado el rostro: la búsqueda no lo halla. */
  readonly otraPlataformaBorraRostrosTrasMs?: number;
  /** F4 · `400 badParameters` a las dos consultas de la biblioteca de rostros. */
  readonly bibliotecaIlegible?: boolean;
  /** F4 · `400 badParameters` a las dos consultas de personas. */
  readonly personasIlegibles?: boolean;
  readonly ahora?: () => number;
}

const ESPACIO = 'http://www.isapi.org/ver20/XMLSchema';
const estadoGeneral = (codigo: number, texto: string, sub: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><ResponseStatus version="2.0" xmlns="${ESPACIO}">` +
  `<statusCode>${String(codigo)}</statusCode><statusString>${texto}</statusString>` +
  `<subStatusCode>${sub}</subStatusCode></ResponseStatus>`;

export const RECHAZO_POR_LIMITE = estadoGeneral(2, 'Device Busy', 'deviceBusy');
export const RECHAZO_POR_OTRA_PLATAFORMA = estadoGeneral(4, 'Invalid Operation', 'alreadyArmed');
const PARAMETRO_MALO =
  '{"statusCode":6,"statusString":"Invalid Content","subStatusCode":"badParameters",' +
  '"errorCode":1610612737,"errorMsg":"badParameters"}';

const ESCUCHA = [
  'escuchar los eventos que el equipo emite',
  'suscribirse a los eventos del equipo',
];
const BIBLIOTECA = [
  'leer qué admite la biblioteca de rostros',
  'contar las plantillas de la biblioteca de rostros',
];
const PERSONAS = [
  'leer qué admite la gestión de personas',
  'capacidades de control de acceso de la terminal',
];

const propositoDe = (camino: string, metodo: string): string | null =>
  RUTAS.find((r) => r.metodo === metodo && caminoCasa(r.ruta, camino))?.proposito ?? null;

const fpidDe = (cuerpo: unknown): string | null => {
  const texto = Buffer.isBuffer(cuerpo) ? cuerpo.toString('latin1') : String(cuerpo ?? '');
  return /"FPID"\s*:\s*"([^"]+)"/.exec(texto)?.[1] ?? null;
};

export const conSituacionesDeSitio = (base: typeof fetch, s: SituacionesDeSitio): typeof fetch => {
  const ahora = s.ahora ?? (() => Date.now());
  /** Cuándo se dio de alta cada rostro, para «borrarlo» a su hora. */
  const altas = new Map<string, number>();
  return (async (entrada: string | URL, opciones?: RequestInit): Promise<Response> => {
    const url = new URL(typeof entrada === 'string' ? entrada : String(entrada));
    const proposito = propositoDe(url.pathname, opciones?.method ?? 'GET');
    const autenticada = (opciones?.headers as Record<string, string> | undefined)?.[
      'authorization'
    ];
    // La escucha rechazada NO abre el flujo: otra conexión le quitaría los
    // eventos a la que hubiera. El primer viaje (sin credencial) sí pasa: el
    // desafío Digest es del equipo, como siempre.
    if (s.escuchaRechazada !== undefined && proposito !== null && ESCUCHA.includes(proposito)) {
      if (autenticada === undefined) return base(entrada, opciones);
      return s.escuchaRechazada === 'limite_de_conexiones'
        ? respuestaDe(503, RECHAZO_POR_LIMITE)
        : respuestaDe(403, RECHAZO_POR_OTRA_PLATAFORMA);
    }
    const respuesta = await base(entrada, opciones);
    if (respuesta.status === 401 || proposito === null) return respuesta;
    if (
      (s.bibliotecaIlegible === true && BIBLIOTECA.includes(proposito)) ||
      (s.personasIlegibles === true && PERSONAS.includes(proposito))
    ) {
      return respuestaDe(400, PARAMETRO_MALO);
    }
    const plazo = s.otraPlataformaBorraRostrosTrasMs;
    if (plazo === undefined) return respuesta;
    const fpid = fpidDe(opciones?.body);
    if (proposito === 'cargar la plantilla facial' && respuesta.ok && fpid !== null) {
      altas.set(fpid, ahora());
    }
    const alta = fpid === null ? undefined : altas.get(fpid);
    if (
      proposito === 'buscar una plantilla en la biblioteca de rostros' &&
      alta !== undefined &&
      ahora() - alta >= plazo
    ) {
      return respuestaDe(200, '{"MatchList":[],"numOfMatches":0,"totalMatches":0}');
    }
    return respuesta;
  }) as typeof fetch;
};
