import { ClienteDeEquipo, EquipoInalcanzable } from '../equipo/cliente';
import type { OpcionesDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';
import { interpretarError } from '../equipo/errores-del-fabricante';
import { etiqueta } from '../equipo/xml';
import { juzgarCapacidadesAnpr } from '../camara/capacidades-anpr';
import type { VeredictoDeCapacidadAnpr } from '../camara/capacidades-anpr';
import { leerVeredictoDeControl } from '../camara/veredicto-de-control';
import type { VeredictoDeControl } from '../camara/veredicto-de-control';
import { leerDisparador } from '../camara/disparadores-vinculados';
import type { VeredictoDeDisparador } from '../camara/disparadores-vinculados';
import { juzgarPais, leerDatosBasicos } from '../camara/pais-del-algoritmo';
import type { VeredictoDePais } from '../camara/pais-del-algoritmo';
import { juzgarReceptor } from '../camara/receptor-en-el-equipo';
import type { VeredictoDelReceptor } from '../camara/receptor-en-el-equipo';
import { reportaEstadoDeBarrera } from '../barrera/barrera-de-entrada';
import { CARRIL_VERIFICADO_DE_LA_CAMARA } from '../camara/carril';
import { descubrirCapacidades } from '../hikvision/capacidades-hikvision';
import type { CapacidadesDeEquipo } from '../nucleo/capacidades';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TODO LO QUE HAY QUE SABER DE UN EQUIPO, PREGUNTADO UNA VEZ
 *
 * La consola necesita enseñar seis cosas en la ficha de un equipo, y las seis
 * salen de consultas distintas al mismo aparato. Hacerlas desde la consola
 * obligaría a que la API nombrara seis rutas del fabricante — y ésa es la
 * frontera que KPI-11 vigila. Aquí se piden todas, se juzgan todas, y lo que
 * sale es un veredicto en lenguaje del operador.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NADA DE ESTO LANZA, Y ESO ES UNA DECISIÓN
 *
 * Un equipo puede contestar seis cosas y fallar en la séptima. Lanzar dejaría
 * la ficha vacía por una consulta que ese firmware no implementa, y el
 * operador vería «error» donde hay cinco respuestas útiles. Cada sección lleva
 * su propio desenlace y las que no se pudieron leer **se dicen**, que no es lo
 * mismo que dar por buena su ausencia.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * EL ORDEN IMPORTA, Y LA PRIMERA NO LLEVA CREDENCIALES
 *
 * La primera consulta es la de activación, que responde **sin autenticarse**.
 * Es lo único que separa «no hay ningún equipo en esa dirección» de «hay uno y
 * la credencial es mala». Sin ella las dos se ven igual, y esa confusión sale
 * cara: reintentar una credencial mala **bloquea la cuenta del equipo**.
 */

export type ClaseDeContacto = 'sin_equipo' | 'credencial' | 'alcanzado';

export interface ContactoConElEquipo {
  readonly clase: ClaseDeContacto;
  readonly detalle: string;
  readonly latenciaMs: number | null;
}

export interface HoraDelEquipo {
  readonly leida: string | null;
  /** Desvío respecto del reloj del servidor, en segundos. */
  readonly desvioSegundos: number | null;
  readonly excesiva: boolean;
  readonly detalle: string;
}

export type FamiliaDiagnosticada = 'camara' | 'terminal' | 'videoportero' | 'comun';

export interface DiagnosticoDeEquipo {
  /** De qué familia se preguntó: decide qué secciones tiene la ficha (O4). */
  readonly familia: FamiliaDiagnosticada;
  readonly contacto: ContactoConElEquipo;
  readonly modelo: string | null;
  readonly firmware: string | null;
  readonly serie: string | null;
  /** Sólo para cámaras: las tres vías por las que podría decidir sola. */
  readonly control: VeredictoDeControl | null;
  readonly disparador: VeredictoDeDisparador | null;
  readonly pais: VeredictoDePais | null;
  readonly receptor: VeredictoDelReceptor | null;
  readonly capacidades: VeredictoDeCapacidadAnpr | null;
  /** `null` cuando el equipo no declara si sabe informar del brazo. */
  readonly reportaEstadoDeBarrera: boolean | null;
  /**
   * O4 · lo que el equipo declara poder hacer, en el vocabulario NEUTRAL del
   * núcleo: verificación remota, biblioteca de rostros, apertura remota, canal
   * de audio… Es la misma pregunta que hace el proveedor antes de pedirle algo
   * (O2), hecha aquí una sola vez para que la ficha de una terminal o de un
   * videoportero tenga veredictos propios y no los de una cámara.
   */
  readonly capacidadesDelEquipo: CapacidadesDeEquipo | null;
  readonly hora: HoraDelEquipo | null;
  /** Consultas que no contestaron, con el motivo. Se enseñan, no se ocultan. */
  readonly sinRespuesta: readonly { readonly que: string; readonly motivo: string }[];
}

/** Desvío a partir del cual el reloj del equipo corrompe la trazabilidad. */
export const DESVIO_TOLERABLE_SEGUNDOS = 60;

export interface OpcionesDeDiagnostico extends OpcionesDeEquipo {
  /** `camara` pide las consultas que sólo tienen sentido en una cámara. */
  readonly familia: FamiliaDiagnosticada;
  readonly ahoraDelServidor?: () => Date;
  /** Carril de la cámara. Si no se declaró, el VERIFICADO (ver `camara/carril.ts`). */
  readonly canal?: number;
}

/** Lo que el equipo contesta cuando la ruta no existe en ese firmware. */
const rechazado = (cuerpo: string): boolean =>
  /notSupport|invalidOperation|notSupported/i.test(cuerpo);

export const diagnosticarEquipo = async (
  opciones: OpcionesDeDiagnostico,
): Promise<DiagnosticoDeEquipo> => {
  const cliente = new ClienteDeEquipo(opciones);
  const sinRespuesta: { que: string; motivo: string }[] = [];

  /** Pide una ruta del catálogo. `null` sin lanzar, anotando el motivo. */
  const pedir = async (proposito: string, familia = opciones.familia): Promise<string | null> => {
    const ruta = rutaPara(proposito, familia, opciones.canal ?? CARRIL_VERIFICADO_DE_LA_CAMARA);
    try {
      const respuesta = await cliente.pedir(ruta.metodo, ruta.ruta);
      /**
       * ═══════════════════════════════════════════════════════════════════════
       * UN `200` CON UN RECHAZO DENTRO NO ES UNA RESPUESTA
       *
       * Así rechazan estos equipos: contestan `200` y meten el motivo en el
       * cuerpo. Mirar sólo el código de estado daba por leído un documento que
       * no existe, y el juez de turno lo interpretaba como «el equipo no
       * declara nada» — que es un veredicto **sobre el equipo** construido con
       * una respuesta que nunca vino.
       *
       * La diferencia importa: «no lo soporta» se anota y se enseña; «no lo
       * declara» bloquea. Confundirlos acusa al aparato de lo que no hizo.
       */
      if (!respuesta.ok || rechazado(respuesta.cuerpo)) {
        sinRespuesta.push({ que: proposito, motivo: interpretarError(respuesta.cuerpo).detalle });
        return null;
      }
      return respuesta.cuerpo;
    } catch (error) {
      sinRespuesta.push({
        que: proposito,
        motivo: error instanceof EquipoInalcanzable ? error.detalle : 'no se pudo consultar',
      });
      return null;
    }
  };

  const contacto = await contactar(cliente, opciones);
  if (contacto.clase !== 'alcanzado') {
    return {
      familia: opciones.familia,
      contacto,
      modelo: null,
      firmware: null,
      serie: null,
      control: null,
      disparador: null,
      pais: null,
      receptor: null,
      capacidades: null,
      reportaEstadoDeBarrera: null,
      capacidadesDelEquipo: null,
      hora: null,
      sinRespuesta,
    };
  }

  const identidad = await pedir('leer la identidad del equipo (modelo, firmware, serie)', 'comun');

  const esCamara = opciones.familia === 'camara';
  const control = esCamara
    ? await pedir('leer quién controla la barrera: la cámara o la plataforma')
    : null;
  const disparador = esCamara
    ? await pedir('leer si un disparador vinculado acciona la barrera')
    : null;
  const basicos = esCamara
    ? await pedir('leer el país con el que el algoritmo lee las placas')
    : null;
  const paisAdmitido = esCamara
    ? await pedir('leer qué países admite el algoritmo de este equipo')
    : null;
  const receptor = esCamara ? await pedir('leer a qué receptor publica el equipo') : null;
  const barrera = esCamara
    ? await pedir('leer si este modelo reporta el estado de la barrera')
    : null;
  const capacidadSistema = await pedir('leer las capacidades del equipo', 'comun');
  const capacidadItc = esCamara
    ? await pedir('leer las capacidades de reconocimiento del módulo de entrada')
    : null;
  const capacidadTrafico = esCamara
    ? await pedir('leer las capacidades de tráfico del equipo')
    : null;
  const capacidadDisparo = esCamara
    ? await pedir('leer qué modos de disparo admite el equipo')
    : null;
  const hora = await pedir('leer la hora del equipo', 'comun');

  /**
   * Las capacidades neutrales, con el mismo cliente y en la misma ronda. Un
   * fallo aquí no vacía la ficha: se anota qué no se pudo leer y el resto se
   * enseña. Una credencial rechazada a estas alturas no puede ocurrir —el
   * contacto ya la aceptó—, y si ocurriera se anota igual, sin reintentar.
   */
  let capacidadesDelEquipo: CapacidadesDeEquipo | null = null;
  try {
    capacidadesDelEquipo = await descubrirCapacidades({
      cliente,
      familia: opciones.familia,
      ...(opciones.canal === undefined ? {} : { canal: opciones.canal }),
    });
  } catch (error) {
    sinRespuesta.push({
      que: 'descubrir lo que el equipo declara poder hacer',
      motivo: error instanceof Error ? error.message : 'no se pudo consultar',
    });
  }

  return {
    familia: opciones.familia,
    contacto,
    modelo: identidad === null ? null : etiqueta(identidad, 'model'),
    firmware: identidad === null ? null : etiqueta(identidad, 'firmwareVersion'),
    serie: identidad === null ? null : etiqueta(identidad, 'serialNumber'),
    control: control === null ? null : leerVeredictoDeControl(control),
    disparador: disparador === null ? null : leerDisparador(disparador),
    pais: basicos === null ? null : juzgarPais(leerDatosBasicos(basicos), paisAdmitido ?? ''),
    receptor: receptor === null ? null : juzgarReceptor(receptor),
    capacidades: esCamara
      ? juzgarCapacidadesAnpr({
          ...(capacidadSistema === null ? {} : { sistema: capacidadSistema }),
          ...(capacidadItc === null ? {} : { itc: capacidadItc }),
          ...(capacidadTrafico === null ? {} : { trafico: capacidadTrafico }),
          ...(capacidadDisparo === null ? {} : { modoDeDisparo: capacidadDisparo }),
        })
      : null,
    reportaEstadoDeBarrera: barrera === null ? null : reportaEstadoDeBarrera(barrera),
    capacidadesDelEquipo,
    hora:
      hora === null ? null : juzgarHora(hora, (opciones.ahoraDelServidor ?? (() => new Date()))()),
    sinRespuesta,
  };
};

/**
 * Las dos primeras preguntas, en este orden, y por lo que se explica arriba.
 */
const contactar = async (
  cliente: ClienteDeEquipo,
  opciones: OpcionesDeDiagnostico,
): Promise<ContactoConElEquipo> => {
  const activacion = rutaPara(
    'saber si hay un equipo en esa dirección, sin presentar credenciales',
    'comun',
  );
  let hayEquipo = false;
  let latencia: number | null = null;
  try {
    const respuesta = await cliente.pedir(activacion.metodo, activacion.ruta);
    latencia = respuesta.latenciaMs;
    // Cualquier respuesta HTTP —incluso un rechazo— demuestra que hay algo
    // escuchando ahí. Es lo único que se quiere saber en este paso.
    hayEquipo = true;
  } catch {
    hayEquipo = false;
  }

  const identidad = rutaPara('leer la identidad del equipo (modelo, firmware, serie)', 'comun');
  try {
    const respuesta = await cliente.pedir(identidad.metodo, identidad.ruta);
    if (respuesta.estado === 401 || respuesta.estado === 403) {
      return {
        clase: 'credencial',
        detalle:
          'Hay un equipo en esa dirección y rechazó el usuario o la clave. NO reintente a ' +
          'ciegas: estos aparatos bloquean la cuenta tras unos pocos intentos fallidos',
        latenciaMs: respuesta.latenciaMs,
      };
    }
    if (!respuesta.ok) {
      const error = interpretarError(respuesta.cuerpo);
      return error.reaccion === 'credencial_rechazada'
        ? {
            clase: 'credencial',
            detalle: 'El equipo rechazó la credencial. NO reintente a ciegas: bloquea la cuenta',
            latenciaMs: respuesta.latenciaMs,
          }
        : {
            clase: 'alcanzado',
            detalle: `El equipo responde con un error: ${error.detalle}`,
            latenciaMs: respuesta.latenciaMs,
          };
    }
    return {
      clase: 'alcanzado',
      detalle: 'El equipo responde y acepta la credencial',
      latenciaMs: respuesta.latenciaMs,
    };
  } catch (error) {
    const detalle = error instanceof EquipoInalcanzable ? error.detalle : 'no contesta';
    return {
      clase: hayEquipo ? 'credencial' : 'sin_equipo',
      detalle: hayEquipo
        ? `Hay algo escuchando en ${opciones.host} pero no contestó a la consulta de ` +
          `identidad: ${detalle}`
        : `No hay ningún equipo respondiendo en ${opciones.host}. ${detalle}`,
      latenciaMs: latencia,
    };
  }
};

/**
 * El reloj del equipo, que es invisible hasta que corrompe la trazabilidad.
 *
 * Un equipo con la hora corrida no falla en nada: fecha mal cada evento, y el
 * histórico queda desplazado sin un solo error en el registro. Se descubre
 * cuando una auditoría compara dos fuentes, que es el peor momento posible.
 */
export const juzgarHora = (cuerpo: string, ahoraDelServidor: Date): HoraDelEquipo => {
  const leida = etiqueta(cuerpo, 'localTime') ?? etiqueta(cuerpo, 'time');
  if (leida === null || Number.isNaN(Date.parse(leida))) {
    return {
      leida,
      desvioSegundos: null,
      excesiva: false,
      detalle: 'El equipo no declaró su hora en un formato utilizable',
    };
  }
  const desvio = Math.round((Date.parse(leida) - ahoraDelServidor.getTime()) / 1000);
  const excesiva = Math.abs(desvio) > DESVIO_TOLERABLE_SEGUNDOS;
  return {
    leida,
    desvioSegundos: desvio,
    excesiva,
    detalle: excesiva
      ? `El reloj del equipo va ${String(Math.abs(desvio))} s ${desvio > 0 ? 'adelantado' : 'atrasado'} ` +
        'respecto del servidor. No produce ningún error: fecha mal los eventos, y eso sólo ' +
        'se ve cuando una auditoría compara dos fuentes'
      : `El reloj del equipo está dentro de tolerancia (${String(desvio)} s)`,
  };
};
