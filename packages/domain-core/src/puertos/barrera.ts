/**
 * Puerto de **accionamiento de una barrera vehicular**, y el resultado que
 * devuelve.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EL RESULTADO TIENE TRES ESTADOS Y NINGUNO ES «ABIERTA»
 *
 * Tres hallazgos de la validación en sitio del 15/09/2026 obligan a esta forma
 * y no a otra. Están documentados en `docs/guias/VALIDACION_HIKVISION_EN_SITIO.md`.
 *
 * **H-1 · La respuesta correcta no prueba que la barrera se movió.** Observado,
 * no supuesto: con el equipo bloqueado, la orden de abrir responde
 * afirmativamente y el relé no actúa. Una respuesta correcta significa «orden
 * aceptada», nunca «paso franqueado».
 *
 * **H-2 · No hay señal de posición.** Las entradas de estado de la barrera no
 * están cableadas, y el propio equipo lo advierte. Hoy el sistema **no puede
 * demostrar** que una puerta se abrió, y una interfaz que lo afirmara estaría
 * mintiendo.
 *
 * Por eso el estado afirmativo se llama `aceptada` y lleva
 * `pasoFranqueadoObservable` fijado a `false` **por el tipo**, no por
 * convención: no existe manera de construir un resultado que diga lo
 * contrario. Añadir un estado `abierta` o `confirmada` exige antes la señal de
 * posición de H-2, que es cableado, no código.
 *
 * **Y `rechazada` no es lo mismo que `inalcanzable`.** Un portero delante de la
 * barrera necesita distinguirlas: la primera se resuelve desbloqueando el
 * acceso —alguien lo dejó bloqueado—; la segunda, llamando al técnico. Un
 * único «no se pudo» las convierte en el mismo callejón.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface OrdenAceptada {
  readonly estado: 'aceptada';
  /**
   * Siempre `false`, y el tipo lo impone. H-1 y H-2: el equipo confirma que
   * recibió la orden, no que el vehículo pasó.
   */
  readonly pasoFranqueadoObservable: false;
  readonly latenciaMs: number;
}

export interface OrdenRechazada {
  readonly estado: 'rechazada';
  /** Lo que contestó el equipo, ya traducido a lenguaje del operador. */
  readonly motivo: string;
  readonly latenciaMs: number;
}

export interface OrdenInalcanzable {
  readonly estado: 'inalcanzable';
  readonly motivo: string;
  readonly latenciaMs: number;
}

export type ResultadoDeAccionamiento = OrdenAceptada | OrdenRechazada | OrdenInalcanzable;

/**
 * Control de una barrera vehicular.
 *
 * Dos operaciones y no una, porque **no son la misma cosa** (H-3): accionar es
 * un pulso que afecta a un paso concreto; el bloqueo es **estado persistente**
 * que sobrevive a la orden y manda sobre cualquier decisión posterior. Con la
 * barrera bloqueada, una placa autorizada no abre. Meterlas en el mismo método
 * las haría parecer intercambiables, y no lo son ni en consecuencias ni en
 * quién puede ejecutarlas.
 *
 * El vocabulario del fabricante —protocolo, módulo, nombres de campo, número de
 * canal— **no aparece en esta interfaz ni puede aparecer**: vive dentro del
 * adaptador y solo allí (KPI-11). Lo que cruza esta frontera es intención.
 */
export interface ControlDeBarrera {
  /** Pulso de paso. `abrir = false` es la orden contraria, también momentánea. */
  accionar(dispositivoId: string, abrir: boolean): Promise<ResultadoDeAccionamiento>;
  /** Estado persistente. `bloqueado = true` impide todo paso hasta revertirlo. */
  fijarBloqueo(dispositivoId: string, bloqueado: boolean): Promise<ResultadoDeAccionamiento>;
}

/** Constructores, para que ningún adaptador arme el resultado a mano. */
export const ordenAceptada = (latenciaMs: number): OrdenAceptada => ({
  estado: 'aceptada',
  pasoFranqueadoObservable: false,
  latenciaMs,
});

export const ordenRechazada = (motivo: string, latenciaMs: number): OrdenRechazada => ({
  estado: 'rechazada',
  motivo,
  latenciaMs,
});

export const ordenInalcanzable = (motivo: string, latenciaMs: number): OrdenInalcanzable => ({
  estado: 'inalcanzable',
  motivo,
  latenciaMs,
});
