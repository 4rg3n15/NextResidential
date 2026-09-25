import { ClienteDeEquipo, EquipoInalcanzable } from '../equipo/cliente';
import type { OpcionesDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';
import { interpretarError } from '../equipo/errores-del-fabricante';
import { etiqueta, reemplazarEtiqueta } from '../equipo/xml';
import { ETIQUETA_DE_MODO, MODO_EXIGIDO } from '../camara/modo-de-control';
import {
  PAIS_COLOMBIA,
  camposObligatoriosQueFaltan,
  conPaisCorregido,
} from '../camara/pais-del-algoritmo';
import { IMAGENES } from '../camara/receptor-en-el-equipo';
import { CARRIL_VERIFICADO_DE_LA_CAMARA } from '../camara/carril';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * CAMBIAR ALGO EN EL EQUIPO · leer, modificar, escribir, y con firma
 *
 * Estos esquemas **no admiten campos sueltos**: el `PUT` exige el documento
 * completo. Enviar sólo lo que se quiere cambiar borra el resto —el
 * identificador del punto de captura, la descripción, la región—, y el equipo
 * lo acepta sin rechistar. Por eso aquí no hay ninguna función que construya un
 * documento desde cero: **todas leen primero** y devuelven lo demás tal cual
 * vino.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * Y NINGUNA SE APLICA SOLA
 *
 * Cambiar quién controla una barrera, o con qué gramática lee las placas una
 * cámara, es la clase de acción que nadie ve venir si la hace un arranque
 * automático. Hace falta:
 *
 * · **confirmación explícita** de una persona con autoridad —sin ella no se
 *   emite la petición—, y
 * · el valor **anterior y el nuevo** de vuelta, para que quien llama deje traza
 *   en `auditoria_seguridad` (quién, cuándo, de qué a qué).
 *
 * §2.1.4 en una frase: ante la duda, no tocar el aparato.
 */

export type ClaseDeCorreccion =
  | 'modo_de_control'
  | 'pais_del_algoritmo'
  | 'imagenes_del_receptor'
  | 'formato_del_receptor';

export interface ResultadoDeCorreccion {
  readonly clase: ClaseDeCorreccion;
  readonly aplicada: boolean;
  readonly valorAnterior: string | null;
  readonly valorNuevo: string | null;
  readonly detalle: string;
}

export class CorreccionSinConfirmar extends Error {
  constructor(readonly clase: ClaseDeCorreccion) {
    super(
      `La corrección «${clase}» cambia la configuración de un equipo de acceso y no se aplica ` +
        'sin confirmación explícita de una persona. No es una formalidad: un arranque que ' +
        'corrigiera equipos por su cuenta sería la acción que nadie ve venir',
    );
    this.name = 'CorreccionSinConfirmar';
  }
}

export interface OpcionesDeCorreccion extends OpcionesDeEquipo {
  readonly clase: ClaseDeCorreccion;
  /** Quién la autoriza. Vacío = no se emite la petición. */
  readonly confirmadaPor: string;
  /** Para el país: el índice a fijar. Por omisión, Colombia. */
  readonly indiceDePais?: number;
  /** Para las imágenes: qué debe enviar el equipo. Nunca `all`. */
  readonly imagenes?: string;
}

/**
 * Lo que el equipo contesta cuando la ruta no existe en ese firmware, **con
 * HTTP 200**. Mirar sólo el código de estado daría por leído un documento que
 * no existe, y escribir después lo que salga de ahí es cómo se borra la
 * configuración de un equipo con una corrección.
 */
const rechazado = (cuerpo: string): boolean =>
  /notSupport|invalidOperation|notSupported/i.test(cuerpo);

const noAplicada = (
  clase: ClaseDeCorreccion,
  detalle: string,
  anterior: string | null = null,
): ResultadoDeCorreccion => ({
  clase,
  aplicada: false,
  valorAnterior: anterior,
  valorNuevo: null,
  detalle,
});

/**
 * Lee el documento, cambia un campo y lo devuelve entero.
 *
 * Devuelve `null` en vez de lanzar cuando el documento no trae el campo: que
 * falte es información —este firmware no lo tiene— y quien llama tiene que
 * poder decirlo en pantalla en vez de ver una excepción.
 */
const leerYModificar = async (
  cliente: ClienteDeEquipo,
  propositoDeLectura: string,
  campo: string,
  valor: string,
): Promise<{ anterior: string | null; documento: string } | null> => {
  const lectura = rutaPara(propositoDeLectura, 'camara', CARRIL_VERIFICADO_DE_LA_CAMARA);
  const respuesta = await cliente.pedir(lectura.metodo, lectura.ruta);
  if (!respuesta.ok || rechazado(respuesta.cuerpo)) return null;
  const anterior = etiqueta(respuesta.cuerpo, campo);
  const documento = reemplazarEtiqueta(respuesta.cuerpo, campo, valor);
  return documento === null ? null : { anterior, documento };
};

const escribir = async (
  cliente: ClienteDeEquipo,
  propositoDeEscritura: string,
  documento: string,
): Promise<{ ok: boolean; detalle: string }> => {
  const ruta = rutaPara(propositoDeEscritura, 'camara', CARRIL_VERIFICADO_DE_LA_CAMARA);
  const respuesta = await cliente.pedir(ruta.metodo, ruta.ruta, {
    tipo: 'application/xml',
    contenido: documento,
  });
  return respuesta.ok && !rechazado(respuesta.cuerpo)
    ? { ok: true, detalle: 'El equipo aceptó el cambio' }
    : { ok: false, detalle: interpretarError(respuesta.cuerpo).detalle };
};

export const aplicarCorreccion = async (
  opciones: OpcionesDeCorreccion,
): Promise<ResultadoDeCorreccion> => {
  if (opciones.confirmadaPor.trim() === '') throw new CorreccionSinConfirmar(opciones.clase);
  if (opciones.imagenes === IMAGENES.todo) {
    // Proponer que el equipo envíe rostros no es una corrección: es lo
    // contrario de lo que esta función existe para hacer (RN-09, RN-10).
    return noAplicada(
      opciones.clase,
      'No se configura un equipo para que envíe recortes de rostro: es dato biométrico sin ' +
        'consentimiento del titular, y la ley pide minimizar en el origen',
    );
  }

  const cliente = new ClienteDeEquipo(opciones);
  try {
    switch (opciones.clase) {
      case 'modo_de_control':
        return await corregirModo(cliente);
      case 'pais_del_algoritmo':
        return await corregirPais(cliente, opciones.indiceDePais ?? PAIS_COLOMBIA);
      case 'imagenes_del_receptor':
        return await corregirCampoDelReceptor(
          cliente,
          'imagenes_del_receptor',
          'detectionUpLoadPicturesType',
          opciones.imagenes ?? IMAGENES.soloDeteccion,
        );
      case 'formato_del_receptor':
        return await corregirCampoDelReceptor(
          cliente,
          'formato_del_receptor',
          'parameterFormatType',
          'XML',
        );
    }
  } catch (error) {
    if (error instanceof EquipoInalcanzable) {
      return noAplicada(opciones.clase, `No se pudo alcanzar el equipo: ${error.detalle}`);
    }
    throw error;
  }
};

const corregirModo = async (cliente: ClienteDeEquipo): Promise<ResultadoDeCorreccion> => {
  // Se escribe la grafía del ESQUEMA (`ctrlMode`, con «e»), que es la que el
  // equipo valida. Al leer se aceptan las dos porque el documento usa las dos.
  const leido = await leerYModificar(
    cliente,
    'leer quién controla la barrera: la cámara o la plataforma',
    ETIQUETA_DE_MODO,
    '1',
  );
  if (leido === null) {
    return noAplicada(
      'modo_de_control',
      'El equipo no devolvió un documento de parámetros de entrada con el campo del modo de ' +
        'control. No se escribe a ciegas: un documento incompleto borraría el resto',
    );
  }
  const escrito = await escribir(cliente, 'corregir quién controla la barrera', leido.documento);
  return {
    clase: 'modo_de_control',
    aplicada: escrito.ok,
    valorAnterior: leido.anterior,
    valorNuevo: escrito.ok ? '1' : null,
    detalle: escrito.ok
      ? `La barrera pasa a estar controlada por la plataforma (${MODO_EXIGIDO})`
      : escrito.detalle,
  };
};

const corregirPais = async (
  cliente: ClienteDeEquipo,
  indice: number,
): Promise<ResultadoDeCorreccion> => {
  const lectura = rutaPara(
    'leer el país con el que el algoritmo lee las placas',
    'camara',
    CARRIL_VERIFICADO_DE_LA_CAMARA,
  );
  const respuesta = await cliente.pedir(lectura.metodo, lectura.ruta);
  if (!respuesta.ok || rechazado(respuesta.cuerpo)) {
    return noAplicada('pais_del_algoritmo', 'El equipo no devolvió los datos básicos del canal');
  }

  // La red que hace de leer-modificar-escribir una disciplina verificable: si
  // el documento no trae todo lo obligatorio, no se escribe.
  const faltan = camposObligatoriosQueFaltan(respuesta.cuerpo);
  if (faltan.length > 0) {
    return noAplicada(
      'pais_del_algoritmo',
      `El documento del equipo no trae ${faltan.join(', ')}. Escribirlo sin esos campos ` +
        'borraría la identificación del punto de captura',
      etiqueta(respuesta.cuerpo, 'CRIndex'),
    );
  }

  const documento = conPaisCorregido(respuesta.cuerpo, indice);
  if (documento === null) {
    return noAplicada('pais_del_algoritmo', 'El documento del equipo no trae el campo del país');
  }
  const escrito = await escribir(cliente, 'fijar el país del algoritmo', documento);
  return {
    clase: 'pais_del_algoritmo',
    aplicada: escrito.ok,
    valorAnterior: etiqueta(respuesta.cuerpo, 'CRIndex'),
    valorNuevo: escrito.ok ? String(indice) : null,
    detalle: escrito.ok
      ? `El algoritmo pasa a leer con la gramática de placa del país ${String(indice)}`
      : escrito.detalle,
  };
};

const corregirCampoDelReceptor = async (
  cliente: ClienteDeEquipo,
  clase: ClaseDeCorreccion,
  campo: string,
  valor: string,
): Promise<ResultadoDeCorreccion> => {
  const leido = await leerYModificar(
    cliente,
    'leer a qué receptor publica el equipo',
    campo,
    valor,
  );
  if (leido === null) {
    return noAplicada(clase, 'El equipo no devolvió una configuración de notificación utilizable');
  }
  const escrito = await escribir(cliente, 'apuntar el equipo a nuestro receptor', leido.documento);
  return {
    clase,
    aplicada: escrito.ok,
    valorAnterior: leido.anterior,
    valorNuevo: escrito.ok ? valor : null,
    detalle: escrito.ok ? `El equipo pasa a usar «${valor}»` : escrito.detalle,
  };
};
