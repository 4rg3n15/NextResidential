/**
 * EL CATÁLOGO DE RUTAS, CON SU PROCEDENCIA AL LADO. Un solo sitio.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE, Y POR QUÉ CADA ENTRADA LLEVA ETIQUETA
 *
 * Este proyecto prohíbe **deducir una ruta por analogía**. No es una regla de
 * estilo: suponer que la barrera vivía en `Traffic` o en `System/IO` porque así
 * es en otra familia costó dos intentos fallidos contra el equipo real, y el
 * aparato contestó `notSupport` a los dos. De ahí la regla y de ahí esto.
 *
 * Hoy sólo **una** ruta está VERIFICADA: la de la barrera, capturada del
 * JavaScript de la interfaz del propio equipo el 15/09/2026 y reproducida
 * después con una petición manual. Todas las demás salen de la documentación
 * ISAPI del fabricante y están marcadas **DOCUMENTADA, NO VERIFICADA**: se han
 * escrito para poder construir y probar el adaptador entero sin equipo
 * (ADR-03), y se confirman o se desmienten en sitio con
 * `scripts/puesta-en-marcha-equipos.mjs`.
 *
 * **Lo que una etiqueta `documentada` significa en la práctica:** que el
 * adaptador que la usa puede fallar contra el aparato con `notSupport` o con
 * un `404`, que ese fallo es **esperado y está previsto**, y que la salida no
 * es adivinar otra ruta sino capturar la buena y cambiarla AQUÍ.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NINGUNA RUTA FUERA DE ESTE PAQUETE
 *
 * KPI-11 lo comprueba y rompe la construcción. Lo que sale de `packages/
 * providers` es intención —«abre», «sincroniza esta plantilla»—, nunca el
 * nombre de un módulo del fabricante.
 */

export type Procedencia = 'verificada' | 'documentada';

export interface RutaDeEquipo {
  /** Nombre en lenguaje del dominio: es lo que se lee en un informe. */
  readonly proposito: string;
  readonly metodo: string;
  readonly ruta: string;
  readonly procedencia: Procedencia;
  /** Familia de equipo a la que aplica. */
  readonly familia: 'camara' | 'terminal' | 'videoportero' | 'comun';
  /** De dónde salió, literal. Una etiqueta sin procedencia no vale nada. */
  readonly fuente: string;
  /**
   * Qué comprobar en sitio para ascenderla a VERIFICADA. Vacío en las que ya
   * lo están.
   */
  readonly confirmarEnSitio?: string;
  /**
   * El cuerpo de la petición, **cuando lo lleva**.
   *
   * Vive aquí y no en quien la invoca porque el cuerpo es vocabulario del
   * fabricante tanto como la ruta: nombres de elemento y de campo. KPI-11 lo
   * comprobó en cuanto el guion de puesta en marcha los escribió por su
   * cuenta, y tenía razón — el guion no tiene por qué saber cómo se llama el
   * campo de modo de una barrera.
   */
  readonly cuerpo?: { readonly tipo: string; readonly contenido: string };
  /** `true` si mueve algo físico. Quien la invoca decide si eso le conviene. */
  readonly acciona?: boolean;
  /**
   * `true` si CAMBIA el estado del equipo o se lo quita a otro: alta y
   * supresión de plantilla, y el canal de audio. No se sondean a ciegas.
   */
  readonly dejaRastro?: boolean;
}

const CANAL_POR_OMISION = 1;

