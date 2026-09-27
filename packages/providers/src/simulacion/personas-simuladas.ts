/**
 * ═════════════════════════════════════════════════════════════════════════════
 * A2 (ETAPA 15-L) · LAS PERSONAS QUE GUARDA LA TERMINAL SIMULADA
 *
 * Hasta la 15-L el simulado contestaba «OK» a cualquier alta de persona y no la
 * recordaba. Así no podía demostrar lo que A2 promete: que el EQUIPO caduca la
 * credencial por su cuenta aunque la supresión no llegue. Ahora:
 *
 *  · valida el registro como la guía («Add a person»): `employeeNo` de 1 a 32,
 *    `userType` del enumerado, `Valid` con `beginTime`/`endTime` SIN desfase
 *    cuando `timeType` es `local` (o falta), dentro de 1970–2037 y en orden;
 *    `doorRight` como lista de números;
 *  · rechaza el rostro de quien no está dado de alta (extracto de la guía: el
 *    rostro sin persona previa es la causa más probable del `400` de sitio);
 *  · y al reconocer a alguien decide EN LOCAL antes de preguntar.
 *
 * `[SUPUESTO]` S-70: con `needDeviceCheck` (por omisión `true`), la terminal
 * comprueba la vigencia y el permiso de puerta de la persona ANTES de pedir el
 * veredicto a la plataforma, y fuera de ellos emite «Face Authentication
 * Failed» (5/76) sin `remoteCheck`. La guía dice que la verificación remota
 * «requiere autenticación del equipo»; no dice con qué código niega. El ensayo
 * de sitio lo captura.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { horaLocalSinDesfase } from '../terminal/persona-en-el-equipo';

export interface PersonaSimulada {
  readonly tipo: 'normal' | 'visitor' | 'blackList' | 'maintenance';
  /** Hora local del equipo, `AAAA-MM-DDTHH:mm:ss`, o `null` si es permanente. */
  readonly desde: string | null;
  readonly hasta: string | null;
  readonly puertas: readonly number[];
}

/** Las personas de cada terminal simulada, por destino: el oráculo de A2. */
export const personasPor = new Map<string, Map<string, PersonaSimulada>>();
/** Lo que cada terminal negó EN LOCAL, `persona:motivo`, por destino. */
export const negacionesLocalesPor = new Map<string, string[]>();

const TIPOS = new Set(['normal', 'visitor', 'blackList', 'maintenance']);
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const PRIMERO = '1970-01-01T00:00:00';
const ULTIMO = '2037-12-31T23:59:59';

const objeto = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** El registro de la petición, o `null` si la guía lo rechazaría (`badParameters`). */
export const leerPersona = (
  cuerpo: string,
): { readonly id: string; readonly persona: PersonaSimulada } | null => {
  let raiz: unknown;
  try {
    raiz = JSON.parse(cuerpo);
  } catch {
    return null;
  }
  const info = objeto(objeto(raiz)?.['UserInfo']);
  const id = info?.['employeeNo'];
  const tipo = info?.['userType'];
  const valido = objeto(info?.['Valid']);
  if (typeof id !== 'string' || id.length < 1 || id.length > 32) return null;
  if (typeof tipo !== 'string' || !TIPOS.has(tipo)) return null;
  if (valido === null || typeof valido['enable'] !== 'boolean') return null;

  let desde: string | null = null;
  let hasta: string | null = null;
  if (valido['enable'] === true) {
    const inicio = valido['beginTime'];
    const fin = valido['endTime'];
    const enUtc = valido['timeType'] === 'UTC';
    // En hora local la guía pide la hora SIN zona: con desfase es otro formato.
    if (enUtc || typeof inicio !== 'string' || typeof fin !== 'string') return null;
    if (!LOCAL.test(inicio) || !LOCAL.test(fin)) return null;
    if (inicio < PRIMERO || fin > ULTIMO || fin < inicio) return null;
    desde = inicio;
    hasta = fin;
  }

  const derecho = info?.['doorRight'];
  if (derecho !== undefined && (typeof derecho !== 'string' || !/^\d+(,\d+)*$/.test(derecho))) {
    return null;
  }
  const puertas = typeof derecho === 'string' ? derecho.split(',').map(Number) : [];
  return {
    id,
    persona: { tipo: tipo as PersonaSimulada['tipo'], desde, hasta, puertas },
  };
};

export type DecisionLocal = 'pregunta' | 'fuera_de_vigencia' | 'sin_permiso_de_puerta';

/**
 * Lo que decide la terminal con una persona que reconoce, a la hora LOCAL del
 * evento. Sin persona registrada —los flujos de prueba que emiten un rostro
 * sin alta previa— pregunta, como antes de la 15-L.
 */
export const decisionLocal = (
  persona: PersonaSimulada | undefined,
  horaLocal: string | null,
  puerta: number,
): DecisionLocal => {
  if (persona === undefined) return 'pregunta';
  if (persona.desde !== null && persona.hasta !== null && horaLocal !== null) {
    if (horaLocal < persona.desde || horaLocal > persona.hasta) return 'fuera_de_vigencia';
  }
  if (persona.puertas.length > 0 && !persona.puertas.includes(puerta)) {
    return 'sin_permiso_de_puerta';
  }
  return 'pregunta';
};

/**
 * La hora de pared, en la zona del equipo, del `dateTime` de un evento. El
 * equipo real emite su hora local con desfase («10:00:00-05:00»); un bloque de
 * prueba puede traerla en UTC («15:00:00Z»). Los dos son el mismo instante, y
 * la vigencia se compara en la hora local del equipo.
 */
export const horaDePared = (fecha: unknown, zona: string): string | null => {
  if (typeof fecha !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(fecha)) return fecha;
  const instante = new Date(fecha);
  return Number.isNaN(instante.getTime()) ? null : horaLocalSinDesfase(instante, zona);
};

/** El bloque que la terminal emite cuando niega en local: 5/76, sin pregunta. */
export const negadoEnLocal = (bloque: Record<string, unknown>): Record<string, unknown> => {
  const resto = Object.fromEntries(
    Object.entries(objeto(bloque['AccessControllerEvent']) ?? {}).filter(
      ([campo]) => campo !== 'remoteCheck',
    ),
  );
  return {
    ...bloque,
    AccessControllerEvent: { ...resto, majorEventType: 5, subEventType: 76 },
  };
};
