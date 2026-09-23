import type { RutaDeEquipo } from './tipos-de-ruta';

/**
 * LAS RUTAS QUE LA GUÍA ISAPI INTEGRAL AÑADE · ETAPA 15-C.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ CAMBIA RESPECTO DEL CATÁLOGO ANTERIOR
 *
 * El catálogo que traía la 15-B se escribió contra un destilado de la guía
 * ANPR. La guía **integral** trae el capítulo de referencia de la API con el
 * esquema XML de cada extremo, y eso permite tres cosas que antes no se podían:
 * citar la sección por su número, escribir el cuerpo exacto, y —la que más
 * importa— **saber qué campos son obligatorios al escribir**.
 *
 * Ese último punto es el que convierte una ruta en utilizable. Estos esquemas
 * no admiten campos sueltos: el `PUT` exige el documento completo, así que
 * escribir sólo lo que se quiere cambiar borra el resto. De ahí que cada
 * entrada de escritura diga, en `confirmarEnSitio`, qué hay que leer antes.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * SIGUEN SIN SER VERIFICADAS, Y ESO NO ES UNA FORMALIDAD
 *
 * `guia_oficial` significa que el fabricante lo documenta para esta familia.
 * **No** significa que este firmware lo implemente: el mismo documento enumera,
 * entre sus fallos previstos, que un modelo concreto puede no admitir la
 * escucha de eventos. La única VERIFICADA sigue siendo la barrera, capturada
 * del aparato el 15/09/2026.
 */

const CANAL = 1;

