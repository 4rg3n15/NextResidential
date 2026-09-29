import type { CapacidadDeBiblioteca, EstadoDeCapacidad } from '../nucleo/capacidades';
import { resumenIsapi } from '../equipo/errores-del-fabricante';
import { recuentoDeLaBiblioteca } from '../terminal/recuento-de-biblioteca';
import { listaDeclarada } from '../terminal/forma-del-alta';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * F4 (corrección de la 15-L) · ROSTROS Y PERSONAS, CON SU ORDEN DE RESPALDO Y
 * CON EL MOTIVO DE LO QUE NO SE PUDO LEER
 *
 * En sitio, el videoportero (serie «Ultra») dejó `bibliotecaDeRostros` y
 * `gestionDePersonas` en «desconocida», y nadie supo por qué: el descubrimiento
 * tiraba lo que el equipo contestó. Dos correcciones:
 *
 *  1. **La ruta de cada pregunta.** Las personas se preguntaban a las
 *     capacidades GENERALES de control de acceso; la pregunta tiene ruta propia
 *     en el catálogo —«leer qué admite la gestión de personas»—. Ahora va
 *     primero la dedicada y la general queda de respaldo (es la que se usaba, y
 *     la terminal la lee de todos modos para la verificación remota).
 *  2. **El motivo.** Lo que no se pudo leer lleva la razón en palabras —el
 *     estado HTTP y el `subStatusCode` que dio el equipo, a qué pregunta—, y la
 *     ficha lo enseña: «no se pudo leer (el equipo contestó HTTP 400
 *     (badParameters) a «leer qué admite la biblioteca de rostros»)».
 *
 * ORDEN DE RESPALDO, en las DOS familias (terminal y videoportero):
 *
 * | Capacidad          | 1.ª consulta                                  | 2.ª consulta                                     |
 * | ------------------ | --------------------------------------------- | ------------------------------------------------ |
 * | biblioteca         | «leer qué admite la biblioteca de rostros»    | «contar las plantillas de la biblioteca…»        |
 * | personas           | «leer qué admite la gestión de personas»      | «capacidades de control de acceso de la terminal»|
 *
 * Cualquiera que conteste → `si`. Las dos «no lo admito» (404/notSupport) →
 * `no` en el VIDEOPORTERO (NO APLICA, H-SITIO-09) y `desconocida` en la
 * TERMINAL: rostros y personas son su razón de ser, y un «no» a una ruta
 * DOCUMENTADA dice que ese firmware no lo declara por ahí, no que no pueda.
 *
 * `[SUPUESTO]` S-101: que el videoportero de la serie IP/Ultra conteste las
 * rutas de personas y de biblioteca del catálogo de la terminal. El catálogo las
 * respalda para las series Value e IP/Ultra en «Face Picture Search» y «Person
 * Deleting»; la de capacidades de personas sólo para la serie Value. Se
 * confirma en sitio con `pnpm sitio:ensayo`: el motivo dice qué contestó.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface RespuestaDeCapacidad {
  readonly cuerpo: string | null;
  /** 404 o «notSupport»: el equipo dijo que no lo admite por esa ruta. */
  readonly noAdmite: boolean;
  /** Por qué no hay cuerpo, en palabras. `null` cuando lo hay. */
  readonly motivo: string | null;
}

/** Pregunta del catálogo de la terminal, ya ligada al equipo. */
export type ConsultaDeCapacidad = (proposito: string) => Promise<RespuestaDeCapacidad>;

export const PREGUNTA_DE_BIBLIOTECA = 'leer qué admite la biblioteca de rostros';
export const PREGUNTA_DE_RECUENTO = 'contar las plantillas de la biblioteca de rostros';
export const PREGUNTA_DE_PERSONAS = 'leer qué admite la gestión de personas';
export const PREGUNTA_DE_CONTROL_DE_ACCESO = 'capacidades de control de acceso de la terminal';

/**
 * «el equipo contestó HTTP 400 (badParameters) a «…»». El código va DENTRO de
 * una frase: a secas no le dice nada a quien está delante del equipo.
 */
export const motivoDeLaRespuesta = (
  proposito: string,
  estadoHttp: number,
  cuerpo: string,
): string => {
  const r = resumenIsapi(cuerpo);
  const codigo = r.subStatusCode ?? r.errorMsg ?? r.statusString;
  const porque =
    estadoHttp === 404
      ? ' (esa ruta no existe en este firmware)'
      : codigo !== null
        ? ` (${codigo})`
        : ' sin decir por qué';
  return `el equipo contestó HTTP ${String(estadoHttp)}${porque} a «${proposito}»`;
};

const unir = (respuestas: readonly RespuestaDeCapacidad[]): string =>
  respuestas
    .map((r) => r.motivo)
    .filter((m): m is string => m !== null)
    .join(' · ');

