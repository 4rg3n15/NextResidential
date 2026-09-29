import { createHash, randomBytes } from 'node:crypto';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-12 · UN SERVIDOR DIGEST QUE VENCE EL NONCE, COMO EL EQUIPO
 *
 * El simulado anterior servía siempre el mismo nonce, eterno: ningún cliente
 * se veía obligado a renegociar a mitad de sesión, y el defecto de sitio —la
 * primera orden aceptada, la siguiente rechazada como «usuario o clave»— no se
 * podía reproducir. Éste se comporta como un equipo estricto:
 *
 *  · el nonce vence por TIEMPO y por USOS; vencido, contesta `401` con uno
 *    nuevo y `stale="TRUE"` si el resumen era correcto;
 *  · lleva la cuenta de `nc` por nonce y rechaza uno repetido o menor;
 *  · emitir un nonce nuevo invalida el anterior (UNO vigente por equipo);
 *  · una clave errónea contesta `401` con `stale="FALSE"`.
 *
 * Envuelve a un manejador: lo que pasa la autenticación, lo atiende él.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface PoliticaDeNonce {
  /** Vigencia del nonce en ms, medida con `ahora`. Por omisión, sin límite. */
  readonly vigenciaMs?: number;
  /** Peticiones que admite un nonce antes de vencer. Por omisión, sin límite. */
  readonly usosMaximos?: number;
  /**
   * `true`: mientras el nonce vigente no venza, se lo da a TODO el que llegue
   * sin credencial —como un equipo que deriva el nonce del reloj y la IP—. Es
   * el caso en que dos clientes del mismo equipo comparten nonce sin saberlo
   * y cada uno lleva su propio `nc`: el segundo repite números ya usados.
   */
  readonly reutilizaNonceVigente?: boolean;
  readonly ahora?: () => number;
  /**
   * E1 (15-M) · cómo contesta a un resumen CORRECTO sobre un nonce que ya no
   * vale. `stale` (por omisión): `401` con desafío nuevo y `stale="TRUE"`,
   * como manda la RFC. `sin_desafio`: `401` SIN `WWW-Authenticate` (la
   * terminal del 28/09). `stale_false`: `401` con desafío y `stale="FALSE"`,
   * indistinguible de una clave mala (el videoportero del 28/09).
   */
  readonly alVencer?: 'stale' | 'sin_desafio' | 'stale_false';
  /**
   * E1-f · con la clave mala, el equipo declara la cuenta bloqueada por
   * estos segundos en el cuerpo (`lockStatus`/`unlockTime`).
   */
  readonly bloqueaPorSegundos?: number;
}

export interface EstadisticasDigest {
  /** `401` enviados, por motivo. */
  readonly desafios: { primero: number; vencido: number; repetido: number; clave: number };
  /** Peticiones autenticadas que llegaron al manejador. */
  readonly atendidas: number;
  readonly noncesEmitidos: number;
}

const md5 = (t: string): string => createHash('md5').update(t, 'utf8').digest('hex');

const valor = (autorizacion: string, nombre: string): string =>
  new RegExp(`${nombre}="?([^",]+)"?`).exec(autorizacion)?.[1] ?? '';

