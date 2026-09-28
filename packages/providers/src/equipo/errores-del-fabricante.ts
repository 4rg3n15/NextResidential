import {
  BibliotecaLlena,
  CredencialRechazada,
  DesafioVencido,
  EquipoAveriado,
  EquipoOcupado,
  PeticionRechazada,
  ReinicioNecesario,
} from '../nucleo/errores';
import type { ErrorDeEquipo } from '../nucleo/errores';

/**
 * EL MAPA DE ERRORES DEL FABRICANTE HACIA LOS MOTIVOS DEL DOMINIO.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ ESTO NO ES COSMÉTICA
 *
 * Sin el mapa, todo lo que el equipo rechaza acaba siendo «no se pudo», y quien
 * está delante de la barrera no sabe qué hacer. Los cinco códigos de abajo
 * exigen **cinco reacciones distintas**, y dos de ellas se pagan caras si se
 * confunden:
 *
 * · `badAuthorization` **no se reintenta en bucle**. Estos aparatos bloquean la
 *   cuenta a los pocos intentos fallidos, así que un reintento automático
 *   convierte una contraseña mal escrita en un equipo inaccesible que hay que
 *   ir a desbloquear físicamente.
 * · `deviceBusy` es un **fallo técnico, no una denegación**. Registrarlo como
 *   acceso negado escribiría en el histórico que a alguien no se le permitió
 *   entrar, cuando lo que pasó es que el equipo estaba ocupado. Esa diferencia
 *   la lee después una auditoría.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ NO HACE
 *
 * No traduce al idioma del usuario final: eso es de la consola. Aquí se
 * traduce **protocolo → intención**, que es la frontera de este paquete.
 */

/** Los códigos que la guía del fabricante documenta para estas familias. */
export const CODIGOS_DEL_FABRICANTE = {
  notSupport: '0x40000001',
  badAuthorization: '0x40000003',
  notActivated: '0x40000007',
  invalidContent: '0x4000000A',
  deviceBusy: '0x20000004',
  licensePlateFormatError: '0x40001122',
} as const;

/**
 * Qué hay que hacer con cada uno. Es lo que el mapa aporta: no el nombre del
 * error, sino la reacción.
 */
export type ReaccionAlError =
  /** La ruta no existe en este firmware. Capturar la buena; no probar otra. */
  | 'ruta_inexistente'
  /** Credencial rechazada. **No reintentar**: el equipo bloquea la cuenta. */
  | 'credencial_rechazada'
  /** El equipo no está activado: es puesta en marcha, no un fallo de acceso. */
  | 'equipo_sin_activar'
  /** Le mandamos algo mal formado. El defecto es nuestro. */
  | 'peticion_mal_formada'
  /** Ocupado. Reintentable con espera, y es FALLO_TECNICO, no denegación. */
  | 'equipo_ocupado'
  /** La placa no cumple el formato que el equipo espera. */
  | 'placa_no_reconocible'
  /** Avería del propio equipo. Es FALLO_TECNICO y no se arregla reintentando. */
  | 'equipo_averiado'
  /**
   * El equipo exige **reinicio** para que el cambio surta efecto. Reintentar es
   * inútil y ruidoso: hay que decírselo al operador, que es quien reinicia.
   */
  | 'reinicio_necesario'
  /** No lo conocemos. Se trata como fallo técnico y se registra el código. */
  | 'desconocida';