export const RUTAS_DE_LA_GUIA: readonly RutaDeEquipo[] = [
  // ── ACTIVACIÓN · la primera pregunta, y la única sin credenciales ────────
  {
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * VA PRIMERA EN EL SONDEO, Y NO ES UN DETALLE DE ORDEN
     *
     * Este extremo **no exige autenticación**. Es lo que distingue «no hay
     * ningún equipo en esa dirección» de «hay un equipo y la credencial es
     * mala»: sin él, las dos se ven igual desde fuera —no llega nada útil— y
     * la sonda las metía en el mismo cajón.
     *
     * La diferencia es cara: «no contesta» manda a revisar el cable, la VLAN y
     * la dirección; «credencial» manda a revisar el usuario de servicio. Y
     * reintentar una credencial mala **bloquea la cuenta** del equipo.
     */
    proposito: 'saber si hay un equipo en esa dirección, sin presentar credenciales',
    metodo: 'GET',
    ruta: '/SDK/activateStatus',
    procedencia: 'guia_oficial',
    familia: 'comun',
    fuente:
      'Guía ISAPI integral, activación. Es el único extremo que responde sin autenticación, ' +
      'y por eso separa «no hay equipo» de «credencial rechazada»',
    capitulo: '§3.2 Activation',
    confirmarEnSitio: 'que responda sin credenciales y qué dice de un equipo ya activado',
  },

  // ── EL PAÍS DEL ALGORITMO ────────────────────────────────────────────────
  {
    proposito: 'leer el país con el que el algoritmo lee las placas',
    metodo: 'GET',
    ruta: `/ISAPI/Traffic/channels/${String(CANAL)}/basic`,
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente:
      'Guía ISAPI integral, canal de tráfico. El índice de reconocimiento fija la gramática ' +
      'de placa; Colombia es 210, y el genérico lee mal sin dar error',
    capitulo: '§11.1.1 API Reference · Traffic/channels/<ID>/basic',
    confirmarEnSitio: 'qué índice trae de fábrica ESTE equipo antes de tocar nada',
  },
  {
    proposito: 'leer qué países admite el algoritmo de este equipo',
    metodo: 'GET',
    ruta: `/ISAPI/Traffic/channels/${String(CANAL)}/basic/capabilities`,
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente:
      'Guía ISAPI integral, capacidades del canal de tráfico. El `opt=` del índice de ' +
      'reconocimiento es lo que ESE equipo admite: fuera de esa lista no se escribe',
    capitulo: '§11.1.1 API Reference · Traffic/channels/<ID>/basic/capabilities',
    confirmarEnSitio: 'que 210 esté en la lista. Si no está, se dice y no se escribe',
  },
  {
    proposito: 'fijar el país del algoritmo',
    metodo: 'PUT',
    ruta: `/ISAPI/Traffic/channels/${String(CANAL)}/basic`,
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente:
      'Guía ISAPI integral, canal de tráfico. El cuerpo exige el documento básico COMPLETO: ' +
      'canal, sentido, sitio, identificador, descripción, canal por omisión, región e índice',
    capitulo: '§11.1.1 API Reference · Traffic/channels/<ID>/basic',
    confirmarEnSitio:
      'LEER antes y devolver todo lo demás tal cual vino. La región se enumera de dos formas ' +
      'en el mismo capítulo (C-17): no se envía una fija, se devuelve la que vino',
    dejaRastro: true,
  },

  // ── QUIÉN DECIDE · lectura completa y escritura ──────────────────────────
  {
    proposito: 'leer qué admite el equipo en sus parámetros de entrada',
    metodo: 'GET',
    ruta: '/ISAPI/ITC/Entrance/entranceParam/capabilities',
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente:
      'Guía ISAPI integral, capacidades de parámetros de entrada. El `opt=` del modo de ' +
      'control enumera 0, 1 y 2: cámara, plataforma y ambos',
    capitulo: '§11 API Reference · ITC/Entrance/entranceParam/capabilities',
    confirmarEnSitio: 'que el modo 1 esté admitido antes de proponer corregirlo',
  },
  {
    /**
     * Escribir esto cambia **quién decide si se abre una barrera**. Por eso la
     * ruta lleva `dejaRastro` y por eso quien la usa exige confirmación
     * explícita y deja traza en la auditoría de seguridad: es la clase de
     * cambio que nadie ve venir si lo hace un arranque automático.
     */
    proposito: 'corregir quién controla la barrera',
    metodo: 'PUT',
    ruta: '/ISAPI/ITC/Entrance/entranceParam',
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente:
      'Guía ISAPI integral, parámetros de entrada. El cuerpo exige número de carril, ' +
      'habilitación y modo de disparo relacionado; el modo de control es opcional al escribir',
    capitulo: '§11 API Reference · ITC/Entrance/entranceParam',
    confirmarEnSitio:
      'LEER-MODIFICAR-ESCRIBIR: se devuelve el documento entero con un solo campo cambiado',
    dejaRastro: true,
  },

  // ── LA TERCERA VÍA · disparadores vinculados y su horario ────────────────
  {
    proposito: 'leer si un disparador vinculado acciona la barrera',
    metodo: 'GET',
    ruta: `/ISAPI/Event/triggers/vehicledetection-${String(CANAL)}`,
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente:
      'Guía ISAPI integral, disparadores de evento. Una acción vinculada de tipo E/S ' +
      'acciona una salida física del equipo: si es el relé de la barrera, abre sola',
    capitulo: '§11 API Reference · Event/triggers/vehicledetection-<ID>',
    confirmarEnSitio: 'qué acciones trae vinculadas de fábrica, y a qué puerto de salida apuntan',
  },
  {
    proposito: 'configurar el disparador de detección de vehículo',
    metodo: 'PUT',
    ruta: `/ISAPI/Event/triggers/vehicledetection-${String(CANAL)}`,
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente: 'Guía ISAPI integral, disparadores de evento',
    capitulo: '§11 API Reference · Event/triggers/vehicledetection-<ID>',
    confirmarEnSitio: 'que retirar una acción de E/S no desactive además la notificación',
    dejaRastro: true,
  },
  {
    /**
     * El horario de armado parece cosmético y no lo es: **una detección fuera
     * de horario no reporta**, y el síntoma en sitio es el de una cámara
     * averiada —no llega nada, el equipo responde a todo lo demás—. Quien esté
     * delante empezará por el cable.
     */
    proposito: 'configurar el horario en que la detección está armada',
    metodo: 'PUT',
    ruta: '/ISAPI/Event/schedules/vehicledetects',
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente:
      'Guía ISAPI integral, horarios de evento. Fuera del horario armado la detección NO ' +
      'reporta, y eso se diagnostica como avería',
    capitulo: '§11 API Reference · Event/schedules/vehicledetects',
    confirmarEnSitio: 'qué horario trae de fábrica: si no es 24×7, faltarán eventos y no errores',
    dejaRastro: true,
  },

  // ── DETECCIÓN Y RECONOCIMIENTO ──────────────────────────────────────────
  {
    proposito: 'leer los parámetros de detección de vehículo del canal',
    metodo: 'GET',
    ruta: `/ISAPI/Traffic/channels/${String(CANAL)}/vehicleDetect`,
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente: 'Guía ISAPI integral, detección de vehículo del canal de tráfico',
    capitulo: '§11 API Reference · Traffic/channels/<ID>/vehicleDetect',
    confirmarEnSitio: 'qué modo de disparo usa: lazo inductivo, vídeo, multifotograma o radar',
  },
  {
    proposito: 'leer qué admite la detección de vehículo del canal',
    metodo: 'GET',
    ruta: `/ISAPI/Traffic/channels/${String(CANAL)}/vehicleDetect/capabilities`,
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente: 'Guía ISAPI integral, capacidades de detección de vehículo',
    capitulo: '§11 API Reference · Traffic/channels/<ID>/vehicleDetect/capabilities',
    confirmarEnSitio: 'qué modos de disparo admite este modelo',
  },
  {
    proposito: 'configurar la detección de vehículo del canal',
    metodo: 'PUT',
    ruta: `/ISAPI/Traffic/channels/${String(CANAL)}/vehicleDetect`,
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente: 'Guía ISAPI integral, detección de vehículo del canal de tráfico',
    capitulo: '§11 API Reference · Traffic/channels/<ID>/vehicleDetect',
    confirmarEnSitio: 'LEER-MODIFICAR-ESCRIBIR, como todo lo de este capítulo',
    dejaRastro: true,
  },
  {
    proposito: 'leer los parámetros de reconocimiento de placa',
    metodo: 'GET',
    ruta: `/ISAPI/ITC/plateRecognitionParam?channelID=${String(CANAL)}`,
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente: 'Guía ISAPI integral, parámetros de reconocimiento de placa',
    capitulo: '§11 API Reference · ITC/plateRecognitionParam',
    confirmarEnSitio: 'qué umbral de reconocimiento trae y en qué escala lo expresa',
  },
  {
    proposito: 'leer qué admite el reconocimiento de placa',
    metodo: 'GET',
    ruta: '/ISAPI/ITC/plateRecognitionParam/capabilities',
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente: 'Guía ISAPI integral, capacidades de reconocimiento de placa',
    capitulo: '§11 API Reference · ITC/plateRecognitionParam/capabilities',
    confirmarEnSitio: 'el rango del umbral: decide si nuestra escala 0-100 coincide',
  },
  {
    proposito: 'configurar el reconocimiento de placa',
    metodo: 'PUT',
    ruta: `/ISAPI/ITC/plateRecognitionParam?channelID=${String(CANAL)}`,
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente: 'Guía ISAPI integral, parámetros de reconocimiento de placa',
    capitulo: '§11 API Reference · ITC/plateRecognitionParam',
    confirmarEnSitio: 'LEER-MODIFICAR-ESCRIBIR',
    dejaRastro: true,
  },
  {
    proposito: 'leer qué modos de disparo admite el equipo',
    metodo: 'GET',
    ruta: '/ISAPI/ITC/TriggerMode/capabilities',
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente:
      'Guía ISAPI integral. Es una de las CUATRO consultas que bastan para confirmar que ' +
      'este equipo reconoce matrículas: basta con que se cumpla UNA',
    capitulo: '§9.1.1 Motor Vehicle Recognition · TriggerMode',
    confirmarEnSitio: 'cuál de las cuatro consultas de capacidad contesta en ESTE modelo',
  },
  {
    proposito: 'leer las capacidades de reconocimiento del módulo de entrada',
    metodo: 'GET',
    ruta: '/ISAPI/ITC/capabilities',
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente: 'Guía ISAPI integral. Segunda de las cuatro consultas de capacidad del §9.1.1',
    capitulo: '§9.1.1 Motor Vehicle Recognition · ITC/capabilities',
    confirmarEnSitio: 'si declara detección de vehículo a nivel de módulo',
  },

  // ── EL RECEPTOR, con identificador en la ruta ────────────────────────────
  {
    proposito: 'leer a qué receptor publica el equipo',
    metodo: 'GET',
    ruta: '/ISAPI/Event/notification/httpHosts',
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente:
      'Guía ISAPI integral, notificación HTTP. De aquí salen el formato, la acreditación y ' +
      'qué imágenes envía: los tres campos que deciden si el evento llega y qué trae',
    capitulo: '§11 API Reference · Event/notification/httpHosts',
    confirmarEnSitio: 'en qué formato está de fábrica y qué imágenes envía',
  },
  {
    proposito: 'apuntar un receptor concreto por su identificador',
    metodo: 'PUT',
    ruta: '/ISAPI/Event/notification/httpHosts/1',
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente:
      'Guía ISAPI integral, notificación HTTP. La forma con identificador configura UNO sin ' +
      'tocar los demás; la forma sin identificador reemplaza la lista entera',
    capitulo: '§11 API Reference · Event/notification/httpHosts/<ID>',
    confirmarEnSitio: 'si este firmware admite la forma con identificador',
    dejaRastro: true,
  },

  // ── EL REABASTECIMIENTO · lo que reenvía tras un corte ───────────────────
  {
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * LO QUE ESTO SIGNIFICA PARA LA IDEMPOTENCIA (RN-17, CA-22)
     *
     * El equipo guarda lo que no pudo entregar y **lo reenvía cuando vuelve la
     * red**. No es el reenvío inmediato de una notificación sin respuesta: es
     * un lote de eventos viejos, horas después, por el mismo canal.
     *
     * La clave de idempotencia tiene que cubrir también ese camino. Si sólo
     * cubriera la ventana corta, un corte de red de dos horas produciría, al
     * volver, un duplicado por cada acceso de esas dos horas — en una tabla que
     * no admite borrado.
     */
    proposito: 'configurar el reabastecimiento de eventos tras un corte de red',
    metodo: 'PUT',
    ruta: '/ISAPI/Traffic/ANR',
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente:
      'Guía ISAPI integral, reabastecimiento. Declara intervalo y tiempo límite de subida y ' +
      'la dirección del servidor de armado: tras un corte, el equipo REENVÍA lo no entregado',
    capitulo: '§11 API Reference · Traffic/ANR',
    confirmarEnSitio:
      'cuánto guarda y en qué lotes reenvía: decide la ventana que la clave de idempotencia ' +
      'tiene que cubrir',
    dejaRastro: true,
  },

  // ── LA BARRERA · capacidades antes de sondear el estado ──────────────────
  {
    proposito: 'leer si este modelo reporta el estado de la barrera',
    metodo: 'GET',
    ruta: `/ISAPI/Parking/channels/${String(CANAL)}/barrierGate/capabilities`,
    procedencia: 'guia_oficial',
    familia: 'camara',
    fuente:
      'Guía ISAPI integral, control de barrera. Declara si el modelo sabe informar de la ' +
      'posición del brazo; sondearlo sin preguntar da un estado desconocido permanente',
    capitulo: '§10.2 Entrance and Exit Barrier Control · capabilities',
    confirmarEnSitio: 'si lo soporta. Si no, la consola lo dice en vez de sondear a ciegas',
  },

  // ── EL RELOJ · invisible hasta que corrompe la trazabilidad ──────────────
  {
    proposito: 'leer la hora del equipo',
    metodo: 'GET',
    ruta: '/ISAPI/System/time',
    procedencia: 'guia_oficial',
    familia: 'comun',
    fuente:
      'Guía ISAPI integral, sincronización horaria. Un reloj desviado no falla: fecha mal los ' +
      'eventos, y eso no se ve hasta que una auditoría compara dos fuentes',
    capitulo: '§5.4 Device Time Sync',
    confirmarEnSitio: 'cuánto se desvía del servidor y si el equipo declara su zona horaria',
  },
  {
    proposito: 'leer qué admite el equipo al fijar su hora',
    metodo: 'GET',
    ruta: '/ISAPI/System/time/capabilities',
    procedencia: 'guia_oficial',
    familia: 'comun',
    fuente: 'Guía ISAPI integral, sincronización horaria',
    capitulo: '§5.4 Device Time Sync · capabilities',
    confirmarEnSitio: 'si admite servidor de hora o sólo ajuste manual',
  },
  {
    proposito: 'fijar la hora del equipo',
    metodo: 'PUT',
    ruta: '/ISAPI/System/time',
    procedencia: 'guia_oficial',
    familia: 'comun',
    fuente: 'Guía ISAPI integral, sincronización horaria',
    capitulo: '§5.4 Device Time Sync',
    confirmarEnSitio: 'que el cambio no reinicie el equipo ni vacíe su registro',
    dejaRastro: true,
  },

  // ── EL USUARIO DE SERVICIO · privilegio mínimo, comprobable ──────────────
  {
    /**
     * La guía de integración pide un usuario **`operator`**, nunca `admin`.
     * Esto es lo que permite comprobar que ese perfil llega: qué puede hacer un
     * operador en ESTE equipo lo declara el propio aparato, y sin preguntarlo
     * la recomendación es un deseo.
     */
    proposito: 'leer qué puede hacer un usuario de servicio en este equipo',
    metodo: 'GET',
    ruta: '/ISAPI/Security/UserPermission/operatorCap',
    procedencia: 'guia_oficial',
    familia: 'comun',
    fuente:
      'Guía ISAPI integral, permisos de usuario. Los tres perfiles son administrador, ' +
      'operador y observador; la integración pide OPERADOR con privilegio mínimo',
    capitulo: '§5.8 User Management · operatorCap',
    confirmarEnSitio: 'que un operador alcance lo que la integración necesita, y nada más',
  },
  {
    proposito: 'leer qué puede hacer un observador en este equipo',
    metodo: 'GET',
    ruta: '/ISAPI/Security/UserPermission/viewerCap',
    procedencia: 'guia_oficial',
    familia: 'comun',
    fuente: 'Guía ISAPI integral, permisos de usuario',
    capitulo: '§5.8 User Management · viewerCap',
    confirmarEnSitio: 'si el perfil observador basta para el diagnóstico de sólo lectura',
  },
];