export const servidorDigest = (opciones: {
  readonly usuario: string;
  readonly clave: string;
  readonly reino?: string;
  readonly politica?: PoliticaDeNonce;
  readonly atender: (entrada: string | URL, init?: RequestInit) => Promise<Response>;
}): { readonly peticion: typeof fetch; readonly estadisticas: () => EstadisticasDigest } => {
  const reino = opciones.reino ?? 'equipo-simulado';
  const ahora = opciones.politica?.ahora ?? (() => Date.now());
  let nonce: string | null = null;
  let emitidoEn = 0;
  let usos = 0;
  let ultimoNc = 0;
  let emitidos = 0;
  let atendidas = 0;
  const desafios = { primero: 0, vencido: 0, repetido: 0, clave: 0 };

  const emitir = (): string => {
    nonce = randomBytes(8).toString('hex');
    emitidoEn = ahora();
    usos = 0;
    ultimoNc = 0;
    emitidos += 1;
    return nonce;
  };

  const CUERPO_401 = '<userCheck><statusValue>401</statusValue></userCheck>';
  const cuerpoBloqueado = (segundos: number): string =>
    '<userCheck><statusValue>401</statusValue><statusString>Unauthorized</statusString>' +
    `<lockStatus>lock</lockStatus><retryTimes>0</retryTimes><unlockTime>${String(segundos)}</unlockTime></userCheck>`;

  const desafio = (stale: boolean, mismoNonce = false, cuerpo = CUERPO_401): Response =>
    new Response(cuerpo, {
      status: 401,
      headers: {
        'www-authenticate':
          `Digest qop="auth", realm="${reino}", ` +
          `nonce="${mismoNonce && nonce !== null ? nonce : emitir()}", ` +
          `stale="${stale ? 'TRUE' : 'FALSE'}"`,
      },
    });

  /** E1 · el 401 a un nonce que ya no vale, según lo que el equipo haga. */
  const nonceRechazado = (): Response => {
    const modo = opciones.politica?.alVencer ?? 'stale';
    if (modo === 'sin_desafio') return new Response(CUERPO_401, { status: 401 });
    return desafio(modo === 'stale');
  };

  const reutilizable = (): boolean =>
    opciones.politica?.reutilizaNonceVigente === true && nonce !== null && !vencido();

  const vencido = (): boolean => {
    const p = opciones.politica;
    if (p?.vigenciaMs !== undefined && ahora() - emitidoEn > p.vigenciaMs) return true;
    return p?.usosMaximos !== undefined && usos >= p.usosMaximos;
  };

  const resumenCorrecto = (autorizacion: string, metodo: string, nonceUsado: string): boolean => {
    const ha1 = md5(`${opciones.usuario}:${reino}:${opciones.clave}`);
    const ha2 = md5(`${metodo}:${valor(autorizacion, 'uri')}`);
    const esperado = md5(
      `${ha1}:${nonceUsado}:${valor(autorizacion, 'nc')}:${valor(autorizacion, 'cnonce')}:` +
        `${valor(autorizacion, 'qop')}:${ha2}`,
    );
    return valor(autorizacion, 'response') === esperado;
  };

  const peticion = (async (entrada: string | URL, init?: RequestInit): Promise<Response> => {
    const cabeceras = new Headers(init?.headers);
    const autorizacion = cabeceras.get('authorization');
    const metodo = init?.method ?? 'GET';
    if (autorizacion === null || !/^digest /i.test(autorizacion)) {
      desafios.primero += 1;
      return desafio(false, reutilizable());
    }
    const nonceUsado = valor(autorizacion, 'nonce');
    if (!resumenCorrecto(autorizacion, metodo, nonceUsado)) {
      desafios.clave += 1;
      const bloqueo = opciones.politica?.bloqueaPorSegundos;
      return desafio(false, false, bloqueo === undefined ? CUERPO_401 : cuerpoBloqueado(bloqueo));
    }
    // El resumen es bueno: lo que falle ahora es el nonce, no la clave.
    if (nonceUsado !== nonce || vencido()) {
      desafios.vencido += 1;
      return nonceRechazado();
    }
    const nc = parseInt(valor(autorizacion, 'nc'), 16);
    if (Number.isNaN(nc) || nc <= ultimoNc) {
      desafios.repetido += 1;
      // Un `nc` repetido no vence el nonce: el equipo contesta con el MISMO.
      return desafio(true, reutilizable());
    }
    ultimoNc = nc;
    usos += 1;
    atendidas += 1;
    return opciones.atender(entrada, init);
  }) as typeof fetch;

  return {
    peticion,
    estadisticas: () => ({ desafios: { ...desafios }, atendidas, noncesEmitidos: emitidos }),
  };
};
