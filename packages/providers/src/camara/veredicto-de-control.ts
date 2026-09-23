import { bloques, booleano, entero, etiqueta } from '../equipo/xml';
import { juzgarModo, leerCtrlMod } from './modo-de-control';
import type { VeredictoDeModo } from './modo-de-control';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * QUIÉN DECIDE DE VERDAD · y son TRES vías, no una
 *
 * Hasta la 15-B, «quién manda» era una pregunta con una sola respuesta:
 * `ctrlMode`. La guía integral del fabricante enseña que el modo de control es
 * **sólo la primera** de tres vías por las que ese equipo puede abrir una
 * barrera sin que Next Control decida nada:
 *
 * | Vía | Dónde vive                              | Qué la hace peligrosa                 |
 * | --- | --------------------------------------- | ------------------------------------- |
 * | 1   | `ctrlMode`                              | Con 0 o 2, abre la cámara             |
 * | 2   | `vehInfoManagList` + `relayList`        | La cámara lleva SU PROPIO motor       |
 * | 3   | Disparadores vinculados con acción de E/S | Abren el relé pase lo que pase      |
 *
 * La vía 2 es la que sorprende, y por eso se lee entera aquí. El mismo
 * documento de parámetros de entrada declara, por cada política de vehículo
 * —temporal, lista negra, lista blanca—, **qué debe hacer la barrera**. Eso es,
 * literalmente, un motor de reglas dentro del aparato: el competidor directo
 * del que este proyecto dice que vive en Next Control. Comprobar `ctrlMode` y
 * no mirar esa lista es aprobar un equipo que decide por su cuenta en cuanto
 * una placa esté en su lista blanca.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ BLOQUEA Y QUÉ SÓLO AVISA · la distinción es deliberada
 *
 * **Bloquean** `ctrlMode` y una operación de barrera de apertura autónoma:
 * las dos significan que el equipo abre sin nosotros, y con eso la trazabilidad
 * que este producto vende es falsa.
 *
 * **Avisan** `notCloseCarFollow` —no cerrar mientras haya vehículos pegados— y
 * `bigCarKeepOpen` —dejar la barrera arriba un tiempo para vehículos grandes—.
 * No son decisiones de acceso: son comportamientos del brazo. Pero dejan pasar
 * vehículos **sin evento**, así que un histórico que dice «hoy entraron 40» se
 * queda corto y nadie sabe cuánto. Se reportan con esas palabras porque quien
 * los configuró rara vez sabe que lo son.
 *
 * Y el relé: `relayList` dice **cuál** de los relés abre la barrera
 * (`relayFunction` = 1). Ese número no se adivina. Accionar el relé equivocado
 * en un equipo con varios es encender una luz mientras el brazo sigue abajo, y
 * el sistema informando de que abrió.
 */

/** Clase de política interna, según el número de gestión de vehículo. */
export type ClaseDeReglaInterna = 'temporal' | 'lista_negra' | 'lista_blanca' | 'desconocida';

const CLASE_POR_NUMERO: Readonly<Record<string, ClaseDeReglaInterna>> = {
  '0': 'temporal',
  '1': 'lista_negra',
  '2': 'lista_blanca',
};

/**
 * Operaciones de barrera que significan **abrir**.
 *
 * El vocabulario del control de barrera de entrada usa `on` para subir el
 * brazo; el de aparcamiento usa `open`. Se admiten las dos porque el campo de
 * la política no declara cuál de los dos vocabularios habla.
 */
const ABRE = /^(on|open)$/i;

/** Operaciones que NO abren, y que por tanto son admisibles en una política. */
const NO_ABRE = /^(off|close|stop|locked|lock|none|noaction|no_action)$/i;

export interface ReglaInternaDeLaCamara {
  readonly numero: number | null;
  readonly clase: ClaseDeReglaInterna;
  readonly operacionDeBarrera: string | null;
  /** `true` cuando esa política abre el brazo por su cuenta. */
  readonly abreSola: boolean;
  /** `true` cuando la operación declarada no está en el vocabulario conocido. */
  readonly operacionDesconocida: boolean;
  readonly subeAlarma: boolean | null;
}

