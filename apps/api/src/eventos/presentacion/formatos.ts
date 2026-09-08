import type { EventoRegistrado } from '../aplicacion/puertos';

/**
 * Serializadores del histórico — HU-32, pantalla de Informes.
 *
 * Están en PRESENTACIÓN porque son traducción de protocolo, no negocio (§2.2), y
 * son **funciones puras**: reciben filas y devuelven bytes. Eso las hace
 * probables sin levantar la API y sin base de datos.
 *
 * **Sin dependencias nuevas, y es deliberado.** Los tres formatos que pide
 * HU-32 se pueden escribir con la biblioteca estándar; añadir un generador de
 * PDF y otro de XLSX metería miles de líneas de terceros en el árbol para
 * producir tablas. Cada dependencia es superficie de ataque que la ETAPA 13
 * tendrá que auditar y que el SCA vigilará para siempre.
 */

export const COLUMNAS: readonly (readonly [string, (f: EventoRegistrado) => string])[] = [
  ['Fecha y hora (UTC)', (f) => f.ocurridoEn.toISOString()],
  ['Tipo', (f) => f.tipo],
  ['Resultado', (f) => f.resultado],
  ['Motivo', (f) => f.motivo ?? ''],
  ['Metodo', (f) => f.metodo],
  ['Dispositivo', (f) => f.dispositivoId],
  ['Vivienda', (f) => f.viviendaId ?? ''],
  ['Persona', (f) => f.personaId ?? ''],
  ['Zona', (f) => f.zonaId ?? ''],
  ['Placa', (f) => f.placaDetectada ?? ''],
  ['Confianza', (f) => (f.confianza === null ? '' : f.confianza.toFixed(3))],
  ['Regla aplicada', (f) => f.reglaAplicada],
  ['Version de reglas', (f) => String(f.versionReglas)],
  ['Operador', (f) => f.operadorId ?? ''],
  ['Motivo manual', (f) => f.motivoManual ?? ''],
  ['Decidido en el Edge', (f) => (f.decididoPorEdge ? 'si' : 'no')],
];

/** Marca de orden de bytes. Ver el comentario de `aCsv`. */
const BOM = '\uFEFF';

/**
 * Neutralización de fórmulas: un campo que empieza por `=`, `+`, `-` o `@` lo
 * interpreta Excel como fórmula al abrir el CSV. Es la inyección de fórmulas, y
 * los campos de este informe —motivo manual, identificadores de dispositivo—
 * vienen de entrada de usuario y de equipos de red, así que es una vía real.
 */
const PELIGROSOS = new Set(['=', '+', '-', '@', '\t', '\r']);

const escaparCsv = (valor: string): string => {
  const neutralizado = valor.length > 0 && PELIGROSOS.has(valor[0] as string) ? `'${valor}` : valor;
  return `"${neutralizado.replace(/"/g, '""')}"`;
};

/**
 * CSV según RFC 4180, con BOM y CRLF.
 *
 * El BOM no es adorno: sin él, Excel en Windows abre el fichero como Latin-1 y
 * los acentos salen rotos. Un informe de auditoría ilegible es un informe que
 * nadie quiere firmar.
 */
export const aCsv = (filas: readonly EventoRegistrado[]): Buffer => {
  const lineas = [COLUMNAS.map(([titulo]) => escaparCsv(titulo)).join(',')];
  for (const fila of filas) {
    lineas.push(COLUMNAS.map(([, leer]) => escaparCsv(leer(fila))).join(','));
  }
  return Buffer.from(`${BOM}${lineas.join('\r\n')}\r\n`, 'utf8');
};

/**
 * Quita los caracteres de control, que no son XML válido en ninguna versión.
 *
 * Se filtra por punto de código en vez de con una expresión regular a
 * propósito: una regex con caracteres de control literales dispara
 * `no-control-regex`, y desactivar la regla para esta línea sería apagar un
 * aviso útil en todo el resto del árbol. La comprobación explícita dice además
 * lo que hace sin que haya que descifrar un rango de escapes.
 */
const sinControl = (valor: string): string =>
  [...valor]
    .filter((caracter) => {
      const codigo = caracter.codePointAt(0) ?? 0;
      return codigo >= 0x20 && codigo !== 0x7f;
    })
    .join('');

