/**
 * ═════════════════════════════════════════════════════════════════════════════
 * E1-f (15-M) · LO QUE EL EQUIPO DICE EN EL CUERPO DE SU `401`
 *
 * Los equipos contestan al rechazo con un `<userCheck>`: `statusValue`,
 * y —cuando la cuenta o la dirección están bloqueadas— `lockStatus`,
 * `retryTimes` (intentos que quedan) y `unlockTime` (segundos hasta el
 * desbloqueo). El 28/09 el cuerpo traía `statusValue 401` **sin**
 * `lockStatus`: no era un bloqueo, y la ficha tiene que poder decirlo.
 *
 * `[SUPUESTO]` S-108: los nombres de las etiquetas son los del formato
 * `userCheck` de la guía ISAPI general; el extracto del DS-K1T344 no los
 * enumera. Si el equipo usa otros, se leen como «sin bloqueo declarado».
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface UserCheck {
  readonly statusValue: number | null;
  /** `true` sólo si el cuerpo dice `lockStatus` = `lock`. */
  readonly bloqueada: boolean;
  /** Segundos hasta el desbloqueo, si el equipo los declara. */
  readonly segundosParaDesbloquear: number | null;
  /** Intentos que el equipo dice que quedan, si los declara. */
  readonly intentosRestantes: number | null;
}

const etiqueta = (cuerpo: string, nombre: string): string | null => {
  const encontrado = new RegExp(`<${nombre}>\\s*([^<]*?)\\s*</${nombre}>`, 'i').exec(cuerpo);
  return encontrado?.[1] ?? null;
};

const entero = (texto: string | null): number | null => {
  if (texto === null || texto === '') return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
};

/** `null` si el cuerpo no es un `userCheck`. */
export const interpretarUserCheck = (cuerpo: string): UserCheck | null => {
  if (!/<userCheck\b/i.test(cuerpo)) return null;
  return {
    statusValue: entero(etiqueta(cuerpo, 'statusValue')),
    bloqueada: (etiqueta(cuerpo, 'lockStatus') ?? '').trim().toLowerCase() === 'lock',
    segundosParaDesbloquear: entero(etiqueta(cuerpo, 'unlockTime')),
    intentosRestantes: entero(etiqueta(cuerpo, 'retryTimes')),
  };
};

/** El bloqueo declarado, en palabras del operador; `''` si no hay bloqueo. */
export const bloqueoEnPalabras = (u: UserCheck | null): string => {
  if (u === null || !u.bloqueada) return '';
  const cuando =
    u.segundosParaDesbloquear === null
      ? 'sin decir por cuánto tiempo'
      : `se desbloquea en ${String(u.segundosParaDesbloquear)} s`;
  return `el equipo tiene la cuenta BLOQUEADA (${cuando})`;
};