export interface ReleDeLaCamara {
  readonly numero: number | null;
  readonly funcion: number | null;
  readonly abreLaBarrera: boolean;
}

/** Un hallazgo del veredicto: qué campo, qué pasa y qué hay que dejar puesto. */
export interface HallazgoDeConfiguracion {
  readonly campo: string;
  readonly valorLeido: string | null;
  readonly detalle: string;
  /** Qué valor deja el equipo conforme. `null` cuando depende de la instalación. */
  readonly valorCorrecto: string | null;
}

export interface VeredictoDeControl {
  /** `false` si hay un solo bloqueo. Es lo que mira la guarda del proveedor. */
  readonly admisible: boolean;
  /** El veredicto de `ctrlMode`, tal cual, para no perder su texto. */
  readonly modo: VeredictoDeModo;
  readonly reglasInternas: readonly ReglaInternaDeLaCamara[];
  readonly reles: readonly ReleDeLaCamara[];
  /** Número del relé que abre la barrera, leído y no supuesto. */
  readonly releQueAbre: number | null;
  /** Lo que impide operar. Vacío = conforme. */
  readonly bloqueos: readonly HallazgoDeConfiguracion[];
  /** Lo que se reporta sin bloquear: abre sin decisión nuestra y sin evento. */
  readonly avisos: readonly HallazgoDeConfiguracion[];
  /** `false` cuando la respuesta no traía el documento esperado. */
  readonly leido: boolean;
  readonly detalle: string;
}

const reglaDe = (xml: string): ReglaInternaDeLaCamara => {
  const numeroCrudo = etiqueta(xml, 'vehInfoManagNum');
  const operacion = etiqueta(xml, 'barrierGateOper');
  const normalizada = (operacion ?? '').trim();
  return {
    numero: entero(numeroCrudo),
    clase: CLASE_POR_NUMERO[numeroCrudo ?? ''] ?? 'desconocida',
    operacionDeBarrera: normalizada === '' ? null : normalizada,
    abreSola: ABRE.test(normalizada),
    // Una operación que el vocabulario no conoce NO se da por inocua: no se
    // puede afirmar que no abra, y la dirección segura de este proyecto es la
    // misma en todas partes.
    operacionDesconocida:
      normalizada !== '' && !ABRE.test(normalizada) && !NO_ABRE.test(normalizada),
    subeAlarma: booleano(etiqueta(xml, 'upAlarmEnable')),
  };
};

const releDe = (xml: string): ReleDeLaCamara => {
  const funcion = entero(etiqueta(xml, 'relayFunction'));
  return { numero: entero(etiqueta(xml, 'relayNum')), funcion, abreLaBarrera: funcion === 1 };
};

const NOMBRE_DE_CLASE: Readonly<Record<ClaseDeReglaInterna, string>> = {
  temporal: 'vehículos temporales',
  lista_negra: 'su lista negra',
  lista_blanca: 'su lista blanca',
  desconocida: 'una política que no declara a qué grupo aplica',
};

/**
 * Lee el documento de parámetros de entrada y emite el veredicto COMPLETO.
 *
 * Función pura sobre el cuerpo de la respuesta: no habla con nadie y por eso se
 * prueba con los XML literales de la guía, que es lo único que demuestra que la
 * lectura es la correcta y no la que nos conviene.
 */