export interface ErrorDelFabricante {
  readonly codigo: string | null;
  readonly reaccion: ReaccionAlError;
  /** En lenguaje del operador, sin vocabulario del fabricante. */
  readonly detalle: string;
  /** `true` sólo donde reintentar tiene sentido y no cuesta nada. */
  readonly reintentable: boolean;
  /**
   * El código de estado general de la respuesta, cuando viene. Se conserva
   * aparte del código detallado porque son dos ejes distintos: uno dice **qué
   * clase de problema** es y el otro **cuál en concreto**.
   */
  readonly estado: number | null;
  /**
   * Códigos por módulo funcional, que el esquema declara junto a los demás. No
   * se interpretan —no hay tabla— pero **se conservan**: son lo único que
   * permite buscarlos en la guía cuando aparecen por primera vez, y tirarlos
   * convertiría un diagnóstico posible en uno imposible.
   */
  readonly codigoDeModulo: string | null;
  readonly codigoDeEquipo: string | null;
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL CÓDIGO DE ESTADO GENERAL · ocho valores, cinco reacciones distintas
 *
 * | Valor | Qué significa            | Qué hay que hacer                      |
 * | ----- | ------------------------ | -------------------------------------- |
 * | 0, 1  | Correcto                 | Nada                                   |
 * | 2     | Equipo ocupado           | Reintentar **con espera**              |
 * | 3     | Error del equipo         | Fallo técnico; no se arregla insistiendo |
 * | 4     | Operación no válida      | ESE modelo no la admite: degradar      |
 * | 5, 6  | XML mal formado o inválido | Defecto NUESTRO: no se reintenta nunca |
 * | 7     | Requiere reinicio        | Decírselo al operador; reintentar es ruido |
 *
 * Las cinco reacciones no son matices. `2` y `3` se parecen —«el equipo no
 * pudo»— y se tratan al revés: uno se reintenta y el otro no. `5` y `6` son la
 * tentación contraria: parecen del equipo y son nuestros, así que reintentar
 * repite el mismo error para siempre. Y `4` es la que más cuesta confundir: no
 * significa «ahora no», significa «este modelo no», y la salida es la ruta
 * alternativa del catálogo, no insistir en la misma.
 */
const POR_ESTADO: Readonly<
  Record<string, { reaccion: ReaccionAlError; detalle: string; reintentable: boolean }>
> = {
  '2': {
    reaccion: 'equipo_ocupado',
    detalle: 'El equipo está ocupado. Es un fallo técnico, no una denegación de acceso',
    reintentable: true,
  },
  '3': {
    reaccion: 'equipo_averiado',
    detalle: 'El equipo informa de un error propio. Reintentar no lo arregla',
    reintentable: false,
  },
  '4': {
    reaccion: 'ruta_inexistente',
    detalle:
      'Este modelo no admite esta operación. La salida es la ruta alternativa del catálogo, ' +
      'no insistir en la misma',
    reintentable: false,
  },
  '5': {
    reaccion: 'peticion_mal_formada',
    detalle: 'El equipo no pudo analizar lo que se le envió. El defecto es NUESTRO, no suyo',
    reintentable: false,
  },
  '6': {
    reaccion: 'peticion_mal_formada',
    detalle:
      'El equipo entendió el documento y rechazó su contenido. El defecto es NUESTRO: revise ' +
      'qué campos exige el esquema antes de escribir',
    reintentable: false,
  },
  '7': {
    reaccion: 'reinicio_necesario',
    detalle:
      'El cambio no surte efecto hasta que el equipo se reinicie. Reintentar es inútil y ' +
      'ruidoso: hay que reiniciarlo',
    reintentable: false,
  },
};

const POR_CODIGO: Readonly<
  Record<string, { reaccion: ReaccionAlError; detalle: string; reintentable: boolean }>
> = {
  '0x40000001': {
    reaccion: 'ruta_inexistente',
    detalle: 'El equipo no admite esta operación en su versión de firmware',
    reintentable: false,
  },
  '0x40000003': {
    reaccion: 'credencial_rechazada',
    detalle:
      'El equipo rechazó el usuario o la contraseña. NO se reintenta: estos aparatos ' +
      'bloquean la cuenta tras unos pocos intentos fallidos',
    reintentable: false,
  },
  '0x40000007': {
    reaccion: 'equipo_sin_activar',
    detalle: 'El equipo no está activado: hay que activarlo antes de integrarlo',
    reintentable: false,
  },
  '0x4000000a': {
    reaccion: 'peticion_mal_formada',
    detalle: 'El equipo no entendió lo que se le envió. El defecto es nuestro, no suyo',
    reintentable: false,
  },
  '0x20000004': {
    reaccion: 'equipo_ocupado',
    detalle: 'El equipo está ocupado. Es un fallo técnico, no una denegación de acceso',
    reintentable: true,
  },
  '0x40001122': {
    reaccion: 'placa_no_reconocible',
    detalle: 'El equipo no reconoce el formato de esa placa',
    reintentable: false,
  },
};

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-04 · LOS CUATRO CAMPOS DEL CUERPO ISAPI, EN XML **Y EN JSON**
 *
 * En sitio la terminal rechazó la carga de la plantilla con HTTP 400 y la
 * bitácora dijo «El equipo rechazó la operación sin decir por qué». Sí lo
 * decía: las rutas `?format=json` contestan en JSON —`statusCode`,
 * `subStatusCode`, `errorCode` DECIMAL y `errorMsg` (guía, «Error
 * Processing»)— y este intérprete sólo leía XML y códigos `0x…`.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface ResumenIsapi {
  readonly statusCode: number | null;
  readonly statusString: string | null;
  readonly subStatusCode: string | null;
  /** Como lo documenta la guía: `0x` y ocho cifras hexadecimales. */
  readonly errorCode: string | null;
  readonly errorMsg: string | null;
}

const campoJson = (objeto: unknown, nombre: string): unknown => {
  if (typeof objeto !== 'object' || objeto === null) return undefined;
  const registro = objeto as Record<string, unknown>;
  if (nombre in registro) return registro[nombre];
  // Algunos firmware envuelven la respuesta: {"ResponseStatus": {...}}.
  for (const v of Object.values(registro)) {
    if (typeof v === 'object' && v !== null && nombre in (v as Record<string, unknown>)) {
      return (v as Record<string, unknown>)[nombre];
    }
  }
  return undefined;
};

const aHexadecimal = (crudo: unknown): string | null => {
  if (crudo === undefined || crudo === null || crudo === '') return null;
  const texto = String(crudo).trim();
  if (/^0x[0-9a-f]+$/i.test(texto)) return `0x${texto.slice(2).padStart(8, '0').toLowerCase()}`;
  const n = Number(texto);
  return Number.isInteger(n) && n >= 0 ? `0x${n.toString(16).padStart(8, '0')}` : texto;
};

const textoCorto = (crudo: unknown): string | null => {
  if (crudo === undefined || crudo === null) return null;
  const t = String(crudo).trim();
  return t === '' ? null : t.slice(0, 128);
};

export const resumenIsapi = (cuerpo: string): ResumenIsapi => {
  let json: unknown = undefined;
  if (/^\s*\{/.test(cuerpo)) {
    try {
      json = JSON.parse(cuerpo);
    } catch {
      json = undefined;
    }
  }
  const xml = (nombre: string): string | null =>
    new RegExp(`<${nombre}>\\s*([^<]*?)\\s*</${nombre}>`, 'i').exec(cuerpo)?.[1] ?? null;
  const de = (nombre: string): unknown =>
    json === undefined ? xml(nombre) : campoJson(json, nombre);
  const estado = de('statusCode');
  const n = estado === null || estado === undefined ? NaN : Number(estado);
  return {
    statusCode: Number.isInteger(n) ? n : null,
    statusString: textoCorto(de('statusString')),
    subStatusCode: textoCorto(de('subStatusCode')),
    errorCode: aHexadecimal(de('errorCode') ?? (json === undefined ? xml('MErrCode') : undefined)),
    errorMsg: textoCorto(de('errorMsg') ?? (json === undefined ? xml('description') : undefined)),
  };
};

/** Los cuatro campos, en una línea para el operador y la bitácora. */
export const resumenIsapiEnTexto = (r: ResumenIsapi): string =>
  [
    r.statusCode === null ? null : `statusCode ${String(r.statusCode)}`,
    r.subStatusCode === null ? null : `subStatusCode ${r.subStatusCode}`,
    r.errorCode === null ? null : `errorCode ${r.errorCode}`,
    r.errorMsg === null ? null : `errorMsg ${r.errorMsg}`,
  ]
    .filter((p) => p !== null)
    .join(' · ');

/** Saca el código del cuerpo de respuesta, venga como `0x…` o como nombre. */
const codigoEn = (cuerpo: string): string | null => {
  const hexadecimal = /0x[0-9a-f]{8}/i.exec(cuerpo)?.[0];
  if (hexadecimal !== undefined) return hexadecimal.toLowerCase();
  // H-SITIO-04 · el `errorCode` DECIMAL de las respuestas JSON.
  const resumen = resumenIsapi(cuerpo);
  if (resumen.errorCode !== null && /^0x[0-9a-f]{8}$/.test(resumen.errorCode)) {
    return resumen.errorCode;
  }
  // Algunos firmware devuelven sólo el nombre en `subStatusCode`.
  const nombre =
    /<subStatusCode>\s*([A-Za-z]+)\s*<\/subStatusCode>/i.exec(cuerpo)?.[1] ??
    (resumen.subStatusCode !== null && /^[A-Za-z]+$/.test(resumen.subStatusCode)
      ? resumen.subStatusCode
      : undefined);
  if (nombre === undefined) return null;
  const encontrado = Object.entries(CODIGOS_DEL_FABRICANTE).find(
    ([clave]) => clave.toLowerCase() === nombre.toLowerCase(),
  );
  return encontrado === undefined ? null : encontrado[1].toLowerCase();
};

const enteroDe = (crudo: string | undefined): number | null => {
  if (crudo === undefined) return null;
  const n = Number(crudo.trim());
  return Number.isInteger(n) ? n : null;
};

/** Lo que el sobre trae además del código: los ejes que no se interpretan. */
const extras = (
  cuerpo: string,
): { estado: number | null; codigoDeModulo: string | null; codigoDeEquipo: string | null } => ({
  estado:
    enteroDe(/<statusCode>\s*(-?\d+)\s*<\/statusCode>/i.exec(cuerpo)?.[1]) ??
    resumenIsapi(cuerpo).statusCode,
  codigoDeModulo:
    /<MErrCode>\s*([^<]+)\s*<\/MErrCode>/i.exec(cuerpo)?.[1]?.trim() ??
    /"errorCode"\s*:\s*"?([^",}]+)"?/i.exec(cuerpo)?.[1]?.trim() ??
    null,
  codigoDeEquipo:
    /<MErrDevSelfEx>\s*([^<]+)\s*<\/MErrDevSelfEx>/i.exec(cuerpo)?.[1]?.trim() ?? null,
});

