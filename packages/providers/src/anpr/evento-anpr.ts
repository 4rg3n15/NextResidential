import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { errorDominio, exito, fallo } from '@ncr/domain-core';

/**
 * El evento de placa **tal como lo emite el equipo real**.
 *
 * Esto no es una forma inventada para que las pruebas pasen. Es el contrato
 * capturado el 2026-09-14 contra la cámara de entrada instalada, firmware
 * `V5.4.0 build 250425`, con dos lecturas reales. Los nombres de los elementos
 * son los del fabricante **incluida su errata** —`vehicelRect`, no
 * `vehicleRect`—, porque el día que el adaptador real lea el XML de verdad, esa
 * errata va a estar ahí.
 *
 * **Por qué importa que el simulador emita ESTA forma.** ADR-03 dice que el
 * sistema entero debe funcionar contra `MockProvider`, y eso solo demuestra
 * algo si lo que el simulador emite se parece a lo que llega. Un simulador que
 * produce una forma cómoda prueba el camino con la forma cómoda: el día del
 * equipo real aparecen el desfase horario, el identificador de evento, la
 * confianza por carácter y los rectángulos, y hay que rehacer el analizador con
 * la cámara delante. Con esta pieza, el analizador ya está escrito y probado
 * antes de llegar.
 *
 * **Lo que aquí NO está comprobado byte a byte** y hay que confirmar contra la
 * captura guardada en `docs/insumos/hikvision/` en cuanto esté en el
 * repositorio: el separador exacto de `plateCharBelieve` y el orden de los
 * elementos. `analizar` no depende del orden —lee por nombre— y el separador se
 * acepta por espacios o comas, que cubre las dos formas posibles. La prueba
 * `evento-anpr.captura-real.test.ts` cierra esa duda en cuanto el archivo esté.
 */

/** Rectángulo de la imagen, en las coordenadas que declara el equipo. */
export interface RectanguloDeImagen {
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
}

export interface EventoAnpr {
  /** `licensePlate`. Sin normalizar: quien normaliza es el objeto de valor `Placa`. */
  readonly placa: string;
  /** `confidenceLevel`, en centésimas enteras 0..100, tal cual lo da el equipo. */
  readonly confianzaCentesimas: number;
  /** `plateCharBelieve`: una confianza por carácter. Vacío si el equipo no la manda. */
  readonly confianzaPorCaracter: readonly number[];
  /** `dateTime`, ya interpretado. **Es la hora del EQUIPO**, no la del servidor. */
  readonly ocurridoEn: Date;
  /** `dateTime` sin tocar. El desfase es dato: dice en qué huso cree estar el equipo. */
  readonly ocurridoEnTextual: string;
  /** `channelID`. Un equipo puede tener varios carriles. */
  readonly canal: number;
  /** `UUID` del evento. Es la **clave de idempotencia** del sistema (RN-17, CA-22). */
  readonly referenciaExterna: string;
  /** `capturePicSecurityCode`. Se arrastra como metadato; ver la advertencia de abajo. */
  readonly codigoDeSeguridadDeCaptura: string | null;
  /**
   * `barrierGateCtrlType`. **0 = la cámara reporta y no acciona.**
   * Cualquier otro valor significa que el equipo decide por su cuenta.
   */
  readonly tipoDeControlDeTalanquera: number;
  readonly recuadroDePlaca: RectanguloDeImagen | null;
  readonly recuadroDeVehiculo: RectanguloDeImagen | null;
}

/**
 * El único valor de `barrierGateCtrlType` compatible con el principio rector.
 *
 * «Next Control decide. El hardware ejecuta.» Si la cámara resuelve la apertura
 * sola, el motor de reglas queda decorativo y hay aperturas sin evento, sin
 * regla aplicada y sin actor. Medido en el equipo real: **0**.
 */
export const CONTROL_DE_TALANQUERA_DELEGADO = 0;

/**
 * `true` si el evento confiesa que el equipo acciona por su cuenta.
 *
 * Se expone como función y no como comentario porque es un CONTROL: la ingesta
 * puede rechazar o alertar en vez de aceptar en silencio un evento que llega de
 * un equipo mal configurado. Un aparato que decide es un hallazgo de bloqueo,
 * no un detalle de configuración.
 */
export const laCamaraDecidePorSuCuenta = (evento: EventoAnpr): boolean =>
  evento.tipoDeControlDeTalanquera !== CONTROL_DE_TALANQUERA_DELEGADO;

/* ── Análisis ───────────────────────────────────────────────────────────── */

/**
 * Lee el valor del primer elemento con ese nombre.
 *
 * **Sin dependencia de un analizador XML**, y es deliberado: este XML lo emite
 * un equipo de campo sin autenticar (ver `paquete-anpr.ts`), así que es entrada
 * hostil. Un analizador XML completo abre la puerta a expansión de entidades y
 * a bombas de anidamiento; aquí no hay ninguna de las dos porque no se
 * interpreta nada más que texto entre dos etiquetas conocidas. La búsqueda
 * ignora el prefijo de espacio de nombres, que varía entre firmware — el equipo
 * real declara `www.isapi.org`, no el dominio del fabricante.
 */
