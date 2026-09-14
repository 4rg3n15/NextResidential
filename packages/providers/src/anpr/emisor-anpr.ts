import { PARTE_FOTO_COMPLETA, PARTE_FOTO_PLACA, PARTE_XML } from './paquete-anpr';

/**
 * Construye un envío con **la forma del equipo real**, para que el simulador
 * emita lo que emite la cámara y no una versión cómoda de ello.
 *
 * El delimitador por omisión es el que usa el equipo instalado: empieza por
 * guiones. No es un detalle estético — es el caso que rompe un analizador
 * escrito con un delimitador «normal», y si el simulador usara uno normal, ese
 * defecto se descubriría con la cámara delante.
 *
 * Las imágenes son JPEG mínimos pero **válidos**: llevan su marca de inicio y
 * de fin. Un relleno de bytes cualesquiera dejaría pasar un almacén de
 * evidencia que valide por tipo real (§2.7.8), que es justo el control que hay
 * que poder ejercer sin hardware.
 */
export const DELIMITADOR_DEL_EQUIPO = '-----------------------------7e13971310878';

/** Cabecera del cliente HTTP embebido del equipo; se conserva por fidelidad. */
export const AGENTE_DEL_EQUIPO = 'cpp-httplib/0.9';

export interface LecturaSimulada {
  readonly placa: string;
  readonly confianzaCentesimas: number;
  readonly ocurridoEn: Date;
  readonly referenciaExterna: string;
  readonly canal?: number;
  /** 0 = el equipo delega la decisión, que es lo único admisible (§1). */
  readonly tipoDeControlDeTalanquera?: number;
}

/** JPEG mínimo válido: SOI + comentario + EOI. */
const jpegMinimo = (nota: string): Uint8Array => {
  const texto = new TextEncoder().encode(nota);
  const longitud = texto.length + 2;
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xfe,
    (longitud >> 8) & 0xff,
    longitud & 0xff,
    ...texto,
    0xff,
    0xd9,
  ]);
};

/**
 * Fecha con desfase horario explícito, como la manda el equipo.
 *
 * El equipo **no envía UTC**: envía su hora local con el desfase pegado. Que el
 * simulador emita `Z` escondería el trabajo de interpretar el desfase, que es
 * exactamente donde se cuelan los errores de una hora.
 */
export const conDesfase = (instante: Date, desfaseMinutos: number): string => {
  const local = new Date(instante.getTime() + desfaseMinutos * 60_000);
  const signo = desfaseMinutos < 0 ? '-' : '+';
  const absoluto = Math.abs(desfaseMinutos);
  const hh = String(Math.floor(absoluto / 60)).padStart(2, '0');
  const mm = String(absoluto % 60).padStart(2, '0');
  return `${local.toISOString().slice(0, 19)}${signo}${hh}:${mm}`;
};

/**
 * El XML del evento, con los nombres del fabricante.
 *
 * `vehicelRect` lleva la errata a propósito: es la que trae el equipo, y el
 * analizador tiene que comerse esa y no la ortográficamente correcta.
 */
export const construirEventoAnprXml = (lectura: LecturaSimulada, desfaseMinutos = -300): string => {
  const porCaracter = [...lectura.placa].map(() => lectura.confianzaCentesimas).join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<EventNotificationAlert version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
<ipAddress>0.0.0.0</ipAddress>
<portNo>80</portNo>
<protocol>HTTP</protocol>
<channelID>${lectura.canal ?? 1}</channelID>
<dateTime>${conDesfase(lectura.ocurridoEn, desfaseMinutos)}</dateTime>
<activePostCount>1</activePostCount>
<eventType>ANPR</eventType>
<eventState>active</eventState>
<eventDescription>ANPR</eventDescription>
<UUID>${lectura.referenciaExterna}</UUID>
<ANPR>
<licensePlate>${lectura.placa}</licensePlate>
<lane>1</lane>
<direction>forward</direction>
<confidenceLevel>${lectura.confianzaCentesimas}</confidenceLevel>
<plateCharBelieve>${porCaracter}</plateCharBelieve>
<barrierGateCtrlType>${lectura.tipoDeControlDeTalanquera ?? 0}</barrierGateCtrlType>
<capturePicSecurityCode>0000000000000000</capturePicSecurityCode>
<pictureInfoList>
<pictureInfo>
<fileName>${PARTE_FOTO_COMPLETA}</fileName>
<plateRect><x>640</x><y>420</y><width>180</width><height>60</height></plateRect>
<vehicelRect><x>420</x><y>180</y><width>620</width><height>480</height></vehicelRect>
</pictureInfo>
</pictureInfoList>
</ANPR>
</EventNotificationAlert>`;
};

/** Cuerpo `multipart` completo, con sus tres partes y el delimitador del equipo. */
export const construirPaqueteAnpr = (
  lectura: LecturaSimulada,
  delimitador = DELIMITADOR_DEL_EQUIPO,
): { readonly cuerpo: Uint8Array; readonly tipoDeContenido: string } => {
  const bytes = new TextEncoder();
  const trozos: Uint8Array[] = [];
  const escribir = (texto: string): void => void trozos.push(bytes.encode(texto));

  const parte = (nombre: string, tipo: string, contenido: Uint8Array): void => {
    escribir(`--${delimitador}\r\n`);
    escribir(`Content-Disposition: form-data; name="${nombre}"; filename="${nombre}"\r\n`);
    escribir(`Content-Type: ${tipo}\r\n\r\n`);
    trozos.push(contenido);
    escribir('\r\n');
  };

  parte(PARTE_XML, 'text/xml', bytes.encode(construirEventoAnprXml(lectura)));
  parte(PARTE_FOTO_COMPLETA, 'image/jpeg', jpegMinimo(`deteccion ${lectura.placa}`));
  parte(PARTE_FOTO_PLACA, 'image/jpeg', jpegMinimo(`placa ${lectura.placa}`));
  escribir(`--${delimitador}--\r\n`);

  const total = trozos.reduce((n, t) => n + t.length, 0);
  const cuerpo = new Uint8Array(total);
  let posicion = 0;
  for (const trozo of trozos) {
    cuerpo.set(trozo, posicion);
    posicion += trozo.length;
  }

  return { cuerpo, tipoDeContenido: `multipart/form-data; boundary=${delimitador}` };
};
