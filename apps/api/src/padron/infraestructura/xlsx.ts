import { inflateRawSync } from 'node:zlib';

/**
 * Lector de XLSX **mínimo y acotado**, escrito a mano y sin dependencias.
 *
 * **Por qué no se usa una biblioteca.** D-20t difirió esta carga con un motivo
 * escrito: «un analizador binario es superficie de ataque». Traer un lector
 * genérico de XLSX añade miles de líneas que hay que auditar y actualizar, y
 * su superficie es la del formato ENTERO —fórmulas, macros, enlaces externos,
 * OLE— cuando lo que hace falta son celdas de texto de una hoja. Este lector
 * abre exactamente dos entradas del ZIP y no entiende nada más.
 *
 * **Lo que rechaza, y por qué cada límite existe:**
 *
 *  - **Tipo real, no extensión** (§2.7.8): un `.xlsx` empieza por `PK\x03\x04`.
 *    Un ejecutable renombrado se rechaza en el primer byte, no al abrirlo.
 *  - **Bomba de descompresión**: se acotan el tamaño declarado, el tamaño ya
 *    descomprimido y la RAZÓN entre ambos. Un ZIP de 40 KB puede declarar 4 GB;
 *    sin el tope, el proceso muere antes de poder rechazarlo.
 *  - **Número de entradas**: un ZIP con cien mil entradas cuesta recorrerlo
 *    aunque ninguna se lea.
 *  - **Entidades XML**: se rechaza cualquier `<!DOCTYPE` o `<!ENTITY`. Es la
 *    familia «billion laughs» / XXE, y el analizador no las expande porque ni
 *    siquiera las admite.
 *  - **Recorrido de rutas**: solo se leen dos nombres literales y exactos, así
 *    que un `../../etc/passwd` dentro del ZIP no tiene a dónde llegar.
 *
 * Lo que NO hace, dicho para que nadie lo suponga: no evalúa fórmulas —lee el
 * valor almacenado—, no admite más de una hoja, y no interpreta formatos de
 * número: una fecha llega como el número de serie que Excel guardó.
 */

/** Cotas duras. Están aquí, juntas y con nombre, para poder leerlas de un vistazo. */
export const LIMITES = {
  /**
   * Cota del LECTOR. La que manda de verdad en la ruta HTTP es
   * `LIMITE_PAYLOAD` (256 kB de JSON ≈ 180 kB de hoja): esta existe para el
   * caso en que el mismo lector se use fuera de esa ruta —una tarea de
   * migración, el Edge— y para que ninguna llamada pueda pedirle al proceso
   * que reserve más que esto.
   */
  bytesDelArchivo: 1024 * 1024,
  entradasDelZip: 512,
  bytesDescomprimidos: 32 * 1024 * 1024,
  razonDeCompresion: 200,
  filas: 5_000,
  columnas: 64,
} as const;

export class ArchivoInvalido extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'ArchivoInvalido';
  }
}

const FIRMA_LOCAL = 0x04034b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_FIN_CENTRAL = 0x06054b50;

interface EntradaDelZip {
  readonly nombre: string;
  readonly metodo: number;
  readonly comprimido: number;
  readonly descomprimido: number;
  readonly desplazamiento: number;
}

/** Localiza el fin del directorio central buscando su firma desde el final. */
const finDelDirectorio = (datos: Buffer): number => {
  const minimo = Math.max(0, datos.length - 66_000);
  for (let i = datos.length - 22; i >= minimo; i -= 1) {
    if (datos.readUInt32LE(i) === FIRMA_FIN_CENTRAL) return i;
  }
  throw new ArchivoInvalido('el archivo no es un XLSX: no se encuentra el directorio del ZIP');
};