export const interpretarError = (cuerpo: string): ErrorDelFabricante => {
  const codigo = codigoEn(cuerpo);
  const aparte = extras(cuerpo);
  const conocido = codigo === null ? undefined : POR_CODIGO[codigo];

  if (conocido !== undefined) return { codigo, ...conocido, ...aparte };

  /**
   * Sin código detallado, manda el general. Es lo que llega de la mayoría de
   * los extremos, y tratarlo como «desconocido» perdía cinco reacciones
   * distintas en un solo cajón: un equipo ocupado —que se reintenta— acababa
   * indistinguible de un XML mal formado nuestro, que no se reintenta nunca.
   */
  const porEstado = aparte.estado === null ? undefined : POR_ESTADO[String(aparte.estado)];
  if (porEstado !== undefined) return { codigo, ...porEstado, ...aparte };

  return {
    codigo,
    reaccion: 'desconocida',
    // El código se conserva aunque no se sepa qué es: es lo único que
    // permite buscarlo en la guía cuando aparezca por primera vez.
    detalle:
      codigo === null
        ? 'El equipo rechazó la operación sin decir por qué'
        : `El equipo devolvió un código que este mapa no conoce: ${codigo}`,
    reintentable: false,
    ...aparte,
  };
};

/**
 * De la reacción al ERROR NEUTRAL que cruza la frontera del paquete.
 *
 * Hasta la 15-D los adaptadores lanzaban `Error` con un texto, y quien estaba
 * fuera no podía distinguir «ocupado, reintenta» de «credencial, NO
 * reintentes». Aquí la taxonomía se convierte en clases que la suite de
 * contrato exige a cualquier adaptador, de esta marca o de otra.
 */
