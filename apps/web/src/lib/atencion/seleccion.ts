import type { DisparadorDeAtencion, EnAtencion, PreferenciasDeAtencion } from '@ncr/contracts';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * G2 (15-N) · QUIÉN PASA SOLO A «ATENCIÓN», QUÉ SUENA Y QUÉ ESPERA
 *
 * Tres reglas del cliente, en funciones puras para poder probarlas sin
 * pantalla:
 *
 *  · si el operador NO atiende a nadie, el primero de la cola —la cola ya
 *    viene ordenada: lo crítico y lo que más espera, delante— pasa solo a
 *    «Atención», salvo que la copropiedad haya apagado la apertura automática
 *    de ese disparador;
 *  · si YA atiende a alguien, no se le quita la pantalla: el nuevo espera, y
 *    la cola dice cuántos hay;
 *  · cada elemento NUEVO suena una vez si su disparador tiene el sonido
 *    activado. «Nuevo» es «no visto antes en esta consola», no «el último».
 *
 * Lo que el operador eligió a mano manda hasta que sale de la cola (lo
 * atendió, colgaron o venció): entonces vuelve a mandar la primera regla.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** Sin preferencias todavía (la cola no ha cargado): todo activado, como por omisión. */
const preferenciaDe = (
  preferencias: PreferenciasDeAtencion | undefined,
  disparador: DisparadorDeAtencion,
): { readonly abrir: boolean; readonly sonar: boolean } =>
  preferencias?.[disparador] ?? { abrir: true, sonar: true };

/**
 * A quién se atiende ahora. `atendiendo` es el que el operador tiene en
 * pantalla (elegido o abierto solo); si sigue en la cola, se queda.
 */
export const aQuienAtender = (
  atendiendo: string | null,
  cola: readonly EnAtencion[],
  preferencias: PreferenciasDeAtencion | undefined,
): EnAtencion | undefined => {
  const sigue = atendiendo === null ? undefined : cola.find((e) => e.eventoId === atendiendo);
  if (sigue !== undefined) return sigue;
  return cola.find((e) => preferenciaDe(preferencias, e.disparador).abrir);
};

/** Los que esperan mientras se atiende a otro: el contador de la cola. */
export const enEspera = (cola: readonly EnAtencion[], atendido: EnAtencion | undefined): number =>
  cola.filter((e) => e.eventoId !== atendido?.eventoId).length;

/** Lo que llegó desde la última vez que se miró. */
export const nuevos = (
  vistos: ReadonlySet<string>,
  cola: readonly EnAtencion[],
): readonly EnAtencion[] => cola.filter((e) => !vistos.has(e.eventoId));

/** Si alguno de los nuevos tiene el sonido activado. */
export const debeSonar = (
  recienLlegados: readonly EnAtencion[],
  preferencias: PreferenciasDeAtencion | undefined,
): boolean => recienLlegados.some((e) => preferenciaDe(preferencias, e.disparador).sonar);

/** Lo visto, sin crecer sin límite: sólo lo que sigue en la cola más lo nuevo. */
export const actualizarVistos = (cola: readonly EnAtencion[]): ReadonlySet<string> =>
  new Set(cola.map((e) => e.eventoId));

/** Qué dice la pantalla de cada disparador, en palabras de portería. */
export const ETIQUETA_DE_DISPARADOR: Readonly<Record<DisparadorDeAtencion, string>> = {
  llamada: 'Llamada',
  rostro: 'Persona no autorizada',
  placa: 'Placa sin autorización',
  lista_negra: 'Lista negra',
  dudoso: 'El sistema no pudo decidir',
};

/** La ruta que atiende a un elemento, según quién la pide. */
export const rutaParaAtender = (rol: string, eventoId: string): string =>
  `${rol === 'portero' ? '/porteria' : '/guardia'}?atender=${encodeURIComponent(eventoId)}`;
