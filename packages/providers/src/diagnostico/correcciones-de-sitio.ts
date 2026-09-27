import type { ClienteDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';
import { interpretarError } from '../equipo/errores-del-fabricante';
import { bloques, escapar, reemplazarEtiqueta } from '../equipo/xml';
import { confirmada } from '../equipo/confirmacion-isapi';
import { CAMPOS_DE_VERIFICACION_REMOTA } from '../hikvision/capacidades-hikvision';
import { IMAGENES, cuerpoDeReceptor, leerReceptores } from '../camara/receptor-en-el-equipo';
import { CARRIL_VERIFICADO_DE_LA_CAMARA } from '../camara/carril';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LAS DOS ESCRITURAS DEL DÍA DE ENTREGA · corrección de la 15-L
 *
 *  · C2 · «Enviar eventos a este Mac»: el servidor de alarmas de la cámara
 *    (IP, puerto y ruta con el secreto) apunta a la IP ACTUAL del Mac, que
 *    cambia de la casa al sitio.
 *  · F2 (e) · «Verificación remota: activar/desactivar»: el plan B sin código
 *    si la terminal no recibe el veredicto a tiempo.
 *
 * Las dos siguen la disciplina de `correcciones.ts` —leer el documento entero,
 * cambiar sólo lo necesario, escribirlo completo, confirmación explícita y
 * valor anterior y nuevo para la auditoría— y añaden lo que ninguna de las
 * anteriores hacía: LEER DE VUELTA. Un `statusCode 1` dice que el equipo
 * aceptó la petición; que la configuración quedó como se pidió sólo lo dice la
 * lectura posterior. Sin ella, «aplicada» sería una promesa del aparato.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface ResultadoDeEscritura {
  readonly aplicada: boolean;
  readonly valorAnterior: string | null;
  readonly valorNuevo: string | null;
  readonly detalle: string;
}

const rechazado = (cuerpo: string): boolean =>
  /notSupport|invalidOperation|notSupported/i.test(cuerpo);

const noAplicada = (detalle: string, anterior: string | null = null): ResultadoDeEscritura => ({
  aplicada: false,
  valorAnterior: anterior,
  valorNuevo: null,
  detalle,
});

// ── C2 · EL SERVIDOR DE ALARMAS DE LA CÁMARA ────────────────────────────────

export interface DestinoDeEventos {
  readonly ip: string;
  readonly puerto: number;
  /** Ruta con el secreto del equipo. NUNCA sale en el resultado ni en la bitácora. */
  readonly ruta: string;
}

/** «ip:puerto» de un receptor, sin la ruta: la ruta lleva el secreto. */
const direccion = (host: string | null, puerto: number | null): string | null =>
  host === null ? null : `${host}:${String(puerto ?? 80)}`;

/**
 * El primer receptor del documento, con la dirección, el puerto y la ruta
 * nuevos; el resto del bloque tal cual. Un receptor por nombre pasa a IP: la
 * IP es justo lo que se está fijando. `null` si el bloque no trae los campos.
 */
export const conDestino = (documento: string, destino: DestinoDeEventos): string | null => {
  const primero = bloques(documento, 'HttpHostNotification')[0];
  if (primero === undefined) return null;
  let bloque = primero.replace(
    /<(?:\w+:)?hostName>[^<]*<\/(?:\w+:)?hostName>/i,
    `<ipAddress>${escapar(destino.ip)}</ipAddress>`,
  );
  for (const [campo, valor] of [
    ['ipAddress', escapar(destino.ip)],
    ['portNo', String(destino.puerto)],
    ['url', escapar(destino.ruta)],
  ] as const) {
    const cambiado = reemplazarEtiqueta(bloque, campo, valor);
    if (cambiado === null) return null;
    bloque = cambiado;
  }
  bloque = reemplazarEtiqueta(bloque, 'addressingFormatType', 'ipaddress') ?? bloque;
  return documento.replace(primero, bloque);
};

/**
 * Apunta la cámara a este Mac y lo comprueba leyéndolo de vuelta. Una cámara
 * sin ningún receptor recibe uno completo (el esquema entero, sólo con la
 * imagen de detección: nunca rostros, H-16-1).
 */
export const corregirReceptorDeEventos = async (
  cliente: ClienteDeEquipo,
  destino: DestinoDeEventos,
): Promise<ResultadoDeEscritura> => {
  const lectura = rutaPara(
    'leer a qué receptor publica el equipo',
    'camara',
    CARRIL_VERIFICADO_DE_LA_CAMARA,
  );
  const leida = await cliente.pedir(lectura.metodo, lectura.ruta);
  if (!leida.ok || rechazado(leida.cuerpo)) {
    return noAplicada(
      'La cámara no devolvió su configuración de servidor de alarmas: no se escribe a ciegas',
    );
  }
  const previo = leerReceptores(leida.cuerpo)[0];
  const anterior = previo === undefined ? null : direccion(previo.host, previo.puerto);
  const documento =
    previo === undefined
      ? cuerpoDeReceptor({
          id: 1,
          url: destino.ruta,
          host: destino.ip,
          puerto: destino.puerto,
          esNombre: false,
          imagenes: IMAGENES.soloDeteccion,
          conAcreditacion: false,
          seguro: false,
        })
      : conDestino(leida.cuerpo, destino);
  if (documento === null) {
    return noAplicada(
      'El receptor de la cámara no trae dirección, puerto o ruta: escribirlo sin esos campos ' +
        'borraría el resto de su configuración',
      anterior,
    );
  }
  const escritura = rutaPara('apuntar el equipo a nuestro receptor', 'camara');
  const escrita = await cliente.pedir(escritura.metodo, escritura.ruta, {
    tipo: 'application/xml',
    contenido: documento,
  });
  if (!confirmada(escrita) || rechazado(escrita.cuerpo)) {
    return noAplicada(interpretarError(escrita.cuerpo).detalle, anterior);
  }
  const deVuelta = await cliente.pedir(lectura.metodo, lectura.ruta);
  const ahora = deVuelta.ok ? leerReceptores(deVuelta.cuerpo)[0] : undefined;
  const coincide =
    ahora !== undefined &&
    ahora.host === destino.ip &&
    (ahora.puerto ?? 80) === destino.puerto &&
    ahora.url === destino.ruta;
  const nuevo = `${destino.ip}:${String(destino.puerto)}`;
  return coincide
    ? {
        aplicada: true,
        valorAnterior: anterior,
        valorNuevo: nuevo,
        detalle: `La cámara publicará sus eventos en ${nuevo} (confirmado al leerlo de vuelta)`,
      }
    : noAplicada(
        'La cámara aceptó el cambio, pero al leerlo de vuelta no apunta a este Mac ' +
          `(${ahora === undefined ? 'no devolvió su configuración' : (direccion(ahora.host, ahora.puerto) ?? 'sin dirección')}). ` +
          'Revise el servidor de alarmas en la interfaz del equipo',
        anterior,
      );
};

// ── F2 (e) · LA VERIFICACIÓN REMOTA, ACTIVAR O DESACTIVAR ─────────────────────

export interface AjustesDeVerificacion {
  /** `true` = reporta y espera el veredicto; `false` = la terminal decide sola. */
  readonly activar: boolean;
  readonly abrirSinPlataforma: boolean;
  readonly plazoS?: number;
}

const acsDe = (cuerpo: string): Record<string, unknown> | null => {
  try {
    const documento = JSON.parse(cuerpo) as Record<string, unknown>;
    const acs = documento['AcsCfg'];
    return typeof acs === 'object' && acs !== null ? (acs as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/**
 * Activar es cambiar quién decide (A2): la terminal REPORTA y espera. Se
 * escribe el canal `ISAPI`, el plazo del `.env` y `offlineDevCheckOpenDoorEnabled`
 * como diga el `.env`. Desactivar sólo apaga el interruptor: es el plan B
 * cuando el veredicto no llega a tiempo, y la terminal vuelve a abrir con su
 * propio reconocimiento —el motor deja de decidir, y la ficha lo dice—.
 */
export const corregirVerificacionRemota = async (
  cliente: ClienteDeEquipo,
  ajustes: AjustesDeVerificacion,
): Promise<ResultadoDeEscritura> => {
  const lectura = rutaPara('leer si la terminal espera el veredicto de la plataforma', 'terminal');
  const respuesta = await cliente.pedir(lectura.metodo, lectura.ruta);
  if (!respuesta.ok || rechazado(respuesta.cuerpo)) {
    return noAplicada(
      'El equipo no devolvió su configuración de control de acceso: este firmware no ' +
        'declara la verificación remota y no se escribe a ciegas',
    );
  }
  const acs = acsDe(respuesta.cuerpo);
  if (acs === null) return noAplicada('La configuración del equipo no es JSON legible');
  // H-SITIO-05 · el interruptor de la guía es `remoteCheckDoorEnabled`; el
  // supuesto S-35 (`remoteCheck`) sólo si el documento trae ése.
  const campo = CAMPOS_DE_VERIFICACION_REMOTA.find((c) => c in acs);
  if (campo === undefined) {
    return noAplicada(
      'La configuración del equipo no trae el campo de verificación remota: este modelo ' +
        'no la admite. Es un hallazgo de BLOQUEO: no se opera contra una terminal que decide sola',
    );
  }
  const anterior = String(acs[campo]);
  const documento = JSON.parse(respuesta.cuerpo) as Record<string, unknown>;
  const corregido = {
    ...documento,
    AcsCfg: ajustes.activar
      ? {
          ...acs,
          [campo]: true,
          checkChannelType: 'ISAPI',
          offlineDevCheckOpenDoorEnabled: ajustes.abrirSinPlataforma,
          ...(ajustes.plazoS === undefined ? {} : { remoteCheckTimeout: ajustes.plazoS }),
        }
      : { ...acs, [campo]: false },
  };
  const escritura = rutaPara(
    'fijar que la terminal espere el veredicto de la plataforma',
    'terminal',
  );
  const escrito = await cliente.pedir(escritura.metodo, escritura.ruta, {
    tipo: 'application/json',
    contenido: JSON.stringify(corregido),
  });
  if (!confirmada(escrito) || rechazado(escrito.cuerpo)) {
    return noAplicada(interpretarError(escrito.cuerpo).detalle, anterior);
  }
  const deVuelta = await cliente.pedir(lectura.metodo, lectura.ruta);
  const leido = deVuelta.ok ? acsDe(deVuelta.cuerpo)?.[campo] : undefined;
  if (leido !== ajustes.activar) {
    return noAplicada(
      'La terminal aceptó el cambio, pero al leerlo de vuelta la verificación remota sigue ' +
        `${leido === true ? 'activada' : leido === false ? 'desactivada' : 'sin poder leerse'}`,
      anterior,
    );
  }
  return {
    aplicada: true,
    valorAnterior: anterior,
    valorNuevo: String(ajustes.activar),
    detalle: ajustes.activar
      ? `La terminal reporta y espera el veredicto de la plataforma (${campo}; confirmado al leerlo de vuelta)`
      : 'La terminal vuelve a decidir sola con su reconocimiento: la plataforma registra, pero ' +
        'ya no decide el acceso (confirmado al leerlo de vuelta)',
  };
};
