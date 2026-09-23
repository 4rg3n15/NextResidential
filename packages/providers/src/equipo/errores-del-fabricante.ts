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
  /** No lo conocemos. Se trata como fallo técnico y se registra el código. */
  | 'desconocida';

export interface ErrorDelFabricante {
  readonly codigo: string | null;
  readonly reaccion: ReaccionAlError;
  /** En lenguaje del operador, sin vocabulario del fabricante. */
  readonly detalle: string;
  /** `true` sólo donde reintentar tiene sentido y no cuesta nada. */
  readonly reintentable: boolean;
}

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

/** Saca el código del cuerpo de respuesta, venga como `0x…` o como nombre. */
const codigoEn = (cuerpo: string): string | null => {
  const hexadecimal = /0x[0-9a-f]{8}/i.exec(cuerpo)?.[0];
  if (hexadecimal !== undefined) return hexadecimal.toLowerCase();
  // Algunos firmware devuelven sólo el nombre en `subStatusCode`.
  const nombre = /<subStatusCode>\s*([A-Za-z]+)\s*<\/subStatusCode>/i.exec(cuerpo)?.[1];
  if (nombre === undefined) return null;
  const encontrado = Object.entries(CODIGOS_DEL_FABRICANTE).find(
    ([clave]) => clave.toLowerCase() === nombre.toLowerCase(),
  );
  return encontrado === undefined ? null : encontrado[1].toLowerCase();
};

export const interpretarError = (cuerpo: string): ErrorDelFabricante => {
  const codigo = codigoEn(cuerpo);
  const conocido = codigo === null ? undefined : POR_CODIGO[codigo];
  if (conocido === undefined) {
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
    };
  }
  return { codigo, ...conocido };
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
