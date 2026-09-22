/**
 * LA CÁMARA QUE PUBLICA, PARA PROBAR EL RECEPTOR SIN CÁMARA.
 *
 * El aparato es el único de los tres que **empuja**: abre él la conexión y
 * publica un `multipart/form-data` en nuestro «servidor de alarma». Todo lo
 * demás del sistema se prueba llamando a un adaptador; esto se prueba dejando
 * que algo nos llame, y por eso hace falta la otra mitad.
 *
 * Construye el sobre **como lo hace el equipo**: XML del evento, fotografía de
 * la escena y recorte de la placa, con CRLF y separador. Lo que aquí se fija no
 * es el contenido —que está DOCUMENTADO, NO VERIFICADO— sino la FORMA, que es
 * lo que el receptor tiene que saber abrir; el día que la captura real llegue,
 * lo que cambia son los nombres y las etiquetas, en un solo sitio.
 */

export interface LecturaSimulada {
  readonly placa: string;
  /** 0..100, que es como lo emite el equipo en este firmware. */
  readonly confianza?: number;
  readonly ocurridoEn?: Date;
  /** Identificador del equipo: es la clave de idempotencia del receptor. */
  readonly referencia?: string;
  readonly tipoDeEvento?: string;
}

/** Un JPEG mínimo pero REAL: cabecera SOI, marcador y EOI. */
export const jpegDePrueba = (tamano = 512, semilla = 7): Buffer => {
  const bytes = Buffer.alloc(Math.max(4, tamano));
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  for (let i = 2; i < bytes.length - 2; i += 1) bytes[i] = (i * semilla) % 256;
  bytes[bytes.length - 2] = 0xff;
  bytes[bytes.length - 1] = 0xd9;
  return bytes;
};

export const xmlDeLectura = (lectura: LecturaSimulada): string =>
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<EventNotificationAlert version="2.0">' +
  `<eventType>${lectura.tipoDeEvento ?? 'ANPR'}</eventType>` +
  `<dateTime>${(lectura.ocurridoEn ?? new Date()).toISOString()}</dateTime>` +
  `<eventId>${lectura.referencia ?? `ev-${lectura.placa}`}</eventId>` +
  '<ANPR>' +
  `<licensePlate>${lectura.placa}</licensePlate>` +
  `<confidenceLevel>${String(lectura.confianza ?? 93)}</confidenceLevel>` +
  '</ANPR>' +
  '</EventNotificationAlert>';

export const SEPARADOR_DE_PRUEBA = 'MIME_boundary_simulado';

export interface SobrePublicado {
  readonly cuerpo: Buffer;
  readonly tipoDeContenido: string;
}

/**
 * El sobre completo. `conRecorte` en `false` reproduce los firmware que sólo
 * mandan la escena: el receptor tiene que distinguirlo, y si no se prueba,
 * nadie sabe que no lo distingue.
 */
export const sobreDeLectura = (
  lectura: LecturaSimulada,
  opciones: { readonly conRecorte?: boolean } = {},
): SobrePublicado => {
  const parte = (nombre: string, tipo: string, contenido: Buffer | string): Buffer =>
    Buffer.concat([
      Buffer.from(
        `--${SEPARADOR_DE_PRUEBA}\r\nContent-Disposition: form-data; name="${nombre}"; ` +
          `filename="${nombre}"\r\nContent-Type: ${tipo}\r\n\r\n`,
      ),
      Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido),
      Buffer.from('\r\n'),
    ]);

  const partes = [
    parte('anpr.xml', 'text/xml', xmlDeLectura(lectura)),
    parte('detectionPicture', 'image/jpeg', jpegDePrueba(2048, 3)),
  ];
  if (opciones.conRecorte !== false) {
    // El recorte es SIEMPRE el menor de los dos: es lo que el receptor usa
    // para desempatar cuando los nombres no dicen nada.
    partes.push(parte('licensePlatePicture', 'image/jpeg', jpegDePrueba(256, 11)));
  }
  partes.push(Buffer.from(`--${SEPARADOR_DE_PRUEBA}--\r\n`));

  return {
    cuerpo: Buffer.concat(partes),
    tipoDeContenido: `multipart/form-data; boundary=${SEPARADOR_DE_PRUEBA}`,
  };
};

/**
 * Publica contra un receptor de verdad. Se usa desde las pruebas de extremo a
 * extremo y desde el guion de puesta en marcha, que hace lo mismo contra la API
 * del usuario antes de que la cámara real lo intente.
 */
export const publicarLectura = async (
  url: string,
  lectura: LecturaSimulada,
  opciones: { readonly conRecorte?: boolean; readonly peticion?: typeof fetch } = {},
): Promise<Response> => {
  const sobre = sobreDeLectura(lectura, opciones);
  const peticion = opciones.peticion ?? fetch;
  return peticion(url, {
    method: 'POST',
    headers: { 'content-type': sobre.tipoDeContenido },
    body: sobre.cuerpo,
  });
};
