/**
 * LO QUE LA CÁMARA PUBLICA EN EL ALARM SERVER, Y CÓMO SE ABRE.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * PROCEDENCIA DE CADA COSA DE ESTE FICHERO
 *
 * · La **forma del envío** —`multipart/form-data` con un XML y una o dos
 *   imágenes, publicado por el equipo sin firmar— está DOCUMENTADA, NO
 *   VERIFICADA: procede de la guía ISAPI del fabricante, no de una captura de
 *   este aparato. El repositorio prohíbe deducir por analogía, así que se dice.
 * · El **analizador de multipart** no es del fabricante: es RFC 2046, y eso sí
 *   es estándar.
 * · Los **nombres de las partes** (`anpr.xml`, `licensePlate.jpg`,
 *   `detectionPicture`) están DOCUMENTADOS, NO VERIFICADOS. Por eso **no se
 *   depende de ellos**: las partes se clasifican primero por su tipo de
 *   contenido, que es lo que ningún firmware cambia, y el nombre solo desempata.
 *
 * Lo que la ETAPA 15 confirma en sitio y lo que no, en `SELECTORES_A_CONFIRMAR`.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * SIN LIBRERÍA DE MULTIPART, Y POR LA MISMA RAZÓN QUE NO HAY UNA DE XML
 *
 * Este es el único extremo del sistema que acepta un cuerpo de un tercero que
 * **no presenta sesión**. Un analizador completo traería superficie que aquí no
 * hace falta: lo que llega es un sobre de forma conocida, pequeño y acotado.
 * Todo lo que entra está limitado por tamaño total, por número de partes y por
 * tamaño de parte, y ninguno de los tres límites es opcional.
 */

/** Techos del sobre. Un equipo sano queda muy por debajo de los tres. */
export const LIMITES = {
  /** El equipo publica una foto completa y un recorte. 8 MiB sobra. */
  cuerpoMaximoBytes: 8 * 1024 * 1024,
  /**
   * DIEZ, no ocho. La guía del fabricante enumera diez partes posibles —y con
   * varias del mismo tipo llegan con sufijo `_1`, `_2`—, así que el techo
   * anterior habría rechazado un sobre legítimo de un equipo bien configurado.
   * Sigue siendo un techo: lo que pase de aquí no es un evento, es un ataque.
   */
  partesMaximas: 12,
  /** El XML del evento son unos pocos KiB. */
  xmlMaximoBytes: 256 * 1024,
} as const;

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-16-1 · LAS DOS PARTES QUE NO PUEDEN ENTRAR · severidad ALTA
 *
 * El sobre admite diez partes y **dos son recortes de rostro**: el del
 * conductor y el del acompañante. Si la configuración del equipo los activa,
 * entran datos biométricos de personas que no dieron consentimiento, por un
 * canal que no pasa por el ciclo de la ETAPA 08 —calidad, consentimiento del
 * TITULAR, supresión programada— y que los dejaría en el almacén de evidencia
 * como si fueran la foto de una matrícula.
 *
 * Eso es RN-09, RN-10 y la Ley 1581 de 2012 a la vez, y el equipo puede
 * empezar a enviarlos **sin que nadie toque este código**: basta una casilla en
 * su interfaz.
 *
 * Por eso se rechazan AQUÍ y de forma explícita. Un adaptador que se limitara a
 * no clasificarlas las estaría aceptando: seguirían llegando, ocupando memoria
 * y a una edición de distancia de acabar guardadas. Se descartan, se CUENTAN, y
 * quien recibe el sobre registra el hecho como incidente de seguridad — porque
 * significa que hay un equipo mal configurado en la red.
 */
const PARTES_BIOMETRICAS = /^(pilot|copilot)Picture(_\d+)?(\.jpe?g)?$/i;

export const esParteBiometrica = (nombre: string | null, fichero: string | null): boolean =>
  PARTES_BIOMETRICAS.test((nombre ?? '').trim()) || PARTES_BIOMETRICAS.test((fichero ?? '').trim());

export interface ParteDeSobre {
  readonly nombre: string | null;
  readonly nombreDeFichero: string | null;
  readonly tipoDeContenido: string | null;
  readonly contenido: Buffer;
}

export class SobreIlegible extends Error {
  constructor(readonly detalle: string) {
    super(detalle);
    this.name = 'SobreIlegible';
  }
}

/**
 * Saca el separador del `content-type`. Admite la forma entrecomillada y la
 * desnuda, que las dos aparecen en la práctica.
 */
