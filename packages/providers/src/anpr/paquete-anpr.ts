import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { errorDominio, exito, fallo } from '@ncr/domain-core';
import type { EventoAnpr } from './evento-anpr';
import { analizarEventoAnpr } from './evento-anpr';

/**
 * El envío completo que el equipo hace al servidor de alarmas.
 *
 * Medido el 2026-09-14 contra la cámara instalada:
 *
 * - `POST` con `multipart/form-data`, unas tres partes y ~170 kB.
 * - Partes: `anpr.xml`, `detectionPicture.jpg` y `licensePlatePicture.jpg`.
 * - Cabecera `User-Agent` del cliente HTTP embebido del equipo.
 * - **Sin autenticación de ninguna clase.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESA ÚLTIMA LÍNEA ES LO MÁS IMPORTANTE DE ESTE ARCHIVO
 *
 * El equipo no firma nada. Cualquiera que alcance el puerto donde escucha el
 * servidor de alarmas puede inventarse un paso de vehículo con la matrícula que
 * quiera, y si esa entrada llegara a la ingesta tal cual, el sistema decidiría
 * sobre un hecho falso y lo guardaría como evento inmutable.
 *
 * Por eso la ingesta del proyecto **exige firma** y este paquete NO la produce:
 * el servidor de alarmas de la ETAPA 15 es un traductor con su propia frontera
 * —escucha acotada a la red de los equipos, origen contrastado contra el
 * dispositivo registrado, límite de tasa— y es él quien firma hacia dentro. Lo
 * que entra por aquí es entrada hostil hasta que se demuestre lo contrario.
 *
 * `capturePicSecurityCode` **no cambia nada de lo anterior**: no está
 * documentado como firma criptográfica ni hay clave con la que verificarlo, así
 * que se arrastra como metadato y no se usa como control de seguridad. Tratarlo
 * como autenticación sería peor que no tener nada, porque parecería que la hay.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface ParteDelPaquete {
  readonly nombre: string;
  readonly nombreDeArchivo: string | null;
  readonly tipo: string | null;
  readonly contenido: Uint8Array;
}

export interface PaqueteAnpr {
  readonly evento: EventoAnpr;
  /** Las imágenes tal como llegaron. La evidencia se sube al bucket privado (RN-21). */
  readonly imagenes: readonly ParteDelPaquete[];
}

/** Nombres de parte observados en el equipo real. */
export const PARTE_XML = 'anpr.xml';
export const PARTE_FOTO_COMPLETA = 'detectionPicture.jpg';
export const PARTE_FOTO_PLACA = 'licensePlatePicture.jpg';

const TEXTO = new TextDecoder('utf-8');
const BYTES = new TextEncoder();

/** Tope del cuerpo entero. El envío real ronda 170 kB; cuatro veces eso sobra. */
const MAXIMO_CUERPO = 8 * 1024 * 1024;

const indiceDe = (datos: Uint8Array, aguja: Uint8Array, desde: number): number => {
  for (let i = desde; i + aguja.length <= datos.length; i += 1) {
    let coincide = true;
    for (let j = 0; j < aguja.length; j += 1) {
      if (datos[i + j] !== aguja[j]) {
        coincide = false;
        break;
      }
    }
    if (coincide) return i;
  }
  return -1;
};

/**
 * Extrae el delimitador del `Content-Type`.
 *
 * El delimitador del equipo **empieza por guiones** —el fabricante usa la forma
 * clásica de los navegadores antiguos—, así que en el cuerpo aparece con DOS
 * guiones más delante. Partir por el valor del parámetro sin anteponerlos
 * encuentra coincidencias dentro de las propias imágenes: es un modo de fallo
 * silencioso que corrompe una parte binaria sin dar error.
 */
export const delimitadorDe = (tipoDeContenido: string): string | null => {
  const encontrado = /boundary=("?)([^";]+)\1/i.exec(tipoDeContenido);
  return encontrado === null ? null : encontrado[2]!.trim();
};

