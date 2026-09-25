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

import type { Procedencia, RutaDeEquipo } from './tipos-de-ruta';
import { RUTAS_DE_LA_GUIA } from './catalogo-de-la-guia';

export type { Procedencia, RutaDeEquipo } from './tipos-de-ruta';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * NO HAY CANAL POR OMISIÓN · D4, ETAPA 15-D
 *
 * Hasta la 15-C este fichero declaraba `CANAL_POR_OMISION = 1` y lo escribía
 * en la ruta del audio, de las dos puertas y de la barrera. Contra el equipo
 * real eso es una suposición: el videoportero declara sus canales de audio en
 * una lista, y la puerta que abre una terminal es la que se le asignó en el
 * alta. Un `channels/1/open` contra un canal 2 contesta `notSupport` y el
 * diagnóstico manda a mirar el firmware.
 *
 * Ahora la ruta lleva `{canal}` y `rutaPara` **exige** el número. Quien lo
 * aporta lo leyó del aparato (audio) o lo declaró una persona (puerta).
 */
export const MARCADOR_DE_CANAL = '{canal}';

const RUTAS_BASE: readonly RutaDeEquipo[] = [
  // ── VERIFICADA · la única ────────────────────────────────────────────────
  {
    proposito: 'accionar la barrera vehicular',
    metodo: 'PUT',
    ruta: '/ISAPI/Parking/channels/{canal}/barrierGate',
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
    capitulo: 'Guía ISAPI integral del fabricante · §11 API Reference · ITC/Entrance/entranceParam',
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
    capitulo:
      'Guía ISAPI integral del fabricante · §11 API Reference · Event/notification/httpHosts/capabilities',
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
    capitulo:
      'Guía ISAPI integral del fabricante · §11 API Reference · Event/notification/httpHosts',
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
    capitulo:
      'Guía ISAPI integral del fabricante · §11 API Reference · Event/notification/httpHosts/<id>/test',
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
    capitulo:
      'Guía ISAPI integral del fabricante · §9.1 Motor Vehicle Recognition · alarmHttpPushProtocol',
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
    capitulo: 'Guía ISAPI integral del fabricante · §9.1.1 Motor Vehicle Recognition · plateCap',
    confirmarEnSitio: 'qué países y formatos de placa declara reconocer',
  },
  {
    proposito: 'leer cuántas barreras y relés declara el equipo',
    metodo: 'GET',
    ruta: '/ISAPI/ITC/Entrance/capabilities',
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente: 'Guía oficial ANPR del fabricante · supportBarrierGateNum y supportRelayNum',
    capitulo: 'Guía ISAPI integral del fabricante · §11 API Reference · ITC/Entrance/capabilities',
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
    /**
     * D3 (ETAPA 15-D) · **PUT, no POST.** La guía de validación (§3.2, F ·
     * biblioteca de rostros) y la documentación de `FDLib` describen
     * `FDSetUp` como un `PUT` multipart; este catálogo decía `POST` y el
     * adaptador lo emitía así. Contra el equipo eso es un `404` o un
     * `notSupport` que parece «el firmware no lo tiene» y era un verbo mal
     * copiado. Sigue DOCUMENTADA: el verbo correcto tampoco es una captura.
     */
    proposito: 'cargar la plantilla facial',
    metodo: 'PUT',
    ruta: '/ISAPI/Intelligent/FDLib/FDSetUp?format=json',
    procedencia: 'documentada',
    familia: 'terminal',
    fuente:
      'Documentación ISAPI del fabricante, biblioteca de rostros (FDLib). Verbo corregido a ' +
      'PUT en la 15-D (D3) según la guía de validación §3.2',
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
    ruta: '/ISAPI/AccessControl/RemoteControl/door/{canal}',
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

  // ── TERMINAL FACIAL · lo que la 15-D añade para decidir por CAPACIDADES ──
  {
    /**
     * La capacidad que sostiene el principio rector en la terminal. Con
     * `remoteCheck` activo el equipo REPORTA y espera el veredicto de la
     * plataforma; sin él, decide solo. **DOCUMENTADA, NO VERIFICADA**: el
     * nombre del campo es un [SUPUESTO] (S-35) que se confirma en sitio.
     */
    proposito: 'leer si la terminal espera el veredicto de la plataforma',
    metodo: 'GET',
    ruta: '/ISAPI/AccessControl/AcsCfg?format=json',
    procedencia: 'documentada',
    familia: 'terminal',
    fuente:
      'Documentación ISAPI del fabricante, configuración de control de acceso (AcsCfg). ' +
      'El campo remoteCheck es un [SUPUESTO] S-35 hasta capturarlo del equipo',
    confirmarEnSitio:
      'que exista remoteCheck y que con true la terminal NO abra sola. Es la pregunta que ' +
      'decide si el modo reporta_y_espera es posible en este firmware',
  },
  {
    /**
     * A2 (ETAPA 15-E) · la mitad que faltaba de la verificación remota. La
     * terminal publica el evento con `remoteCheck: true` y se queda esperando;
     * ESTA es la ruta por la que la plataforma contesta con el veredicto del
     * motor. **DOCUMENTADA, NO VERIFICADA**: forma del cuerpo y nombre de los
     * campos son un [SUPUESTO] (S-39) hasta capturarlos del equipo. `dejaRastro`
     * porque la terminal abre o niega a alguien que está delante: el guion de
     * sitio no la sondea a ciegas; se ejercita con el recorrido completo.
     */
    proposito: 'responder la verificación remota de la terminal',
    metodo: 'PUT',
    ruta: '/ISAPI/AccessControl/remoteCheck?format=json',
    procedencia: 'documentada',
    familia: 'terminal',
    fuente:
      'Documentación ISAPI del fabricante, control de acceso (remoteCheck). Cuerpo ' +
      '{RemoteCheck:{serialNo, checkResult: success|failed, info}}: [SUPUESTO] S-39',
    confirmarEnSitio:
      'que la terminal abra con checkResult=success y niegue con failed; el nombre exacto ' +
      'de serialNo en el evento y en la respuesta; y qué hace el equipo si no se contesta ' +
      'dentro de su plazo (se supone que NIEGA)',
    dejaRastro: true,
  },
  {
    proposito: 'fijar que la terminal espere el veredicto de la plataforma',
    metodo: 'PUT',
    ruta: '/ISAPI/AccessControl/AcsCfg?format=json',
    procedencia: 'documentada',
    familia: 'terminal',
    fuente: 'Documentación ISAPI del fabricante, configuración de control de acceso (AcsCfg)',
    confirmarEnSitio: 'LEER-MODIFICAR-ESCRIBIR y confirmación explícita: cambia quién decide',
    dejaRastro: true,
  },
  {
    proposito: 'leer qué admite la biblioteca de rostros',
    metodo: 'GET',
    ruta: '/ISAPI/Intelligent/FDLib/capabilities?format=json',
    procedencia: 'documentada',
    familia: 'terminal',
    fuente:
      'Documentación ISAPI del fabricante, biblioteca de rostros. La guía de validación §3.2 ' +
      'la lista para la terminal (F)',
    confirmarEnSitio: 'el máximo de plantillas que declara: es lo que evita cargar la que no cabe',
  },
  {
    /**
     * Lo que hace VERIFICABLE una supresión (RN-11): después de suprimir, el
     * recuento tiene que bajar. Un `OK` a la orden no demuestra nada.
     */
    proposito: 'contar las plantillas de la biblioteca de rostros',
    metodo: 'POST',
    ruta: '/ISAPI/Intelligent/FDLib/Count?format=json',
    procedencia: 'documentada',
    familia: 'terminal',
    fuente: 'Documentación ISAPI del fabricante, biblioteca de rostros (FDLib/Count)',
    confirmarEnSitio: 'que el recuento baje tras una supresión: es la prueba de RN-11',
  },
  {
    proposito: 'buscar una plantilla en la biblioteca de rostros',
    metodo: 'POST',
    ruta: '/ISAPI/Intelligent/FDLib/FDSearch?format=json',
    procedencia: 'documentada',
    familia: 'terminal',
    fuente: 'Documentación ISAPI del fabricante, biblioteca de rostros (FDLib/FDSearch)',
    confirmarEnSitio: 'que una plantilla suprimida NO aparezca en la búsqueda por su identificador',
  },
  {
    proposito: 'modificar la persona a la que pertenece la plantilla',
    metodo: 'PUT',
    ruta: '/ISAPI/AccessControl/UserInfo/Modify?format=json',
    procedencia: 'documentada',
    familia: 'terminal',
    fuente: 'Documentación ISAPI del fabricante, gestión de usuarios de control de acceso',
    confirmarEnSitio: 'que un alta repetida se resuelva modificando, no fallando',
    dejaRastro: true,
  },
  {
    proposito: 'leer qué órdenes admite la puerta desde la plataforma',
    metodo: 'GET',
    ruta: '/ISAPI/AccessControl/RemoteControl/door/capabilities',
    procedencia: 'documentada',
    familia: 'terminal',
    fuente:
      'Documentación ISAPI del fabricante, control remoto de puerta. La guía de validación ' +
      '§3.2 la lista para la terminal (W) y dice que lo que vale es lo que responda el equipo',
    confirmarEnSitio: 'que la lista de cmd incluya open: es la única orden que se usa',
  },

  // ── VIDEOPORTERO · canales de audio y llamada, por CAPACIDADES ───────────
  {
    /**
     * D4 · el canal de audio se LEE de aquí, nunca se supone. El equipo real
     * declaró su canal con G.711 µ-law y deshabilitado (§0.quater de la guía).
     */
    proposito: 'leer los canales de audio bidireccional del equipo',
    metodo: 'GET',
    ruta: '/ISAPI/System/TwoWayAudio/channels',
    procedencia: 'documentada',
    familia: 'videoportero',
    fuente:
      'ADR-01 y guía de validación §3.2 (W · canales de audio bidireccional). Que el equipo ' +
      'lo declara con G.711 µ-law y deshabilitado se midió el 18/09/2026 (§0.quater)',
    confirmarEnSitio:
      'el id del canal, el códec y si está habilitado: los tres se leen, no se suponen',
  },
  {
    proposito: 'enviar audio al equipo',
    metodo: 'PUT',
    ruta: '/ISAPI/System/TwoWayAudio/channels/{canal}/audioData',
    procedencia: 'documentada',
    familia: 'videoportero',
    fuente:
      'ADR-01. Documentación ISAPI del fabricante, audio bidireccional: flujo sostenido de ' +
      'octetos en el códec del canal, sin longitud declarada',
    confirmarEnSitio:
      'códec, tamaño de paquete y cadencia; si es semiduplex; y la latencia extremo a extremo ' +
      '(KPI-33 < 2 s). Nada de esto tiene cifra hasta medirlo',
    dejaRastro: true,
  },
  {
    proposito: 'recibir audio del equipo',
    metodo: 'GET',
    ruta: '/ISAPI/System/TwoWayAudio/channels/{canal}/audioData',
    procedencia: 'documentada',
    familia: 'videoportero',
    fuente: 'ADR-01. Documentación ISAPI del fabricante, audio bidireccional',
    confirmarEnSitio: 'que el flujo se mantenga abierto y en qué códec llega',
    dejaRastro: true,
  },
  {
    proposito: 'leer qué órdenes admite la puerta desde la plataforma',
    metodo: 'GET',
    ruta: '/ISAPI/AccessControl/RemoteControl/door/capabilities',
    procedencia: 'documentada',
    familia: 'videoportero',
    fuente:
      'Documentación ISAPI del fabricante, control remoto de puerta. La guía de validación ' +
      '§3.2 la lista para el videoportero con la nota «F en esta familia · confirmar»',
    confirmarEnSitio: 'que responda en esta familia: la guía no lo da por hecho',
  },
  {
    /**
     * El equipo real declara `isSupportCallSignal=false` (volcado del
     * 23/09/2026). Esta ruta existe en el catálogo para el modelo que SÍ la
     * declare; el adaptador no la pide sin comprobar antes la capacidad.
     */
    proposito: 'contestar o rechazar una llamada del videoportero',
    metodo: 'PUT',
    ruta: '/ISAPI/VideoIntercom/callSignal?format=json',
    procedencia: 'documentada',
    familia: 'videoportero',
    fuente:
      'Documentación ISAPI del fabricante, señalización de llamada del videoportero. El ' +
      'DS-KD9633 del proyecto declara NO soportarla (isSupportCallSignal=false)',
    confirmarEnSitio: 'sólo en un modelo que declare la capacidad; en éste no se pide',
    dejaRastro: true,
  },

  // ── COMÚN · suscripción de eventos (tercer transporte) ───────────────────
  {
    /**
     * Los dos equipos reales declaran `isSupportSubscribeEvent=true`. Es el
     * transporte por el que la plataforma pide al equipo que le mande SÓLO los
     * eventos que le interesan, en vez de escuchar el flujo entero.
     */
    proposito: 'suscribirse a los eventos del equipo',
    metodo: 'POST',
    ruta: '/ISAPI/Event/notification/subscribeEvent',
    procedencia: 'documentada',
    familia: 'comun',
    fuente:
      'Documentación ISAPI del fabricante, suscripción de eventos. Los dos volcados reales ' +
      'del 23/09/2026 declaran isSupportSubscribeEvent=true',
    confirmarEnSitio:
      'qué tipos de evento admite en la suscripción y si el flujo de respuesta trae el ' +
      'mismo volcado histórico que alertStream',
    dejaRastro: true,
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
    capitulo: 'Guía ISAPI integral del fabricante · §10.2 Entrance and Exit Barrier Control',
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
    ruta: '/ISAPI/Parking/channels/{canal}/barrierGate/barrierGateStatus',
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente:
      'Guía oficial ANPR del fabricante · 0 sin señal, 1 cerrada, 2 abierta. La consulta ' +
      'de estado del 15/09/2026 devolvió notSupport por OTRA ruta; ésta no se ha probado',
    capitulo:
      'Guía ISAPI integral del fabricante · §10.2 Entrance and Exit Barrier Control · barrierGateStatus',
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
    ruta: '/ISAPI/AccessControl/RemoteControl/door/{canal}',
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
    ruta: '/ISAPI/System/TwoWayAudio/channels/{canal}/open',
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
    ruta: '/ISAPI/System/TwoWayAudio/channels/{canal}/close',
    procedencia: 'documentada',
    familia: 'videoportero',
    fuente: 'ADR-01, misma fuente que la apertura',
    confirmarEnSitio: 'que el cierre libere el canal aunque la sesión se haya caído antes',
    dejaRastro: true,
  },
];

/**
 * El catálogo completo: lo que había más lo que la guía integral añade.
 *
 * Se concatena y no se fusiona: una ruta nueva **no sustituye** a una
 * verificada. La de la barrera lo está contra este firmware, y cambiarla por
 * una que sólo está documentada sería retroceder.
 */
export const RUTAS: readonly RutaDeEquipo[] = [...RUTAS_BASE, ...RUTAS_DE_LA_GUIA];

export const rutasPor = (procedencia: Procedencia): readonly RutaDeEquipo[] =>
  RUTAS.filter((r) => r.procedencia === procedencia);

export const rutasDeFamilia = (familia: RutaDeEquipo['familia']): readonly RutaDeEquipo[] =>
  RUTAS.filter((r) => r.familia === familia || r.familia === 'comun');

/**
 * Busca por propósito, que es como la nombra el resto del sistema. Lanza si no
 * existe: una ruta que se pide y no está en el catálogo es un error de
 * programación, no una condición de ejecución que se pueda tolerar.
 */
export const rutaPara = (
  proposito: string,
  familia: RutaDeEquipo['familia'],
  canal?: number,
): RutaDeEquipo => {
  const encontrada = RUTAS.find(
    (r) => r.proposito === proposito && (r.familia === familia || r.familia === 'comun'),
  );
  if (encontrada === undefined) {
    throw new Error(`Ruta no catalogada: «${proposito}» para ${familia}`);
  }
  if (!encontrada.ruta.includes(MARCADOR_DE_CANAL)) return encontrada;
  if (canal === undefined || !Number.isInteger(canal) || canal <= 0) {
    throw new RutaSinCanal(proposito, encontrada.ruta);
  }
  return { ...encontrada, ruta: encontrada.ruta.split(MARCADOR_DE_CANAL).join(String(canal)) };
};

/**
 * Se pidió una ruta que exige canal sin decir cuál. No se suple con 1: es
 * justo el defecto que D4 cerró, y una ruta con un número inventado contesta
 * `notSupport` en el equipo y manda a mirar el firmware.
 */
export class RutaSinCanal extends Error {
  constructor(
    readonly proposito: string,
    readonly ruta: string,
  ) {
    super(
      `La ruta «${proposito}» (${ruta}) exige el número de canal o puerta y no se aportó. ` +
        'Se lee del equipo o se declara en el alta: nunca se supone 1',
    );
    this.name = 'RutaSinCanal';
  }
}

/** `true` si la ruta lleva el marcador y por tanto exige canal. */
export const exigeCanal = (ruta: RutaDeEquipo): boolean => ruta.ruta.includes(MARCADOR_DE_CANAL);