export const separadorDe = (tipoDeContenido: string | null | undefined): string | null => {
  if (typeof tipoDeContenido !== 'string') return null;
  if (!/multipart\/form-data/i.test(tipoDeContenido)) return null;
  const m = /boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(tipoDeContenido);
  const valor = m?.[1] ?? m?.[2];
  return valor === undefined || valor === '' ? null : valor;
};

const CRLF = Buffer.from('\r\n');

/** Cabeceras de una parte → mapa en minúsculas. */
const cabecerasDe = (crudo: string): Map<string, string> => {
  const mapa = new Map<string, string>();
  for (const linea of crudo.split(/\r?\n/)) {
    const corte = linea.indexOf(':');
    if (corte <= 0) continue;
    mapa.set(linea.slice(0, corte).trim().toLowerCase(), linea.slice(corte + 1).trim());
  }
  return mapa;
};

const parametroDe = (valor: string | undefined, nombre: string): string | null => {
  if (valor === undefined) return null;
  const m = new RegExp(`${nombre}\\s*=\\s*(?:"([^"]*)"|([^;]+))`, 'i').exec(valor);
  const encontrado = m?.[1] ?? m?.[2];
  return encontrado === undefined ? null : encontrado.trim();
};

/**
 * Divide el sobre en partes. Binario-seguro: el recorrido es sobre `Buffer`,
 * nunca sobre una cadena — pasar un JPEG por `toString('utf8')` lo corrompe y
 * el defecto no aparece hasta que alguien mira la evidencia.
 */
export const partirSobre = (cuerpo: Buffer, separador: string): readonly ParteDeSobre[] => {
  if (cuerpo.length > LIMITES.cuerpoMaximoBytes) {
    throw new SobreIlegible(`El envío supera ${String(LIMITES.cuerpoMaximoBytes)} bytes`);
  }

  const marca = Buffer.from(`--${separador}`);
  const partes: ParteDeSobre[] = [];

  let cursor = cuerpo.indexOf(marca);
  if (cursor === -1) throw new SobreIlegible('El envío no contiene el separador anunciado');

  while (cursor !== -1) {
    let inicio = cursor + marca.length;

    // `--` tras el separador cierra el sobre.
    if (cuerpo.slice(inicio, inicio + 2).toString('latin1') === '--') break;
    if (cuerpo.slice(inicio, inicio + 2).equals(CRLF)) inicio += 2;

    const siguiente = cuerpo.indexOf(marca, inicio);
    const finDeParte = siguiente === -1 ? cuerpo.length : siguiente;

    const corteDeCabeceras = cuerpo.indexOf(Buffer.from('\r\n\r\n'), inicio);
    if (corteDeCabeceras === -1 || corteDeCabeceras >= finDeParte) {
      throw new SobreIlegible('Una parte del envío no tiene cabeceras terminadas');
    }

    const cabeceras = cabecerasDe(cuerpo.slice(inicio, corteDeCabeceras).toString('latin1'));
    let finDeContenido = finDeParte;
    // El CRLF que precede al separador pertenece al delimitador, no al dato.
    if (finDeContenido >= 2 && cuerpo.slice(finDeContenido - 2, finDeContenido).equals(CRLF)) {
      finDeContenido -= 2;
    }

    const contenido = cuerpo.slice(corteDeCabeceras + 4, finDeContenido);
    const disposicion = cabeceras.get('content-disposition');

    partes.push({
      nombre: parametroDe(disposicion, 'name'),
      nombreDeFichero: parametroDe(disposicion, 'filename'),
      tipoDeContenido: cabeceras.get('content-type') ?? null,
      contenido,
    });

    if (partes.length > LIMITES.partesMaximas) {
      throw new SobreIlegible(`El envío trae más de ${String(LIMITES.partesMaximas)} partes`);
    }

    cursor = siguiente;
  }

  if (partes.length === 0) throw new SobreIlegible('El envío no trae ninguna parte');
  return partes;
};

// ─────────────────────────────────────────────────────────────────────────────
// CLASIFICACIÓN DE LAS PARTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * **Lo que hay que confirmar delante del equipo, escrito aquí y no en una nota
 * suelta.** El guion de puesta en marcha lo imprime y la guía lo cita: si algo
 * de esto no coincide con la captura real, se corrige AQUÍ y en ningún otro
 * sitio, porque ningún otro fichero conoce estos nombres.
 */
/** El separador de fábrica del equipo, confirmado en sitio. */
export const SEPARADOR_DE_FABRICA = '7e13971310878';

export const SELECTORES_A_CONFIRMAR = [
  'nombre de la parte del XML del evento (se supone que termina en «.xml»)',
  'nombre de la parte de la foto completa de la escena',
  'nombre de la parte del recorte de la placa',
  'etiqueta del número de placa dentro del XML (licensePlate / plateNumber)',
  'etiqueta de la confianza (confidenceLevel / confidence) y su escala',
  'si la confianza llega en 0-100 o en 0-1 en ESTE firmware',
] as const;