export const leerVeredictoDeControl = (cuerpo: string): VeredictoDeControl => {
  const modo = juzgarModo(leerCtrlMod(cuerpo));
  const entrada = bloques(cuerpo, 'EntranceParam')[0] ?? cuerpo;
  const leido = /EntranceParam|ctrlMode?/i.test(cuerpo);

  const reglasInternas = bloques(entrada, 'vehInfoManag').map(reglaDe);
  const reles = bloques(entrada, 'relay').map(releDe);
  const releQueAbre = reles.find((r) => r.abreLaBarrera)?.numero ?? null;

  const bloqueos: HallazgoDeConfiguracion[] = [];
  const avisos: HallazgoDeConfiguracion[] = [];

  if (!modo.admisible) {
    bloqueos.push({
      campo: 'modo de control',
      valorLeido: modo.valorLeido,
      detalle: modo.detalle,
      valorCorrecto: '1',
    });
  }

  for (const regla of reglasInternas) {
    if (regla.abreSola) {
      bloqueos.push({
        campo: `política interna ${String(regla.numero ?? '?')}`,
        valorLeido: regla.operacionDeBarrera,
        detalle:
          `La cámara abre la barrera por su cuenta para ${NOMBRE_DE_CLASE[regla.clase]}. ` +
          'Es un motor de reglas dentro del aparato: decide sin vigencia, sin patrón, sin ' +
          'zona y sin lista negra nuestras, y lo que registremos será una segunda opinión',
        valorCorrecto: 'una operación que no suba el brazo',
      });
    } else if (regla.operacionDesconocida) {
      bloqueos.push({
        campo: `política interna ${String(regla.numero ?? '?')}`,
        valorLeido: regla.operacionDeBarrera,
        detalle:
          'La política declara una operación de barrera que este catálogo no conoce. No se ' +
          'puede afirmar que no abra, así que no se da por buena: captúrela y catalóguela',
        valorCorrecto: null,
      });
    }
  }

  const seguirAlCoche = booleano(etiqueta(entrada, 'notCloseCarFollow'));
  if (seguirAlCoche === true) {
    avisos.push({
      campo: 'no cerrar con vehículos pegados',
      valorLeido: 'true',
      detalle:
        'Con esto activo el brazo NO baja mientras siga habiendo vehículos detrás, así que ' +
        'entran varios con una sola decisión y sin un evento por cada uno. No lo decidimos ' +
        'nosotros y no queda en el histórico: el recuento de accesos del día se queda corto',
      valorCorrecto: 'false, salvo que la instalación lo exija y se acepte el hueco',
    });
  }

  const vehiculoGrande = bloques(entrada, 'bigCarKeepOpen')[0] ?? '';
  if (booleano(etiqueta(vehiculoGrande, 'enabled')) === true) {
    avisos.push({
      campo: 'mantener abierto para vehículos grandes',
      valorLeido: etiqueta(vehiculoGrande, 'duration'),
      detalle:
        'El brazo se queda arriba un tiempo tras reconocer un vehículo grande. Durante esa ' +
        'ventana pasa cualquiera, sin decisión y sin evento',
      valorCorrecto: 'false, salvo que la instalación lo exija y se acepte el hueco',
    });
  }

  if (reles.length > 0 && releQueAbre === null) {
    avisos.push({
      campo: 'relé de apertura',
      valorLeido: reles.map((r) => `${String(r.numero)}:${String(r.funcion)}`).join(' '),
      detalle:
        'Ningún relé declara la función de abrir la barrera. Accionar uno al azar encendería ' +
        'otra cosa mientras el brazo sigue abajo, y el sistema informaría de que abrió',
      valorCorrecto: 'un relé con función de apertura',
    });
  }

  const admisible = leido && bloqueos.length === 0;
  return {
    admisible,
    modo,
    reglasInternas,
    reles,
    releQueAbre,
    bloqueos,
    avisos,
    leido,
    detalle: !leido
      ? 'El equipo no devolvió sus parámetros de entrada: no se puede afirmar quién decide'
      : admisible
        ? avisos.length === 0
          ? 'La plataforma decide y el equipo no abre por su cuenta por ninguna vía'
          : `La plataforma decide, con ${String(avisos.length)} comportamiento(s) del brazo que ` +
            'dejan pasar vehículos sin evento'
        : `${String(bloqueos.length)} motivo(s) por los que el equipo decide por su cuenta`,
  };
};
