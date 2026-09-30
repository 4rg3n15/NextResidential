/**
 * ═════════════════════════════════════════════════════════════════════════════
 * G1 (15-N) · QUÉ NECESITA A UNA PERSONA · P-22, DECIDIDO POR EL CLIENTE
 *
 * Hasta la 15-N la cola de atención eran los 50 eventos más recientes de la
 * última hora, PERMITIDOS INCLUIDOS: el «evento actual» podía ser un residente
 * que entró hace 50 minutos. El cliente decidió (P-22): la cola recibe, SÓLO de
 * lo que llega EN VIVO —nunca el volcado histórico de un equipo—,
 *
 *  · la llamada del videoportero (y el timbre);
 *  · un rostro no reconocido o una persona no autorizada en la terminal o el
 *    videoportero, incluido el «permiso vencido»;
 *  · una placa no registrada o sin autorización vigente;
 *  · la lista negra;
 *  · lo dudoso: el motor no pudo decidir, o leyó con baja confianza.
 *
 * Un acceso PERMITIDO no entra: va a Eventos. Una orden manual tampoco: ya la
 * decidió una persona. Aquí se clasifica, con funciones puras, qué disparador
 * es cada cosa —o ninguno—; la cola, la alerta y la consola lo usan igual.
 *
 * Ojo con la contradicción que esto resuelve: la política de alertas del
 * dominio (`politica-alertas.ts`) deja FUERA la vigencia expirada y el patrón
 * incumplido «para no ahogar al operador». El cliente decidió lo contrario
 * para la cola de atención; se implementa en la APLICACIÓN, sin tocar el
 * dominio ([CONTRADICCIÓN] C-45).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const DISPARADORES_DE_ATENCION = [
  'llamada',
  'rostro',
  'placa',
  'lista_negra',
  'dudoso',
] as const;
export type DisparadorDeAtencion = (typeof DISPARADORES_DE_ATENCION)[number];

/** Lo que hace falta saber de un acceso ya decidido por el motor. */
export interface AccesoParaAtencion {
  readonly resultado: 'permitido' | 'negado';
  readonly motivo: string | null;
  readonly metodo: string;
}

/** Motivos del motor que son «no se sabe», no «no»: el operador decide. */
const MOTIVOS_DUDOSOS: ReadonlySet<string> = new Set(['CONFIANZA_INSUFICIENTE', 'FALLO_TECNICO']);

export const disparadorDeAcceso = (a: AccesoParaAtencion): DisparadorDeAtencion | null => {
  if (a.resultado !== 'negado') return null;
  // Una negación MANUAL ya la decidió una persona; la del Edge, igual que la nube.
  if (a.metodo === 'manual') return null;
  if (a.motivo === 'LISTA_NEGRA') return 'lista_negra';
  if (a.motivo !== null && MOTIVOS_DUDOSOS.has(a.motivo)) return 'dudoso';
  if (a.metodo === 'placa') return 'placa';
  if (a.metodo === 'facial') return 'rostro';
  return null;
};

/** Lo que hace falta saber de un evento de equipo guardado. */
export interface EventoDeEquipoParaAtencion {
  readonly tipo: string;
  readonly enVivo: boolean;
  readonly origen: 'equipo' | 'plataforma';
  /** Si acompaña a un acceso, el acceso es el que va a la cola (no dos veces). */
  readonly eventoId: string | null;
}

/**
 * Tipos del catálogo de eventos del equipo (`@ncr/providers`) que disparan.
 * `llamada` es la que EMPIEZA (orden `request`); cancelar, contestar o colgar
 * la TERMINAN (`TIPOS_QUE_TERMINAN_LA_LLAMADA`).
 */
const TIPO_A_DISPARADOR: Readonly<Record<string, DisparadorDeAtencion>> = {
  llamada: 'llamada',
  timbre: 'llamada',
  rostro_no_reconocido: 'rostro',
  // R2 (15-N) · la negación que decide el propio equipo (vencido, fuera de horario, sin permiso).
  acceso_negado_por_el_equipo: 'rostro',
  lista_negra: 'lista_negra',
};

export const disparadorDeEventoDeEquipo = (
  e: EventoDeEquipoParaAtencion,
): DisparadorDeAtencion | null => {
  if (!e.enVivo || e.origen !== 'equipo' || e.eventoId !== null) return null;
  return TIPO_A_DISPARADOR[e.tipo] ?? null;
};

export const TIPOS_DE_EQUIPO_QUE_DISPARAN: readonly string[] = Object.keys(TIPO_A_DISPARADOR);

/** [SUPUESTO] S-161 · la llamada deja de pedir atención cuando el equipo dice que terminó. */
export const TIPOS_QUE_TERMINAN_LA_LLAMADA: ReadonlySet<string> = new Set([
  'llamada_cancelada',
  'llamada_contestada',
  'llamada_rechazada',
  'llamada_sin_respuesta',
  'llamada_colgada',
]);

/** Lo que va delante en la cola: el riesgo antes que la espera. */
export const DISPARADORES_CRITICOS: ReadonlySet<DisparadorDeAtencion> = new Set([
  'lista_negra',
  'dudoso',
]);

/**
 * G2 (15-N) · la alerta de un acceso que la política del DOMINIO deja fuera
 * (vigencia expirada, patrón, horario, zona, consentimiento, aforo: «el motor
 * decidió con certeza») pero que el cliente quiere en la Atención. Sólo para
 * lo que `clasificarAcceso` no cubre ya: lista negra y dudoso siguen su
 * camino de siempre. [CONTRADICCIÓN] C-45.
 */
export interface DescriptorDeAtencion {
  readonly tipo: 'acceso_dudoso';
  readonly severidad: 'media';
  readonly porQue: string;
}

export const descriptorDeAtencion = (a: AccesoParaAtencion): DescriptorDeAtencion | null => {
  const disparador = disparadorDeAcceso(a);
  if (disparador === 'rostro') {
    return {
      tipo: 'acceso_dudoso',
      severidad: 'media',
      porQue: `persona no autorizada en la puerta (${a.motivo ?? 'sin motivo'})`,
    };
  }
  if (disparador === 'placa') {
    return {
      tipo: 'acceso_dudoso',
      severidad: 'media',
      porQue: `placa sin autorización vigente (${a.motivo ?? 'sin motivo'})`,
    };
  }
  return null;
};
