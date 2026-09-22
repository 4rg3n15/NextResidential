import { createHash } from 'node:crypto';
import { RUTAS } from '../equipo/catalogo-de-rutas';
import type { RutaDeEquipo } from '../equipo/catalogo-de-rutas';

/**
 * UN EQUIPO QUE HABLA COMO LOS DE VERDAD, Y QUE NO EXISTE.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ES ADR-03, LITERALMENTE
 *
 * «Todo el sistema debe funcionar completo contra el simulado. Si el sistema
 * necesita hardware para demostrarse, el desacople falló.» Esto es la otra
 * mitad de esa frase: sin un equipo que conteste, los adaptadores de esta etapa
 * sólo se podrían probar con dobles escritos a la medida de cada prueba, y un
 * doble a medida confirma lo que el autor ya creía.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ SIMULA DE VERDAD, Y NO DE ADORNO
 *
 * · **Digest de dos viajes.** El primer intento sin credenciales recibe `401`
 *   con desafío, como el aparato. Un simulado que aceptara a la primera dejaría
 *   sin ejercitar la renegociación, que es donde vive el fallo que bloquea la
 *   cuenta del equipo.
 * · **`notSupport` por ruta.** Se le puede decir qué rutas NO soporta, que es
 *   el desenlace esperado de las once DOCUMENTADAS, NO VERIFICADAS. Probar sólo
 *   el camino feliz de una ruta sin verificar es probar la suposición.
 * · **El volcado histórico del flujo de eventos.** Con `currentEvent: false`,
 *   antes de lo vivo, porque ésa es la trampa real de la puesta en marcha.
 *
 * Lo que **no** simula: latencia ni fallos aleatorios. Eso ya lo hace
 * `mock/simulacion.ts` con semilla, y duplicarlo aquí daría dos generadores de
 * adversidad que se comportan distinto.
 */

export interface GuionDeEquipo {
  /** Familia, para responder sólo a las rutas que le corresponden. */
  readonly familia: RutaDeEquipo['familia'];
  readonly usuario: string;
  readonly clave: string;
  /** Propósitos que este firmware NO soporta. Contesta `notSupport`. */
  readonly sinSoporte?: readonly string[];
  /** Bloques que el flujo de eventos entrega al conectar, en orden. */
  readonly flujo?: readonly Record<string, unknown>[];
  /** Identidad que devuelve la ruta de `deviceInfo`. */
  readonly modelo?: string;
  readonly firmware?: string;
}

const md5 = (t: string): string => createHash('md5').update(t, 'utf8').digest('hex');

const OK =
  '<ResponseStatus><statusCode>1</statusCode><statusString>OK</statusString></ResponseStatus>';
const NO_SOPORTA =
  '<ResponseStatus><statusCode>4</statusCode><statusString>notSupport</statusString></ResponseStatus>';

/** Lo que el equipo contesta al primer intento: el desafío. */
const REINO = 'equipo-simulado';
const NONCE = 'nonce-de-prueba';

const respuestaDe = (
  estado: number,
  cuerpo: string,
  cabeceras: Record<string, string> = {},
): Response =>
  ({
    status: estado,
    ok: estado >= 200 && estado < 300,
    headers: new Headers(cabeceras),
    text: async () => cuerpo,
    body: null,
  }) as unknown as Response;

/** Comprueba la respuesta Digest como lo haría el aparato. */
const digestCorrecto = (
  autorizacion: string | null,
  metodo: string,
  guion: GuionDeEquipo,
): boolean => {
  if (autorizacion === null || !/^digest /i.test(autorizacion)) return false;
  const valor = (nombre: string): string =>
    new RegExp(`${nombre}="?([^",]+)"?`).exec(autorizacion)?.[1] ?? '';
  const uri = valor('uri');
  const ha1 = md5(`${guion.usuario}:${REINO}:${guion.clave}`);
  const ha2 = md5(`${metodo}:${uri}`);
  const qop = valor('qop');
  const esperado =
    qop === ''
      ? md5(`${ha1}:${NONCE}:${ha2}`)
      : md5(`${ha1}:${NONCE}:${valor('nc')}:${valor('cnonce')}:${qop}:${ha2}`);
  return valor('response') === esperado;
};

/** Flujo de eventos: los bloques, uno detrás de otro, y después se cierra. */
const cuerpoDeFlujo = (bloques: readonly Record<string, unknown>[]): ReadableStream<Uint8Array> => {
  const codificador = new TextEncoder();
  let i = 0;
  return {
    getReader: () => ({
      read: async () =>
        i < bloques.length
          ? { done: false, value: codificador.encode(JSON.stringify(bloques[i++])) }
          : { done: true, value: undefined },
      cancel: async () => undefined,
    }),
  } as unknown as ReadableStream<Uint8Array>;
};

/**
 * Devuelve un `fetch` que se comporta como el equipo descrito.
 *
 * Se inyecta en cualquier adaptador —todos aceptan `peticion`— y con él la
 * suite recorre el camino entero sin un solo aparato.
 */
export const equipoSimulado = (guion: GuionDeEquipo): typeof fetch => {
  const sinSoporte = new Set(guion.sinSoporte ?? []);

  return (async (entrada: string | URL, opciones?: RequestInit): Promise<Response> => {
    const url = new URL(typeof entrada === 'string' ? entrada : String(entrada));
    const metodo = opciones?.method ?? 'GET';
    const cabeceras = (opciones?.headers ?? {}) as Record<string, string>;

    // Primer viaje: sin credenciales, el equipo contesta con su desafío.
    if (!digestCorrecto(cabeceras['authorization'] ?? null, metodo, guion)) {
      return respuestaDe(401, '', {
        'www-authenticate': `Digest realm="${REINO}", nonce="${NONCE}", qop="auth"`,
      });
    }

    const catalogada = RUTAS.find(
      (r) =>
        r.ruta.split('?')[0] === url.pathname &&
        (r.familia === guion.familia || r.familia === 'comun'),
    );

    // Una ruta que el adaptador pide y el catálogo no conoce es un error de
    // programación: el equipo contesta 404, igual que el de verdad.
    if (catalogada === undefined) return respuestaDe(404, 'not found');
    if (sinSoporte.has(catalogada.proposito)) return respuestaDe(200, NO_SOPORTA);

    if (catalogada.proposito === 'escuchar los eventos que el equipo emite') {
      const respuesta = respuestaDe(200, '');
      Object.defineProperty(respuesta, 'body', { value: cuerpoDeFlujo(guion.flujo ?? []) });
      return respuesta;
    }

    if (catalogada.proposito === 'leer la identidad del equipo (modelo, firmware, serie)') {
      return respuestaDe(
        200,
        `<DeviceInfo><model>${guion.modelo ?? 'SIMULADO'}</model>` +
          `<firmwareVersion>${guion.firmware ?? 'V0.0.0'}</firmwareVersion></DeviceInfo>`,
      );
    }

    return respuestaDe(200, OK);
  }) as typeof fetch;
};