const esXml = (parte: ParteDeSobre): boolean =>
  /xml/i.test(parte.tipoDeContenido ?? '') ||
  /\.xml$/i.test(parte.nombreDeFichero ?? '') ||
  /\.xml$/i.test(parte.nombre ?? '');

const esImagen = (parte: ParteDeSobre): boolean =>
  /image\//i.test(parte.tipoDeContenido ?? '') ||
  /\.(jpe?g|png)$/i.test(parte.nombreDeFichero ?? '') ||
  /\.(jpe?g|png)$/i.test(parte.nombre ?? '');

/**
 * ¿Es esta imagen el RECORTE de la placa, o la escena completa?
 *
 * Se decide por nombre porque no hay otra cosa que mirar, y por eso **el
 * desempate va por tamaño**: el recorte siempre es el menor de los dos. Si los
 * nombres cambian de firmware, el tamaño sigue siendo cierto.
 */
const PISTAS_DE_RECORTE = /plate|licen[cs]e|cut|clip|small|vehiclepic/i;

export interface SobreDeAlarmServer {
  readonly xml: string;
  /** Escena completa, si vino. */
  readonly foto: Buffer | null;
  /** Recorte de la placa, si vino. */
  readonly recorte: Buffer | null;
  /** Partes que llegaron y no se supieron clasificar; se cuentan, no se tiran en silencio. */
  readonly partesNoClasificadas: number;
  /**
   * Cuántos recortes de rostro venían y se RECHAZARON (H-16-1). Cualquier
   * número distinto de cero es un equipo mal configurado en la red, no una
   * curiosidad estadística: quien recibe el sobre tiene que alertarlo.
   */
  readonly partesBiometricasRechazadas: number;
}

export const clasificarSobre = (partes: readonly ParteDeSobre[]): SobreDeAlarmServer => {
  // H-16-1 · PRIMERO se apartan los rostros, antes de clasificar nada. Si se
  // filtraran después, habría un instante en que una de ellas es «la imagen
  // más pequeña» y acaba de recorte de placa en el almacén de evidencia.
  const biometricas = partes.filter((p) => esParteBiometrica(p.nombre, p.nombreDeFichero));
  const admisibles = partes.filter((p) => !esParteBiometrica(p.nombre, p.nombreDeFichero));

  const xmls = admisibles.filter(esXml);
  const imagenes = admisibles.filter(esImagen);

  const primerXml = xmls[0];
  if (primerXml === undefined) {
    throw new SobreIlegible('El envío no trae ninguna parte con el XML del evento');
  }
  if (primerXml.contenido.length > LIMITES.xmlMaximoBytes) {
    throw new SobreIlegible('El XML del evento es desproporcionado');
  }

  let recorte: Buffer | null = null;
  let foto: Buffer | null = null;

  if (imagenes.length === 1) {
    // Una sola imagen es la escena: el recorte nunca viene solo.
    foto = imagenes[0]?.contenido ?? null;
  } else if (imagenes.length >= 2) {
    const porPista = imagenes.filter((i) =>
      PISTAS_DE_RECORTE.test(`${i.nombre ?? ''} ${i.nombreDeFichero ?? ''}`),
    );
    const candidato =
      porPista.length === 1
        ? porPista[0]
        : [...imagenes].sort((a, b) => a.contenido.length - b.contenido.length)[0];
    recorte = candidato?.contenido ?? null;
    foto = imagenes.find((i) => i !== candidato)?.contenido ?? null;
  }

  return {
    xml: primerXml.contenido.toString('utf8'),
    foto,
    recorte,
    partesNoClasificadas: admisibles.filter((p) => !esXml(p) && !esImagen(p)).length,
    partesBiometricasRechazadas: biometricas.length,
  };
};

/**
 * Entrada única desde la capa de presentación: sobre crudo → XML e imágenes.
 *
 * La API no conoce ninguno de los nombres de arriba, y esa es la condición de
 * KPI-11: lo que cruza esta frontera es «un evento y sus imágenes».
 */
export const abrirSobreDeAlarmServer = (
  cuerpo: Buffer,
  tipoDeContenido: string | null | undefined,
): SobreDeAlarmServer => {
  const separador = separadorDe(tipoDeContenido);
  if (separador === null) {
    throw new SobreIlegible('El envío no es un multipart con separador declarado');
  }
  return clasificarSobre(partirSobre(cuerpo, separador));
};