const leerDirectorio = (datos: Buffer): Map<string, EntradaDelZip> => {
  const fin = finDelDirectorio(datos);
  const total = datos.readUInt16LE(fin + 10);
  if (total > LIMITES.entradasDelZip) {
    throw new ArchivoInvalido(
      `el archivo declara ${total} entradas; el máximo es ${LIMITES.entradasDelZip}`,
    );
  }
  let puntero = datos.readUInt32LE(fin + 16);
  const entradas = new Map<string, EntradaDelZip>();
  for (let i = 0; i < total; i += 1) {
    if (puntero + 46 > datos.length || datos.readUInt32LE(puntero) !== FIRMA_CENTRAL) {
      throw new ArchivoInvalido('el directorio del ZIP está corrupto');
    }
    const largoNombre = datos.readUInt16LE(puntero + 28);
    const largoExtra = datos.readUInt16LE(puntero + 30);
    const largoComentario = datos.readUInt16LE(puntero + 32);
    const nombre = datos.toString('utf8', puntero + 46, puntero + 46 + largoNombre);
    entradas.set(nombre, {
      nombre,
      metodo: datos.readUInt16LE(puntero + 10),
      comprimido: datos.readUInt32LE(puntero + 20),
      descomprimido: datos.readUInt32LE(puntero + 24),
      desplazamiento: datos.readUInt32LE(puntero + 42),
    });
    puntero += 46 + largoNombre + largoExtra + largoComentario;
  }
  return entradas;
};

const extraer = (datos: Buffer, entrada: EntradaDelZip): string => {
  if (entrada.descomprimido > LIMITES.bytesDescomprimidos) {
    throw new ArchivoInvalido(`«${entrada.nombre}» declara un tamaño desproporcionado`);
  }
  if (
    entrada.comprimido > 0 &&
    entrada.descomprimido / entrada.comprimido > LIMITES.razonDeCompresion
  ) {
    throw new ArchivoInvalido(`«${entrada.nombre}» tiene una razón de compresión sospechosa`);
  }
  const base = entrada.desplazamiento;
  if (base + 30 > datos.length || datos.readUInt32LE(base) !== FIRMA_LOCAL) {
    throw new ArchivoInvalido(`«${entrada.nombre}» no está donde el directorio dice`);
  }
  const inicio = base + 30 + datos.readUInt16LE(base + 26) + datos.readUInt16LE(base + 28);
  const crudo = datos.subarray(inicio, inicio + entrada.comprimido);
  const salida =
    entrada.metodo === 0
      ? crudo
      : inflateRawSync(crudo, {
          maxOutputLength: LIMITES.bytesDescomprimidos,
        });
  return salida.toString('utf8');
};

/** Sin DTD no hay expansión de entidades: se rechaza antes de mirar el resto. */
const exigirXmlSinEntidades = (xml: string, nombre: string): void => {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new ArchivoInvalido(`«${nombre}» declara entidades XML; no se procesa`);
  }
};

const desescapar = (texto: string): string =>
  texto
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d{1,7});/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

/** Texto plano de un fragmento XML: concatena los `<t>` y descarta el marcado. */
const textoDe = (fragmento: string): string => desescapar(fragmento.replace(/<[^>]*>/g, '')).trim();

const cadenasCompartidas = (xml: string): readonly string[] => {
  const salida: string[] = [];
  for (const si of xml.match(/<si\b[\s\S]*?<\/si>/g) ?? []) salida.push(textoDe(si));
  return salida;
};

/** Índice de columna a partir de la referencia de celda: `C7` → 2. */
const columnaDe = (referencia: string): number => {
  const letras = /^([A-Z]+)/.exec(referencia)?.[1] ?? 'A';
  let n = 0;
  for (const letra of letras) n = n * 26 + (letra.charCodeAt(0) - 64);
  return n - 1;
};

/**
 * Devuelve la hoja como una matriz de cadenas ya normalizadas. Las filas vacías
 * se conservan para que el número de fila del informe de errores coincida con
 * el que el operador ve en Excel: decirle «error en la fila 12» y que su fila 12
 * esté bien es peor que no decir nada.
 */