/**
 * Biblioteca de rostros: cuántas plantillas caben y cuántas hay.
 *
 * La segunda cifra es la que hace VERIFICABLE una supresión (RN-11): después
 * de suprimir, el recuento tiene que bajar. Un `OK` a la orden no lo demuestra.
 */
export const bibliotecaDesde = (
  capacidadesJson: string | null,
  recuentoJson: string | null,
): CapacidadDeBiblioteca => {
  const maximo = ((): number | null => {
    if (capacidadesJson === null) return null;
    try {
      const raiz: unknown = JSON.parse(capacidadesJson);
      const cap =
        typeof raiz === 'object' && raiz !== null
          ? (raiz as Record<string, unknown>)['FDLibCap']
          : undefined;
      const valor =
        typeof cap === 'object' && cap !== null
          ? (cap as Record<string, unknown>)['maxFDRecordNum']
          : undefined;
      const crudo =
        typeof valor === 'object' && valor !== null && '@max' in valor
          ? (valor as Record<string, unknown>)['@max']
          : valor;
      return typeof crudo === 'number' && Number.isFinite(crudo) ? crudo : null;
    } catch {
      return null;
    }
  })();
  // Anexo 15-K · `recordDataNumber` de la biblioteca, como la guía («Face
  // Picture Search»); `totalNum` es la forma anterior, que se sigue leyendo.
  const almacenadas = recuentoDeLaBiblioteca(recuentoJson);
  // E3 (15-M) · qué operaciones declara (`post`, `setUp`…) `[SUPUESTO]` S-109.
  const operaciones = listaDeclarada(campoDe(capacidadesJson, 'FDLibCap', 'supportFunction'));
  return {
    estado: capacidadesJson === null && recuentoJson === null ? 'desconocida' : 'si',
    maximo,
    almacenadas,
    ...(operaciones === undefined ? {} : { operaciones }),
  };
};

/** `raiz[a][b]` de un JSON, o `undefined` si no es JSON o no está. */
const campoDe = (json: string | null, a: string, b: string): unknown => {
  if (json === null) return undefined;
  try {
    const raiz: unknown = JSON.parse(json);
    const nivel =
      typeof raiz === 'object' && raiz !== null ? (raiz as Record<string, unknown>)[a] : undefined;
    return typeof nivel === 'object' && nivel !== null
      ? (nivel as Record<string, unknown>)[b]
      : undefined;
  } catch {
    return undefined;
  }
};

export const descubrirBiblioteca = async (
  consultar: ConsultaDeCapacidad,
  familia: 'terminal' | 'videoportero',
): Promise<CapacidadDeBiblioteca> => {
  const capacidad = await consultar(PREGUNTA_DE_BIBLIOTECA);
  const recuento = await consultar(PREGUNTA_DE_RECUENTO);
  if (capacidad.cuerpo !== null || recuento.cuerpo !== null) {
    return bibliotecaDesde(capacidad.cuerpo, recuento.cuerpo);
  }
  if (familia === 'videoportero' && capacidad.noAdmite && recuento.noAdmite) {
    return { estado: 'no', maximo: null, almacenadas: null };
  }
  return {
    estado: 'desconocida',
    maximo: null,
    almacenadas: null,
    motivo: unir([capacidad, recuento]),
  };
};

export interface PersonasDescubiertas {
  readonly estado: EstadoDeCapacidad;
  /** Sólo con `desconocida`: por qué. */
  readonly motivo: string | null;
  /** E3 (15-M) · los `userType` que declara la consulta dedicada, si los dice. */
  readonly tipos?: readonly string[];
}

/**
 * `controlDeAcceso`: la respuesta a las capacidades generales si ya se leyó
 * (la terminal la lee para la verificación remota); así no se pregunta dos
 * veces lo mismo.
 */
export const descubrirPersonas = async (
  consultar: ConsultaDeCapacidad,
  familia: 'terminal' | 'videoportero',
  controlDeAcceso?: RespuestaDeCapacidad,
): Promise<PersonasDescubiertas> => {
  const dedicada = await consultar(PREGUNTA_DE_PERSONAS);
  if (dedicada.cuerpo !== null) {
    const tipos = listaDeclarada(campoDe(dedicada.cuerpo, 'UserInfo', 'userType'));
    return { estado: 'si', motivo: null, ...(tipos === undefined ? {} : { tipos }) };
  }
  const general = controlDeAcceso ?? (await consultar(PREGUNTA_DE_CONTROL_DE_ACCESO));
  if (general.cuerpo !== null) return { estado: 'si', motivo: null };
  if (familia === 'videoportero' && dedicada.noAdmite && general.noAdmite) {
    return { estado: 'no', motivo: null };
  }
  return { estado: 'desconocida', motivo: unir([dedicada, general]) };
};
