import { createHash, randomBytes } from 'node:crypto';
import type { RutaDeEquipo } from '../equipo/tipos-de-ruta';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ANEXO 15-K · LO QUE LOS EQUIPOS HICIERON EN SITIO, EN EL SIMULADO
 *
 * Demostrado el 26/09/2026 delante de la terminal (V4.47.0) y del videoportero
 * (V2.3.9). Un simulado más amable que el equipo deja pasar exactamente los
 * defectos que la visita encontró, así que estos tres comportamientos son del
 * simulado por omisión, no un modo especial:
 *
 *  1. **H-SITIO-15 · el cuerpo se valida ANTES de autenticar.** Una escritura
 *     con el cuerpo VACÍO recibe `400 badXmlContent` (errorCode 1610612739) sin
 *     llegar al desafío Digest. Es lo que le pasa a un cliente que sondea el
 *     desafío con el cuerpo vacío —`curl --digest` lo hace—: nunca se autentica.
 *  2. **H-SITIO-13 · «OK» sin accionar.** La apertura remota sin el espacio de
 *     nombres ISAPI ni `version="2.0"` contesta `statusCode 1 OK` y el relé NO
 *     se mueve. Con ellos, abre.
 *  3. **H-SITIO-12 · el nonce vence.** Un resumen correcto con un nonce vencido
 *     o con un `nc` repetido recibe `401` con `stale="TRUE"`; uno incorrecto,
 *     `stale="FALSE"`: eso sí es la clave.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const ESPACIO_ISAPI = 'http://www.isapi.org/ver20/XMLSchema';

/**
 * H-SITIO-15 · lo que contestó la terminal a un cuerpo vacío: `badXmlContent`
 * con el errorCode 1610612739 (0x60000003). El `statusCode 6` es un
 * [SUPUESTO] S-63 de esta simulación: el anexo de sitio no lo recoge, y es el que la
 * guía asigna a «Invalid Content».
 */
export const CONTENIDO_XML_MALO =
  `<?xml version="1.0" encoding="UTF-8"?><ResponseStatus version="2.0" xmlns="${ESPACIO_ISAPI}">` +
  '<statusCode>6</statusCode><statusString>Invalid Content</statusString>' +
  '<subStatusCode>badXmlContent</subStatusCode><errorCode>1610612739</errorCode>' +
  '<errorMsg>badXmlContent</errorMsg></ResponseStatus>';

/** Escrituras que el equipo acepta SIN cuerpo: las del canal de audio. */
const ESCRITURA_SIN_CUERPO = /canal de audio|audio al equipo|audio del equipo/;

/** ¿Exige esta escritura un cuerpo? Las lecturas y el canal de audio, no. */
export const exigeCuerpo = (ruta: RutaDeEquipo, metodo: string): boolean =>
  metodo !== 'GET' && !ESCRITURA_SIN_CUERPO.test(ruta.proposito);

export const cuerpoVacio = (cuerpo: unknown): boolean =>
  cuerpo === undefined ||
  cuerpo === null ||
  (typeof cuerpo === 'string' && cuerpo.length === 0) ||
  (cuerpo instanceof Uint8Array && cuerpo.byteLength === 0);

export type DesenlaceDeApertura = 'acciona' | 'ok_sin_accionar' | 'mal_formada';

/**
 * H-SITIO-13 · cómo trata el equipo el cuerpo de una apertura remota. El
 * atributo que falta es lo que decide: con el mismo `<cmd>open</cmd>`, el
 * documento sin espacio de nombres ni versión se contesta «OK» y no abre.
 */
export const desenlaceDeApertura = (cuerpo: string): DesenlaceDeApertura => {
  const raiz = /<RemoteControlDoor\b([^>]*)>/.exec(cuerpo);
  if (raiz === null || !/<cmd>\s*open\s*<\/cmd>/.test(cuerpo)) return 'mal_formada';
  const atributos = raiz[1] ?? '';
  return atributos.includes(`xmlns="${ESPACIO_ISAPI}"`) && /version="2\.0"/.test(atributos)
    ? 'acciona'
    : 'ok_sin_accionar';
};

/**
 * Lo que el simulado ACCIONÓ de verdad y lo que rechazó por cuerpo vacío, por
 * rótulo de equipo (`destino`). Es el oráculo del recorrido de la consola: la
 * consola dice «aceptada» en los dos casos de H-SITIO-13, y sólo el equipo
 * sabe si el relé se movió.
 */
export const aperturasFisicasPor = new Map<string, number>();
/** 15-P · P3 · qué PUERTA abrió cada orden aceptada, por rótulo del equipo. */
export const puertasAbiertasPor = new Map<string, number[]>();
export const escriturasSinCuerpoPor = new Map<string, number>();

export const anotarEn = (mapa: Map<string, number>, destino: string | undefined): void => {
  if (destino === undefined) return;
  mapa.set(destino, (mapa.get(destino) ?? 0) + 1);
};

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-12 · EL DIGEST DE UN EQUIPO CUYO NONCE VENCE
 *
 * Por omisión el nonce vale 20 s de reloj ([SUPUESTO] S-64), del orden de lo que se vio en sitio
 * (la segunda orden, entre 9 y 35 s después de la primera, se rechazó). Un
 * cliente sin credencial recibe el nonce VIGENTE: dos clientes del mismo equipo
 * lo comparten sin saberlo. Rota una sola vez al vencer, así que las
 * peticiones que llegan juntas se renegocian contra el mismo nonce nuevo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface PoliticaDeNonceDelEquipo {
  /** Vigencia del nonce en ms. Por omisión, 20 000. */
  readonly vigenciaMs?: number;
  /** Peticiones que admite un nonce. Por omisión, sin límite. */
  readonly usosMaximos?: number;
  readonly ahora?: () => number;
  /**
   * E1 (15-M) · cómo contesta a un resumen correcto sobre un nonce que ya no
   * vale: `stale` (RFC), `sin_desafio` (401 sin `WWW-Authenticate`, la
   * terminal del 28/09) o `stale_false` (el videoportero del 28/09).
   */
  readonly alVencer?: 'stale' | 'sin_desafio' | 'stale_false';
}