const escaparXml = (valor: string): string =>
  // Un identificador con un byte raro haría ilegible el libro entero en vez de
  // una sola celda: se quita antes de escribirlo.
  sinControl(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Excel en **SpreadsheetML 2003**: XML que Excel y LibreOffice abren como libro
 * nativo, con fila de encabezado. Es el formato de hoja de cálculo que se puede
 * emitir sin dependencias; el `.xlsx` moderno es un ZIP con varias partes y
 * exigiría una biblioteca para ganar formato que este informe no necesita.
 */
export const aExcel = (filas: readonly EventoRegistrado[]): Buffer => {
  const celda = (valor: string): string =>
    `<Cell><Data ss:Type="String">${escaparXml(valor)}</Data></Cell>`;
  const cuerpo = filas
    .map((f) => `<Row>${COLUMNAS.map(([, leer]) => celda(leer(f))).join('')}</Row>`)
    .join('');
  const encabezado = `<Row>${COLUMNAS.map(([t]) => celda(t)).join('')}</Row>`;

  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>` +
      `<?mso-application progid="Excel.Sheet"?>` +
      `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
      `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
      `<Worksheet ss:Name="Eventos"><Table>${encabezado}${cuerpo}</Table></Worksheet>` +
      `</Workbook>`,
    'utf8',
  );
};

/** Diacríticos sueltos tras normalizar en NFD. */
const DIACRITICOS = /[\u0300-\u036F]/g;
const NO_IMPRIMIBLE = /[^\u0020-\u007E]/g;

/** Escapes de cadena literal de PDF y recorte a ASCII imprimible. */
const textoPdf = (valor: string): string =>
  valor
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .replace(NO_IMPRIMIBLE, '?')
    .replace(/([\\()])/g, '\\$1');

const FILAS_POR_PAGINA = 34;

/**
 * PDF 1.4 mínimo, escrito a mano.
 *
 * Un PDF válido es un catálogo, un árbol de páginas, un flujo de contenido por
 * página y una tabla de referencias cruzadas con los desplazamientos EXACTOS en
 * bytes de cada objeto. Los desplazamientos se calculan sobre el buffer que se
 * va construyendo —no se estiman—, porque un `xref` con un byte de más produce
 * un fichero que unos lectores abren y otros rechazan: el peor de los fallos
 * posibles, intermitente y dependiente del visor.
 *
 * Fuente Helvetica de las 14 estándar: no se incrusta nada, así que el fichero
 * no arrastra licencias tipográficas ni pesa de más.
 */
export const aPdf = (filas: readonly EventoRegistrado[], titulo: string): Buffer => {
  const paginas: string[] = [];
  for (let i = 0; i < Math.max(1, filas.length); i += FILAS_POR_PAGINA) {
    paginas.push(contenidoDePagina(filas.slice(i, i + FILAS_POR_PAGINA), titulo, i));
  }

  const objetos: string[] = [];
  const idPaginas = 2;
  const idFuente = 3;
  const primeraPagina = 4;
  const idsPagina = paginas.map((_, i) => primeraPagina + i * 2);

  objetos.push(`<< /Type /Catalog /Pages ${idPaginas} 0 R >>`);
  objetos.push(
    `<< /Type /Pages /Kids [${idsPagina.map((id) => `${id} 0 R`).join(' ')}] /Count ${paginas.length} >>`,
  );
  objetos.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  paginas.forEach((contenido, i) => {
    objetos.push(
      `<< /Type /Page /Parent ${idPaginas} 0 R /MediaBox [0 0 842 595] ` +
        `/Resources << /Font << /F1 ${idFuente} 0 R >> >> /Contents ${idsPagina[i]! + 1} 0 R >>`,
    );
    objetos.push(
      `<< /Length ${Buffer.byteLength(contenido, 'latin1')} >>\nstream\n${contenido}\nendstream`,
    );
  });

  let pdf = '%PDF-1.4\n';
  const desplazamientos: number[] = [];
  objetos.forEach((cuerpo, i) => {
    desplazamientos.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${cuerpo}\nendobj\n`;
  });

  const inicioXref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const d of desplazamientos) pdf += `${String(d).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
};

/** Apaisado 842×595. Las columnas se recortan para que quepan sin solaparse. */
const contenidoDePagina = (
  filas: readonly EventoRegistrado[],
  titulo: string,
  desde: number,
): string => {
  const anchos = [118, 52, 56, 104, 50, 96, 96, 88, 78];
  const columnas = COLUMNAS.slice(0, anchos.length);
  const lineas = [
    `BT /F1 12 Tf 30 560 Td (${textoPdf(titulo)}) Tj ET`,
    `BT /F1 7 Tf 30 546 Td (${textoPdf(
      `Filas ${desde + 1}-${desde + filas.length}. Generado por Next Control Residencial.`,
    )}) Tj ET`,
  ];

  let x = 30;
  columnas.forEach(([nombre], i) => {
    lineas.push(`BT /F1 7 Tf ${x} 528 Td (${textoPdf(nombre)}) Tj ET`);
    x += anchos[i]!;
  });

  filas.forEach((fila, i) => {
    const y = 514 - i * 14;
    let cx = 30;
    columnas.forEach(([, leer], j) => {
      const ancho = anchos[j]!;
      const texto = leer(fila).slice(0, Math.floor(ancho / 4));
      lineas.push(`BT /F1 6 Tf ${cx} ${y} Td (${textoPdf(texto)}) Tj ET`);
      cx += ancho;
    });
  });

  return lineas.join('\n');
};