const leer = (xml: string, etiqueta: string): string | null => {
  const expresion = new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${etiqueta}\\b[^>]*>([\\s\\S]*?)</`, 'i');
  const encontrado = expresion.exec(xml);
  return encontrado === null ? null : encontrado[1]!.trim();
};

/** El bloque interno de un elemento, para leer dentro de él sin salirse. */
const bloque = (xml: string, etiqueta: string): string | null => {
  const expresion = new RegExp(
    `<(?:[A-Za-z0-9_.-]+:)?${etiqueta}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?${etiqueta}>`,
    'i',
  );
  const encontrado = expresion.exec(xml);
  return encontrado === null ? null : encontrado[1]!;
};

const entero = (texto: string | null): number | null => {
  if (texto === null || texto.trim() === '') return null;
  const valor = Number(texto);
  return Number.isInteger(valor) ? valor : null;
};

/** `plateCharBelieve` llega separado por espacios o por comas según firmware. */
const listaDeEnteros = (texto: string | null): readonly number[] =>
  texto === null
    ? []
    : texto
        .split(/[\s,]+/)
        .filter((t) => t !== '')
        .map((t) => Number(t))
        .filter((n) => Number.isFinite(n));

const rectangulo = (xml: string | null): RectanguloDeImagen | null => {
  if (xml === null) return null;
  const x = entero(leer(xml, 'x'));
  const y = entero(leer(xml, 'y'));
  const ancho = entero(leer(xml, 'width'));
  const alto = entero(leer(xml, 'height'));
  if (x === null || y === null || ancho === null || alto === null) return null;
  return { x, y, ancho, alto };
};

const MAXIMO_XML = 256 * 1024;

/**
 * Traduce el XML del equipo al evento normalizado.
 *
 * Falla con motivo tipado en vez de lanzar: un XML que no se entiende es un
 * hecho de negocio esperado —firmware distinto, evento de otro tipo, cuerpo
 * truncado— y quien lo recibe tiene que poder registrarlo y seguir, no caerse.
 */
export const analizarEventoAnpr = (xml: string): Resultado<EventoAnpr, ErrorDominio> => {
  if (xml.length > MAXIMO_XML) {
    return fallo(errorDominio('DATO_INVALIDO', 'El XML del evento excede el tamaño admitido'));
  }

  const tipo = leer(xml, 'eventType');
  if (tipo === null) {
    return fallo(errorDominio('DATO_INVALIDO', 'El cuerpo no es un evento de notificación'));
  }
  if (tipo.toUpperCase() !== 'ANPR') {
    return fallo(errorDominio('DATO_INVALIDO', `Evento «${tipo}»: no es una lectura de placa`));
  }

  const placa = leer(xml, 'licensePlate');
  if (placa === null || placa === '') {
    return fallo(errorDominio('DATO_INVALIDO', 'El evento no trae matrícula'));
  }

  const referencia = leer(xml, 'UUID');
  if (referencia === null || referencia === '') {
    // Sin identificador de evento no hay clave de idempotencia, y sin ella el
    // mismo paso de un vehículo se registra dos veces (RN-17, CA-22). Es un
    // rechazo, no un valor por defecto.
    return fallo(errorDominio('DATO_INVALIDO', 'El evento no trae identificador propio'));
  }

  const confianza = entero(leer(xml, 'confidenceLevel'));
  if (confianza === null || confianza < 0 || confianza > 100) {
    return fallo(errorDominio('DATO_INVALIDO', 'Confianza ausente o fuera de 0..100'));
  }

  const textual = leer(xml, 'dateTime');
  const instante = textual === null ? null : new Date(textual);
  if (instante === null || Number.isNaN(instante.getTime())) {
    return fallo(errorDominio('DATO_INVALIDO', 'El evento no trae una fecha interpretable'));
  }

  const listaDeImagenes = bloque(xml, 'pictureInfoList');

  return exito({
    placa,
    confianzaCentesimas: confianza,
    confianzaPorCaracter: listaDeEnteros(leer(xml, 'plateCharBelieve')),
    ocurridoEn: instante,
    ocurridoEnTextual: textual!,
    canal: entero(leer(xml, 'channelID')) ?? 1,
    referenciaExterna: referencia,
    codigoDeSeguridadDeCaptura: leer(xml, 'capturePicSecurityCode'),
    // Ausente se trata como «no delega», que es el valor CONSERVADOR: obliga a
    // mirarlo en vez de dar por bueno que el equipo se porta bien.
    tipoDeControlDeTalanquera: entero(leer(xml, 'barrierGateCtrlType')) ?? -1,
    recuadroDePlaca: rectangulo(bloque(listaDeImagenes ?? xml, 'plateRect')),
    // `vehicelRect` con la errata del fabricante; se acepta también la forma
    // correcta por si un firmware posterior la arregla.
    recuadroDeVehiculo:
      rectangulo(bloque(listaDeImagenes ?? xml, 'vehicelRect')) ??
      rectangulo(bloque(listaDeImagenes ?? xml, 'vehicleRect')),
  });
};