export const leerHojaXlsx = (datos: Buffer): readonly (readonly string[])[] => {
  if (datos.length === 0) throw new ArchivoInvalido('el archivo está vacío');
  if (datos.length > LIMITES.bytesDelArchivo) {
    throw new ArchivoInvalido(
      `el archivo pesa más de ${Math.round(LIMITES.bytesDelArchivo / 1024 / 1024)} MB`,
    );
  }
  // TIPO REAL, no extensión: los cuatro primeros bytes de todo ZIP.
  if (datos.readUInt32LE(0) !== FIRMA_LOCAL) {
    throw new ArchivoInvalido('el archivo no es un XLSX (su contenido no es un ZIP)');
  }

  const entradas = leerDirectorio(datos);
  const hoja = entradas.get('xl/worksheets/sheet1.xml');
  if (hoja === undefined) {
    throw new ArchivoInvalido('el libro no tiene una primera hoja legible');
  }
  const xmlHoja = extraer(datos, hoja);
  exigirXmlSinEntidades(xmlHoja, hoja.nombre);

  const compartidas = entradas.get('xl/sharedStrings.xml');
  let cadenas: readonly string[] = [];
  if (compartidas !== undefined) {
    const xml = extraer(datos, compartidas);
    exigirXmlSinEntidades(xml, compartidas.nombre);
    cadenas = cadenasCompartidas(xml);
  }

  const filas: string[][] = [];
  for (const filaXml of xmlHoja.match(/<row\b[\s\S]*?(?:\/>|<\/row>)/g) ?? []) {
    if (filas.length >= LIMITES.filas) {
      throw new ArchivoInvalido(`el archivo supera las ${LIMITES.filas} filas`);
    }
    const celdas: string[] = [];
    for (const celdaXml of filaXml.match(/<c\b[\s\S]*?(?:\/>|<\/c>)/g) ?? []) {
      const referencia = /r="([A-Z]+\d+)"/.exec(celdaXml)?.[1] ?? 'A1';
      const columna = columnaDe(referencia);
      if (columna >= LIMITES.columnas) continue;
      const tipo = /t="([^"]+)"/.exec(celdaXml)?.[1] ?? 'n';
      const valor = /<v>([\s\S]*?)<\/v>/.exec(celdaXml)?.[1];
      const enLinea = /<is>[\s\S]*?<\/is>/.exec(celdaXml)?.[0];
      let texto = '';
      if (tipo === 's' && valor !== undefined) texto = cadenas[Number(valor)] ?? '';
      else if (tipo === 'inlineStr' && enLinea !== undefined) texto = textoDe(enLinea);
      else if (valor !== undefined) texto = desescapar(valor).trim();
      while (celdas.length < columna) celdas.push('');
      celdas[columna] = texto;
    }
    filas.push(celdas);
  }
  return filas;
};

/**
 * Adaptador de formato: hoja → filas del padrón, con las MISMAS cabeceras que
 * el CSV. Que los dos formatos compartan nombres de columna no es cosmético:
 * un operador que exporta su CSV a XLSX no debería tener que reescribir la
 * cabecera, y dos vocabularios para el mismo fichero acaban divergiendo.
 *
 * Vive en infraestructura y devuelve el tipo que la aplicación definió, de modo
 * que `CargarPadronDesdeArchivo` no sabe que existe el XLSX (§2.2).
 */
export interface FilaLeida {
  readonly numeroDeFila: number;
  readonly viviendaId: string;
  readonly placa?: string;
  readonly personaId?: string;
  readonly esTitular?: boolean;
}

export const filasDesdeXlsx = (datos: Buffer): readonly FilaLeida[] => {
  const hoja = leerHojaXlsx(datos);
  if (hoja.length < 2) return [];
  const cabeceras = (hoja[0] ?? []).map((c) => c.trim().toLowerCase());
  const columnaDeNombre = (n: string): number => cabeceras.indexOf(n);
  if (columnaDeNombre('vivienda_id') === -1) {
    throw new ArchivoInvalido(
      'la primera fila debe ser la cabecera y contener al menos la columna «vivienda_id»',
    );
  }
  const filas: FilaLeida[] = [];
  for (let i = 1; i < hoja.length; i += 1) {
    const celdas = hoja[i] ?? [];
    // Una fila totalmente vacía se salta en vez de producir un error: los
    // libros de Excel arrastran filas vacías al final y reportarlas como
    // defectos convertiría una carga correcta en un informe de errores.
    if (celdas.every((c) => c.trim() === '')) continue;
    const leer = (n: string): string | undefined => {
      const j = columnaDeNombre(n);
      const v = j >= 0 ? celdas[j]?.trim() : undefined;
      return v !== undefined && v.length > 0 ? v : undefined;
    };
    const placa = leer('placa');
    const personaId = leer('persona_id');
    const esTitular = leer('es_titular');
    filas.push({
      // +1: el número que ve el operador en Excel, no el índice del arreglo.
      numeroDeFila: i + 1,
      viviendaId: leer('vivienda_id') ?? '',
      ...(placa === undefined ? {} : { placa }),
      ...(personaId === undefined ? {} : { personaId }),
      ...(esTitular === undefined ? {} : { esTitular: esTitular.toLowerCase() === 'true' }),
    });
  }
  return filas;
};