/**
 * 15-L · el texto del mapa, sin la primera letra en mayúscula ni el punto: va
 * detrás de «el equipo rechazó la orden:». Un código que el mapa no conoce no
 * se enseña a una persona (lleva el número del fabricante): se calla.
 */
const legibleDe = (detalle: string): string | undefined => {
  if (/0x[0-9a-f]{8}|no conoce/i.test(detalle)) return undefined;
  const limpio = detalle.trim().replace(/\.$/, '');
  return limpio === '' ? undefined : limpio.charAt(0).toLowerCase() + limpio.slice(1);
};

export const comoErrorNeutral = (
  dispositivoId: string,
  cuerpo: string,
  estadoHttp: number,
  extra?: { readonly desafioVencido?: boolean | undefined },
): ErrorDeEquipo => {
  const error = interpretarError(cuerpo);
  // H-SITIO-04 · el detalle lleva los cuatro campos del cuerpo ISAPI: es lo que
  // hay que comparar con la guía, y en sitio se perdía.
  const campos = resumenIsapiEnTexto(resumenIsapi(cuerpo));
  const detalle =
    `${error.detalle} (HTTP ${String(estadoHttp)}${error.codigo === null ? '' : `, ${error.codigo}`}` +
    `${campos === '' ? '' : ` · ${campos}`})`;
  // H-SITIO-12 · un 401 con el nonce vencido otra vez no es la clave.
  if (estadoHttp === 401 && extra?.desafioVencido === true) {
    return new DesafioVencido(dispositivoId);
  }
  /**
   * H-SITIO-12 · el `403` YA NO se lee siempre como credencial. La guía de la
   * terminal lo usa para «Invalid Operation / notSupport» con su código ISAPI
   * en el cuerpo (capítulo «Error Processing»): tratarlo como «usuario o
   * clave» mandaba a revisar una contraseña que estaba bien. Un 403 es
   * credencial sólo si el cuerpo lo dice.
   */
  const sinCodigoIsapi = error.codigo === null && !/statusCode|subStatusCode/i.test(cuerpo);
  if (
    estadoHttp === 401 ||
    error.reaccion === 'credencial_rechazada' ||
    (estadoHttp === 403 && sinCodigoIsapi)
  ) {
    return new CredencialRechazada(dispositivoId);
  }
  if (/faceLibraryFull|libraryFull|FDLibFull/i.test(cuerpo))
    return new BibliotecaLlena(dispositivoId, null);
  switch (error.reaccion) {
    case 'equipo_ocupado':
      return new EquipoOcupado(dispositivoId, detalle);
    case 'equipo_averiado':
      return new EquipoAveriado(dispositivoId, detalle, legibleDe(error.detalle));
    case 'reinicio_necesario':
      return new ReinicioNecesario(dispositivoId, detalle);
    case 'peticion_mal_formada':
    case 'placa_no_reconocible':
      return new PeticionRechazada(dispositivoId, detalle, legibleDe(error.detalle));
    default:
      return new EquipoAveriado(dispositivoId, detalle, legibleDe(error.detalle));
  }
};

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LAS LISTAS DE PLACAS DEL EQUIPO NO SE USAN · DECISIÓN, no omisión
 *
 * El equipo sabe guardar sus propias listas de placas y decidir con ellas. Es
 * **el competidor directo del motor de reglas**, y se descarta a propósito:
 *
 * · una decisión tomada por el equipo no sella `VersiónDeReglas`, así que
 *   nadie puede reconstruir después con qué reglas se abrió;
 * · no distingue vigencia, patrón de recurrencia, zona ni lista negra: sólo
 *   «está en la lista». RN-01, RN-06, RN-14 y RN-22 dejarían de aplicarse;
 * · su registro **se puede borrar por API** —el propio equipo declara
 *   `isSupportLPAuditDataDelete: true`—, así que no es evidencia auditable;
 * · y con `ctrlMod` en 1 ni siquiera se consultan: el equipo reporta y nosotros
 *   decidimos. Cargarlas sería preparar el camino para volver atrás.
 *
 * Queda escrito aquí, junto al código que podría usarlas, y no sólo en un
 * informe: quien vea `licensePlateAuditData` en la guía y se pregunte por qué
 * no está implementado, lo encuentra en el primer sitio donde mira.
 */
export const LISTAS_DEL_EQUIPO_NO_SE_USAN =
  'El motor de reglas decide; las listas internas del equipo no se cargan ni se consultan';