export const RUTAS: readonly RutaDeEquipo[] = [
  // ── VERIFICADA · la única ────────────────────────────────────────────────
  {
    proposito: 'accionar la barrera vehicular',
    metodo: 'PUT',
    ruta: `/ISAPI/Parking/channels/${String(CANAL_POR_OMISION)}/barrierGate`,
    procedencia: 'verificada',
    familia: 'camara',
    fuente:
      'Capturada del JavaScript de la interfaz del equipo el 15/09/2026 y reproducida ' +
      'con una petición manual. DS-TCG405-E, V5.4.0 build 250425. No es `Traffic` ni ' +
      '`System/IO`: los dos contestaron `notSupport`',
    acciona: true,
    cuerpo: {
      tipo: 'application/xml',
      contenido:
        '<?xml version="1.0" encoding="UTF-8"?><BarrierGate><ctrlMode>open</ctrlMode></BarrierGate>',
    },
  },

  // ── COMUNES · identidad y capacidades ────────────────────────────────────
  {
    proposito: 'leer la identidad del equipo (modelo, firmware, serie)',
    metodo: 'GET',
    ruta: '/ISAPI/System/deviceInfo',
    procedencia: 'documentada',
    familia: 'comun',
    fuente: 'Documentación ISAPI del fabricante, sección de sistema',
    confirmarEnSitio: 'que responda 200 con XML y que el modelo coincida con el rótulo',
  },
  {
    proposito: 'leer las capacidades del equipo',
    metodo: 'GET',
    ruta: '/ISAPI/System/capabilities',
    procedencia: 'documentada',
    familia: 'comun',
    fuente: 'Documentación ISAPI del fabricante, sección de sistema',
    confirmarEnSitio: 'qué módulos declara soportar: decide qué rutas tienen sentido probar',
  },

  // ── TERMINAL FACIAL · DS-K1T344MBFWX-E1 ──────────────────────────────────
  {
    proposito: 'capacidades de control de acceso de la terminal',
    metodo: 'GET',
    ruta: '/ISAPI/AccessControl/capabilities?format=json',
    procedencia: 'documentada',
    familia: 'terminal',
    fuente: 'Documentación ISAPI del fabricante, sección de control de acceso',
    confirmarEnSitio:
      'si declara poder REPORTAR SIN ABRIR. Es la pregunta que decide la arquitectura ' +
      'del recorrido facial, y hoy la terminal abre por su cuenta',
  },
  {
    proposito: 'dar de alta la persona a la que pertenece la plantilla',
    metodo: 'POST',
    ruta: '/ISAPI/AccessControl/UserInfo/Record?format=json',
    procedencia: 'documentada',
    familia: 'terminal',
    fuente: 'Documentación ISAPI del fabricante, gestión de usuarios de control de acceso',
    confirmarEnSitio: 'el nombre exacto del campo de identificador y su longitud máxima',
    dejaRastro: true,
  },
  {
    proposito: 'dar de baja a la persona y con ella su plantilla',
    metodo: 'PUT',
    ruta: '/ISAPI/AccessControl/UserInfo/Delete?format=json',
    procedencia: 'documentada',
    familia: 'terminal',
    fuente: 'Documentación ISAPI del fabricante, gestión de usuarios de control de acceso',
    confirmarEnSitio: 'que borrar la persona borre TAMBIÉN su rostro, o hacen falta las dos',
    dejaRastro: true,
  },
  {
    proposito: 'cargar la plantilla facial',
    metodo: 'POST',
    ruta: '/ISAPI/Intelligent/FDLib/FDSetUp?format=json',
    procedencia: 'documentada',
    familia: 'terminal',
    fuente: 'Documentación ISAPI del fabricante, biblioteca de rostros',
    confirmarEnSitio:
      'el identificador de la biblioteca del equipo, y si el envío es multipart con ' +
      'la imagen o lleva la imagen en base64',
    dejaRastro: true,
  },
  {
    proposito: 'suprimir la plantilla facial',
    metodo: 'PUT',
    ruta: '/ISAPI/Intelligent/FDLib/FDSearch/Delete?format=json',
    procedencia: 'documentada',
    familia: 'terminal',
    fuente: 'Documentación ISAPI del fabricante, biblioteca de rostros',
    confirmarEnSitio:
      'que la supresión sea efectiva y VERIFICABLE: RN-11 exige poder demostrar que ' +
      'el dato ya no está, no sólo que la orden se aceptó',
    dejaRastro: true,
  },
  {
    proposito: 'abrir la puerta desde la plataforma',
    metodo: 'PUT',
    ruta: `/ISAPI/AccessControl/RemoteControl/door/${String(CANAL_POR_OMISION)}`,
    procedencia: 'documentada',
    familia: 'terminal',
    fuente: 'Documentación ISAPI del fabricante, control remoto de puerta',
    confirmarEnSitio: 'que abra el relé correcto: la terminal declara dos, y sólo uno es la puerta',
    acciona: true,
    cuerpo: {
      tipo: 'application/xml',
      contenido: '<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>',
    },
  },

  // ── FLUJO DE EVENTOS · terminal y videoportero ───────────────────────────
  {
    proposito: 'escuchar los eventos que el equipo emite',
    metodo: 'GET',
    ruta: '/ISAPI/Event/notification/alertStream',
    procedencia: 'documentada',
    familia: 'comun',
    fuente:
      'Documentación ISAPI del fabricante, notificación de eventos. Que VUELQUE EL ' +
      'HISTORIAL al conectar lo dijo el usuario el 18/09/2026 y está en §0.quater de ' +
      'la guía de validación',
    confirmarEnSitio:
      'cuántos eventos históricos vuelca al conectar y si todos traen `currentEvent`',
    dejaRastro: true,
  },

  // ── VIDEOPORTERO · DS-KD9633-WBE6 ────────────────────────────────────────
  {
    proposito: 'abrir la puerta del videoportero',
    metodo: 'PUT',
    ruta: `/ISAPI/AccessControl/RemoteControl/door/${String(CANAL_POR_OMISION)}`,
    procedencia: 'documentada',
    familia: 'videoportero',
    fuente: 'Documentación ISAPI del fabricante, control remoto de puerta',
    confirmarEnSitio: 'que sea la misma ruta que en la terminal, y no se dé por hecho que lo es',
    acciona: true,
    cuerpo: {
      tipo: 'application/xml',
      contenido: '<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>',
    },
  },
  {
    proposito: 'abrir el canal de audio bidireccional',
    metodo: 'PUT',
    ruta: `/ISAPI/System/TwoWayAudio/channels/${String(CANAL_POR_OMISION)}/open`,
    procedencia: 'documentada',
    familia: 'videoportero',
    fuente:
      'ADR-01. Que el equipo lo soporta con G.711 µ-law y que está DESHABILITADO se ' +
      'midió el 18/09/2026 (§0.quater de la guía)',
    confirmarEnSitio:
      'que el canal quede exclusivo, y qué pasa si dos operadores lo piden a la vez',
    dejaRastro: true,
  },
  {
    proposito: 'cerrar el canal de audio bidireccional',
    metodo: 'PUT',
    ruta: `/ISAPI/System/TwoWayAudio/channels/${String(CANAL_POR_OMISION)}/close`,
    procedencia: 'documentada',
    familia: 'videoportero',
    fuente: 'ADR-01, misma fuente que la apertura',
    confirmarEnSitio: 'que el cierre libere el canal aunque la sesión se haya caído antes',
    dejaRastro: true,
  },
];

export const rutasPor = (procedencia: Procedencia): readonly RutaDeEquipo[] =>
  RUTAS.filter((r) => r.procedencia === procedencia);

export const rutasDeFamilia = (familia: RutaDeEquipo['familia']): readonly RutaDeEquipo[] =>
  RUTAS.filter((r) => r.familia === familia || r.familia === 'comun');

/**
 * Busca por propósito, que es como la nombra el resto del sistema. Lanza si no
 * existe: una ruta que se pide y no está en el catálogo es un error de
 * programación, no una condición de ejecución que se pueda tolerar.
 */
export const rutaPara = (proposito: string, familia: RutaDeEquipo['familia']): RutaDeEquipo => {
  const encontrada = RUTAS.find(
    (r) => r.proposito === proposito && (r.familia === familia || r.familia === 'comun'),
  );
  if (encontrada === undefined) {
    throw new Error(`Ruta no catalogada: «${proposito}» para ${familia}`);
  }
  return encontrada;
};