export type AccesoDigest = 'autenticado' | 'sin_credencial' | 'clave' | 'vencido';

/** E1 · cuántos 401 dio el equipo simulado y por qué; el oráculo de C8. */
export interface DesafiosDelEquipo {
  readonly primero: number;
  readonly vencido: number;
  readonly clave: number;
}

/** Lo que el equipo contesta cuando NO autentica: cabeceras y cuerpo. */
export interface RechazoDigest {
  readonly cabeceras: Record<string, string>;
  readonly cuerpo: string;
}

const CUERPO_401 = '<userCheck><statusValue>401</statusValue></userCheck>';

const md5 = (t: string): string => createHash('md5').update(t, 'utf8').digest('hex');

const campo = (autorizacion: string, nombre: string): string =>
  new RegExp(`${nombre}="?([^",]+)"?`).exec(autorizacion)?.[1] ?? '';

export class DigestDelEquipo {
  private nonce: string | null = null;
  private emitidoEn = 0;
  private usos = 0;
  private readonly ncUsados = new Set<string>();
  private readonly ahora: () => number;
  private readonly desafios = { primero: 0, vencido: 0, clave: 0 };

  constructor(
    private readonly usuario: string,
    private readonly clave: string,
    private readonly reino: string,
    private readonly politica: PoliticaDeNonceDelEquipo = {},
  ) {
    this.ahora = politica.ahora ?? (() => Date.now());
  }

  private vencido(): boolean {
    const vigencia = this.politica.vigenciaMs ?? 20_000;
    if (this.ahora() - this.emitidoEn > vigencia) return true;
    return this.politica.usosMaximos !== undefined && this.usos >= this.politica.usosMaximos;
  }

  /** El nonce vigente; si venció, rota UNA vez y todos reciben el nuevo. */
  private vigente(): string {
    if (this.nonce === null || this.vencido()) {
      this.nonce = randomBytes(8).toString('hex');
      this.emitidoEn = this.ahora();
      this.usos = 0;
      this.ncUsados.clear();
    }
    return this.nonce;
  }

  cabeceraDeDesafio(stale: boolean): string {
    return (
      `Digest realm="${this.reino}", nonce="${this.vigente()}", qop="auth", ` +
      `stale="${stale ? 'TRUE' : 'FALSE'}"`
    );
  }

  estadisticas(): DesafiosDelEquipo {
    return { ...this.desafios };
  }

  /**
   * E1 · la respuesta a un acceso que no autenticó. Un nonce vencido se
   * contesta según `alVencer`; una clave mala, con el cuerpo `userCheck`, y
   * con el bloqueo declarado si el guion dice cuánto dura.
   */
  rechazo(
    acceso: Exclude<AccesoDigest, 'autenticado'>,
    bloqueoSegundos: number | null,
  ): RechazoDigest {
    if (acceso === 'sin_credencial') {
      this.desafios.primero += 1;
      return {
        cabeceras: { 'www-authenticate': this.cabeceraDeDesafio(false) },
        cuerpo: CUERPO_401,
      };
    }
    if (acceso === 'vencido') {
      this.desafios.vencido += 1;
      const modo = this.politica.alVencer ?? 'stale';
      if (modo === 'sin_desafio') return { cabeceras: {}, cuerpo: CUERPO_401 };
      return {
        cabeceras: { 'www-authenticate': this.cabeceraDeDesafio(modo === 'stale') },
        cuerpo: CUERPO_401,
      };
    }
    this.desafios.clave += 1;
    const cuerpo =
      bloqueoSegundos === null
        ? CUERPO_401
        : '<userCheck><statusValue>401</statusValue><statusString>Unauthorized</statusString>' +
          `<lockStatus>lock</lockStatus><retryTimes>0</retryTimes><unlockTime>${String(bloqueoSegundos)}</unlockTime></userCheck>`;
    return { cabeceras: { 'www-authenticate': this.cabeceraDeDesafio(false) }, cuerpo };
  }

  comprobar(autorizacion: string | null, metodo: string): AccesoDigest {
    if (autorizacion === null || !/^digest /i.test(autorizacion)) return 'sin_credencial';
    const nonceUsado = campo(autorizacion, 'nonce');
    const nc = campo(autorizacion, 'nc');
    const qop = campo(autorizacion, 'qop');
    const ha1 = md5(`${this.usuario}:${this.reino}:${this.clave}`);
    const ha2 = md5(`${metodo}:${campo(autorizacion, 'uri')}`);
    const esperado =
      qop === ''
        ? md5(`${ha1}:${nonceUsado}:${ha2}`)
        : md5(`${ha1}:${nonceUsado}:${nc}:${campo(autorizacion, 'cnonce')}:${qop}:${ha2}`);
    if (campo(autorizacion, 'response') !== esperado) return 'clave';
    // El resumen es bueno: lo que falle ahora es el nonce, no la clave.
    if (nonceUsado !== this.vigente()) return 'vencido';
    // Sin `qop` no hay `nc` (RFC 2617): un cliente antiguo no se trata como réplica.
    if (qop !== '' && this.ncUsados.has(nc)) return 'vencido';
    if (qop !== '') this.ncUsados.add(nc);
    this.usos += 1;
    return 'autenticado';
  }
}
