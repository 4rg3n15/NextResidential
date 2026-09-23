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

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TRES GRADOS, NO DOS · añadido el 23/09/2026
 *
 * Hasta hoy una ruta era «verificada» —capturada del equipo— o «documentada»,
 * y ese segundo cajón mezclaba dos cosas muy distintas: lo que dice la guía
 * oficial del fabricante para ESTA familia de equipo, y lo que se dedujo de la
 * forma habitual de ISAPI. Tratarlas igual obliga a desconfiar de las dos por
 * igual, y entonces la etiqueta no informa de nada.
 *
 * | Grado           | Qué lo respalda                              | Qué falta          |
 * | --------------- | -------------------------------------------- | ------------------ |
 * | `verificada`    | Captura del equipo real                      | Nada               |
 * | `guia_oficial`  | La guía ANPR del fabricante                  | Verla en el equipo |
 * | `documentada`   | La forma habitual de ISAPI                   | Respaldo y equipo  |
 *
 * `guia_oficial` **no** es «verificada»: eso exige el aparato delante. Pero
 * tampoco es una deducción, y el guion de puesta en marcha las ordena por este
 * grado para que lo primero que se compruebe sea lo que menos respaldo tiene.
 */
export type Procedencia = 'verificada' | 'guia_oficial' | 'documentada';

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
   * Capítulo de la guía oficial, cuando la procedencia es `guia_oficial`.
   *
   * **Hoy dice de qué trata, no un número.** El destilado que respalda estas
   * rutas llegó como texto y `docs/hikdocs/` no está en este árbol —es
   * documentación propietaria del fabricante y no se versiona—, así que poner
   * «§4.2» sería inventar una precisión que nadie puede comprobar. Cuando el
   * documento esté a mano, aquí va su numeración.
   */
  readonly capitulo?: string;
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

  // ── EL MODO DE CONTROL · la ruta que decide quién manda ──────────────────
  {
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * LA COMPROBACIÓN MÁS IMPORTANTE DE TODO ESTE CATÁLOGO
     *
     * `ctrlMod` dice quién abre la barrera cuando la cámara reconoce una placa:
     *
     *   0 = la CÁMARA, por su lista interna
     *   1 = la PLATAFORMA  ← lo único admisible en este proyecto
     *   2 = ambas
     *
     * Con 0 o con 2, el equipo abre por su cuenta y el motor de reglas se
     * entera después —o no se entera—: el principio rector queda en una frase
     * del README. No es una recomendación de puesta en marcha: es la condición
     * bajo la cual este sistema puede operar contra este equipo, y por eso se
     * comprueba al arrancar el proveedor y no en una guía que alguien leerá.
     */
    proposito: 'leer quién controla la barrera: la cámara o la plataforma',
    metodo: 'GET',
    ruta: '/ISAPI/ITC/Entrance/entranceParam',
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente:
      'Guía oficial ANPR del fabricante, parámetros de entrada. El valor vive en ' +
      'EntranceParamList.EntranceParam.ctrlMod y debe ser 1 (plataforma)',
    capitulo: 'parámetros de entrada · modo de control',
    confirmarEnSitio:
      'que valga 1. Con 0 o 2 el equipo decide por su cuenta y el sistema se NIEGA a operar',
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

  // ── CONFIGURAR EL RECEPTOR DESDE AQUÍ, en vez de a mano en la interfaz ───
  {
    proposito: 'leer qué admite el equipo al configurar su servidor de notificación',
    metodo: 'GET',
    ruta: '/ISAPI/Event/notification/httpHosts/capabilities',
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente: 'Guía oficial ANPR del fabricante, notificación HTTP · HttpHostNotificationCap',
    capitulo: 'notificación HTTP · capacidades',
    confirmarEnSitio: 'cuántos servidores admite y si acepta el formato de línea base',
  },
  {
    proposito: 'apuntar el equipo a nuestro receptor',
    metodo: 'PUT',
    ruta: '/ISAPI/Event/notification/httpHosts',
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente:
      'Guía oficial ANPR del fabricante, notificación HTTP. Admite también la forma ' +
      'con identificador de servidor al final de la ruta',
    capitulo: 'notificación HTTP · configuración',
    confirmarEnSitio: 'si este firmware exige el identificador en la ruta o lo admite sin él',
    dejaRastro: true,
  },
  {
    proposito: 'pedir al equipo que pruebe el envío a nuestro receptor',
    metodo: 'POST',
    ruta: '/ISAPI/Event/notification/httpHosts/1/test',
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente: 'Guía oficial ANPR del fabricante, notificación HTTP · prueba de envío',
    capitulo: 'notificación HTTP · prueba',
    confirmarEnSitio: 'que el envío de prueba llegue al receptor y con qué forma de cuerpo',
    dejaRastro: true,
  },
  {
    /**
     * Sin esto, el equipo puede usar un formato propietario antiguo que el
     * receptor no sabe abrir, y el fallo se manifiesta como «la cámara no
     * reporta» cuando en realidad reporta en otro idioma.
     */
    proposito: 'exigir el formato de evento de línea base',
    metodo: 'PUT',
    ruta: '/ISAPI/Traffic/ANPR/alarmHttpPushProtocol',
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente:
      'Guía oficial ANPR del fabricante. El cuerpo lleva baseLineProtocolEnabled en true; ' +
      'sin él el equipo puede emitir un formato propietario antiguo',
    capitulo: 'protocolo de envío de alarmas ANPR',
    confirmarEnSitio: 'qué formato usa de fábrica ESTE equipo antes de tocarlo',
    dejaRastro: true,
    cuerpo: {
      tipo: 'application/xml',
      contenido:
        '<?xml version="1.0" encoding="UTF-8"?><AlarmHttpPushProtocol>' +
        '<baseLineProtocolEnabled>true</baseLineProtocolEnabled></AlarmHttpPushProtocol>',
    },
  },
  {
    proposito: 'leer las capacidades de tráfico del equipo',
    metodo: 'GET',
    ruta: '/ISAPI/Traffic/capabilities',
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente: 'Guía oficial ANPR del fabricante · plateCap',
    capitulo: 'capacidades de tráfico',
    confirmarEnSitio: 'qué países y formatos de placa declara reconocer',
  },
  {
    proposito: 'leer cuántas barreras y relés declara el equipo',
    metodo: 'GET',
    ruta: '/ISAPI/ITC/Entrance/capabilities',
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente: 'Guía oficial ANPR del fabricante · supportBarrierGateNum y supportRelayNum',
    capitulo: 'capacidades de entrada',
    confirmarEnSitio: 'cuántas barreras y relés hay de verdad, para no accionar el que no es',
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

  // ── LA SEGUNDA RUTA DE BARRERA, por si el modelo no tiene la primera ─────
  {
    /**
     * Alternativa documentada a la ruta VERIFICADA de `Parking`. Se cataloga
     * aparte y **no sustituye** a aquella: la verificada lo está contra este
     * firmware, y cambiarla por una que no lo está sería retroceder.
     *
     * `barrietGateNum` y `barrietGateOper` llevan la errata del fabricante —le
     * falta la «r»—. Se respeta: corregirla aquí produciría una petición que el
     * equipo no entiende, y el error sería incomprensible.
     */
    proposito: 'accionar la barrera por la ruta de entrada (alternativa por modelo)',
    metodo: 'PUT',
    ruta: '/ISAPI/ITC/Entrance/barrierGateCtrl',
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente:
      'Guía oficial ANPR del fabricante, control de barrera de entrada. Operaciones: ' +
      'off, on, stop, locked. Los nombres de campo llevan la errata del fabricante',
    capitulo: 'control de barrera de entrada',
    confirmarEnSitio:
      'si este modelo la admite. La ruta de Parking está VERIFICADA: ésta es el repliegue',
    acciona: true,
    cuerpo: {
      tipo: 'application/xml',
      contenido:
        '<?xml version="1.0" encoding="UTF-8"?><BarrierGateCtrl>' +
        '<barrietGateNum>1</barrietGateNum><barrietGateOper>on</barrietGateOper></BarrierGateCtrl>',
    },
  },
  {
    /**
     * **Informa del estado de la BARRERA, no de que un vehículo pasara.** La
     * invariante del dominio no cambia (H-1, H-2): una orden aceptada nunca
     * afirma paso franqueado, y leer «abierta» aquí tampoco lo afirma —dice
     * que el brazo está arriba, no que alguien cruzara—.
     */
    proposito: 'leer si la barrera está abierta o cerrada',
    metodo: 'GET',
    ruta: '/ISAPI/Parking/channels/1/barrierGate/barrierGateStatus',
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente:
      'Guía oficial ANPR del fabricante · 0 sin señal, 1 cerrada, 2 abierta. La consulta ' +
      'de estado del 15/09/2026 devolvió notSupport por OTRA ruta; ésta no se ha probado',
    capitulo: 'estado de la barrera',
    confirmarEnSitio:
      'si responde o vuelve a dar notSupport. Sin señal de posición cableada (H-2), ' +
      'un «abierta» sigue sin demostrar que un vehículo pasó',
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