/**
 * Parte el cuerpo `multipart` en sus partes, **sin tocar los bytes**.
 *
 * Nada de decodificar el cuerpo entero a texto: una imagen JPEG pasada por
 * `toString('utf8')` queda destruida y el error aparece después, al escribir la
 * evidencia, lejos de donde se causó.
 */
export const partirPaquete = (
  cuerpo: Uint8Array,
  tipoDeContenido: string,
): Resultado<readonly ParteDelPaquete[], ErrorDominio> => {
  if (cuerpo.length > MAXIMO_CUERPO) {
    return fallo(errorDominio('DATO_INVALIDO', 'El envío excede el tamaño admitido'));
  }
  const delimitador = delimitadorDe(tipoDeContenido);
  if (delimitador === null) {
    return fallo(errorDominio('DATO_INVALIDO', 'El envío no declara delimitador de partes'));
  }

  const marca = BYTES.encode(`--${delimitador}`);
  const separadorDeCabeceras = BYTES.encode('\r\n\r\n');
  const partes: ParteDelPaquete[] = [];

  let cursor = indiceDe(cuerpo, marca, 0);
  if (cursor === -1) {
    return fallo(errorDominio('DATO_INVALIDO', 'El delimitador declarado no aparece en el cuerpo'));
  }

  while (cursor !== -1) {
    const inicio = cursor + marca.length;
    // `--` final: no hay más partes.
    if (cuerpo[inicio] === 0x2d && cuerpo[inicio + 1] === 0x2d) break;

    const siguiente = indiceDe(cuerpo, marca, inicio);
    const fin = siguiente === -1 ? cuerpo.length : siguiente;

    const corte = indiceDe(cuerpo, separadorDeCabeceras, inicio);
    if (corte === -1 || corte > fin) break;

    const cabeceras = TEXTO.decode(cuerpo.subarray(inicio, corte));
    let finalDelContenido = fin;
    // Se quita el CRLF que precede al delimitador siguiente; forma parte del
    // sobre, no del archivo.
    if (cuerpo[finalDelContenido - 1] === 0x0a && cuerpo[finalDelContenido - 2] === 0x0d) {
      finalDelContenido -= 2;
    }
    const contenido = cuerpo.subarray(corte + separadorDeCabeceras.length, finalDelContenido);

    const nombre = /name="([^"]*)"/i.exec(cabeceras)?.[1] ?? '';
    const archivo = /filename="([^"]*)"/i.exec(cabeceras)?.[1] ?? null;
    const tipo = /content-type:\s*([^\r\n;]+)/i.exec(cabeceras)?.[1]?.trim() ?? null;

    partes.push({
      nombre: nombre !== '' ? nombre : (archivo ?? ''),
      nombreDeArchivo: archivo,
      tipo,
      contenido: new Uint8Array(contenido),
    });

    cursor = siguiente;
  }

  return partes.length === 0
    ? fallo(errorDominio('DATO_INVALIDO', 'El envío no trae ninguna parte legible'))
    : exito(partes);
};

/** Reconoce la parte del XML por nombre de parte o por nombre de archivo. */
const esParteDeXml = (parte: ParteDelPaquete): boolean =>
  parte.nombre === PARTE_XML ||
  parte.nombreDeArchivo === PARTE_XML ||
  (parte.tipo ?? '').includes('xml') ||
  parte.nombre.endsWith('.xml');

/** Parte el envío y traduce su XML. Es el camino que recorre el equipo real. */
export const analizarPaqueteAnpr = (
  cuerpo: Uint8Array,
  tipoDeContenido: string,
): Resultado<PaqueteAnpr, ErrorDominio> => {
  const partes = partirPaquete(cuerpo, tipoDeContenido);
  if (!partes.ok) return partes;

  const xml = partes.valor.find(esParteDeXml);
  if (xml === undefined) {
    return fallo(errorDominio('DATO_INVALIDO', 'El envío no trae la parte XML del evento'));
  }

  const evento = analizarEventoAnpr(TEXTO.decode(xml.contenido));
  if (!evento.ok) return evento;

  return exito({
    evento: evento.valor,
    imagenes: partes.valor.filter((p) => !esParteDeXml(p)),
  });
};
