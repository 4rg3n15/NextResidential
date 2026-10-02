/**
 * Q2 (15-Q) · LA CACHÉ DE REGLAS SE LLENA SOLA · cierra S-24
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * Hasta la 15-Q `descargarReglas()` sólo la llamaban las pruebas: en un Edge
 * instalado la caché nunca se llenaba y, al cortarse el WAN, toda decisión iba
 * a la contingencia (denegar). Ahora se descarga:
 *
 *  · al arrancar, en cuanto hay enlace;
 *  · cada `REGLAS_DESCARGA_SEGUNDOS` mientras lo haya;
 *  · y EN EL ACTO al recuperar el WAN, que es cuando más probable es que las
 *    reglas hayan cambiado sin que el Edge se enterara.
 *
 * Tres reglas que no se negocian:
 *  1. La versión SÓLO AVANZA: la caché rechaza una igual o menor (RN-16). Una
 *     nube que contesta con una versión menor es una base restaurada, y eso se
 *     dice; no se retrocede en silencio.
 *  2. Lo que no se puede usar no se guarda: una instantánea a medias o cuyo
 *     hash no corresponde a su contenido se descarta y se sigue con la anterior.
 *  3. «Sin cambios» renueva la FE DE VIDA (`generadaEn`) de la versión que ya
 *     se tiene: KPI-31 marca lo decidido con reglas que la nube no confirmó
 *     hace tiempo, no lo decidido con reglas descargadas hace tiempo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { createHash } from 'node:crypto';
import { instantaneaUsable } from './instantanea-de-reglas';
import type { InstantaneaDeReglas, ReglasVigentes } from './instantanea-de-reglas';
import type { CacheDeReglas, ClienteDeNube } from './puertos';

/** Renueva `generadaEn` de la versión vigente; `false` si no era esa versión. */
export interface FeDeVidaDeReglas {
  revalidar(copropiedadId: string, version: number, generadaEn: string): boolean;
}

export type ResultadoDeDescarga =
  | { readonly estado: 'nueva' | 'vigente'; readonly version: number }
  | {
      readonly estado: 'sin_respuesta' | 'rechazada' | 'error';
      readonly version: number | null;
      readonly detalle: string;
    };

export interface OpcionesDeDescarga {
  readonly copropiedadId: string;
  readonly cadaSegundos: number;
}

/**
 * El hash de la nube es SHA-256 del contenido serializado en el orden en que
 * viaja, sin los cuatro campos de cabecera. Quitarlos de lo recibido y volver a
 * serializar reproduce exactamente esos bytes: `JSON.parse` conserva el orden.
 */
export const hashDelContenido = (instantanea: InstantaneaDeReglas): string => {
  const contenido: Record<string, unknown> = { ...instantanea };
  for (const cabecera of ['copropiedadId', 'version', 'hash', 'generadaEn']) {
    delete contenido[cabecera];
  }
  return createHash('sha256').update(JSON.stringify(contenido)).digest('hex');
};

const esVigente = (r: InstantaneaDeReglas | ReglasVigentes): r is ReglasVigentes =>
  (r as ReglasVigentes).sinCambios === true;

export class DescargaDeReglas {
  private ultimoIntento: number | null = null;

  constructor(
    private readonly nube: ClienteDeNube,
    private readonly cache: CacheDeReglas,
    private readonly feDeVida: FeDeVidaDeReglas,
    private readonly opciones: OpcionesDeDescarga,
  ) {}

  /** ¿Toca descargar? Al recuperar el WAN, siempre; si no, cada `cadaSegundos`. */
  toca(ahora: Date, recienRecuperado: boolean): boolean {
    if (recienRecuperado || this.ultimoIntento === null) return true;
    return ahora.getTime() - this.ultimoIntento >= this.opciones.cadaSegundos * 1000;
  }

  async ejecutar(ahora: Date): Promise<ResultadoDeDescarga> {
    this.ultimoIntento = ahora.getTime();
    const actual = this.cache.vigente(this.opciones.copropiedadId);
    const version = actual !== null && instantaneaUsable(actual) ? actual.version : 0;
    let respuesta: InstantaneaDeReglas | ReglasVigentes | null;
    try {
      respuesta = await this.nube.descargarReglas(this.opciones.copropiedadId, version);
    } catch (e) {
      return {
        estado: 'error',
        version: version || null,
        detalle: e instanceof Error ? e.message : String(e),
      };
    }
    if (respuesta === null) {
      return {
        estado: 'sin_respuesta',
        version: version || null,
        detalle: 'la nube no dio nada útil',
      };
    }
    if (esVigente(respuesta)) {
      this.feDeVida.revalidar(this.opciones.copropiedadId, respuesta.version, respuesta.generadaEn);
      return { estado: 'vigente', version: respuesta.version };
    }
    return this.guardar(respuesta, version);
  }

  private guardar(nueva: InstantaneaDeReglas, actual: number): ResultadoDeDescarga {
    if (!instantaneaUsable(nueva)) {
      return { estado: 'rechazada', version: actual || null, detalle: 'instantánea incompleta' };
    }
    if (nueva.hash !== undefined && hashDelContenido(nueva) !== nueva.hash) {
      return {
        estado: 'rechazada',
        version: actual || null,
        detalle: 'el hash no corresponde al contenido: se sigue con la versión anterior',
      };
    }
    if (!this.cache.guardar(nueva)) {
      return {
        estado: 'rechazada',
        version: actual || null,
        detalle: `la nube ofreció la versión ${String(nueva.version)} y la caché tiene la ${String(actual)}: la versión sólo avanza`,
      };
    }
    return { estado: 'nueva', version: nueva.version };
  }
}
