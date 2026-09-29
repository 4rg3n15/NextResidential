import type { Vigencia } from '@ncr/domain-core';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * A2 (ETAPA 15-L) · LA PERSONA QUE LA TERMINAL GUARDA, CON SU VIGENCIA
 *
 * El registro `UserInfo` de la guía de control de acceso. Tres decisiones:
 *
 *  1. **La vigencia viaja al aparato.** `Valid.enable = true` con
 *     `beginTime`/`endTime` hace que la TERMINAL caduque la credencial por su
 *     cuenta: si la supresión de RN-11 no llega —equipo caído, red cortada—, el
 *     rostro deja de valer igual al vencer la autorización.
 *
 *  2. **En hora local, sin desfase.** Con `timeType: "local"` la guía pide la
 *     hora SIN zona («2017-08-01T17:30:08») y la interpreta como la del
 *     equipo. Se escribe en la zona de la copropiedad (America/Bogota por
 *     omisión, configurable): el reloj del equipo tiene que estar en esa misma
 *     zona, y el ensayo de sitio lo comprueba.
 *
 *  3. **`endTime` es el último segundo DENTRO.** La `Vigencia` del dominio es
 *     `[desde, hasta)`: el instante `hasta` ya está fuera (CA-04). El equipo
 *     trabaja por segundos y no dice si su fin es inclusivo, así que se escribe
 *     `hasta − 1 s`: nunca un segundo de más.
 *
 * Sin vigencia, el registro es BYTE A BYTE el de antes de la 15-L
 * (`userType: "normal"`, `Valid.enable: false`), salvo `doorRight`/`RightPlan`
 * cuando la terminal tiene puerta declarada, que no dependen de la vigencia.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** Zona de la copropiedad cuando nadie la declara: la del país del proyecto. */
export const ZONA_POR_OMISION = 'America/Bogota';
/** Plantilla horaria de la puerta cuando nadie la declara: la 1 de la terminal. */
export const PLAN_POR_OMISION = '1';

/** El rango que admite el equipo, en hora local (guía: 1970-01-01 a 2037-12-31). */
const PRIMERO = '1970-01-01T00:00:00';
const ULTIMO = '2037-12-31T23:59:59';

export interface AjustesDePersona {
  /** Zona IANA en la que el equipo lleva su reloj. */
  readonly zonaHoraria?: string;
  /** `planTemplateNo` de la puerta. «1» por omisión; «65535» es 7×24 en otros modelos. */
  readonly planDeHorario?: string;
  /**
   * E3 (15-M) · el `userType` con vigencia, según lo que el EQUIPO declara
   * (`forma-del-alta.ts`). `visitor` por omisión, que es lo de siempre.
   */
  readonly tipoConVigencia?: 'visitor' | 'normal';
}

export interface PersonaEnElEquipo {
  readonly employeeNo: string;
  readonly name: string;
  readonly userType: 'normal' | 'visitor';
  readonly Valid:
    | { readonly enable: false }
    | {
        readonly enable: true;
        readonly beginTime: string;
        readonly endTime: string;
        readonly timeType: 'local';
      };
  readonly doorRight?: string;
  readonly RightPlan?: readonly { readonly doorNo: number; readonly planTemplateNo: string }[];
}

/**
 * La hora de pared de `instante` en `zona`, como la escribe el equipo:
 * `AAAA-MM-DDTHH:mm:ss`, sin desfase. Se acota al rango que admite el equipo:
 * una autorización hasta 2040 se escribe hasta el último segundo de 2037, que
 * es lo más que el aparato puede guardar (y se dice en la traza del llamante).
 */
export const horaLocalSinDesfase = (instante: Date, zona: string): string => {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instante);
  const de = (tipo: Intl.DateTimeFormatPartTypes): string =>
    partes.find((p) => p.type === tipo)?.value ?? '00';
  const texto = `${de('year')}-${de('month')}-${de('day')}T${de('hour')}:${de('minute')}:${de('second')}`;
  // Comparar como texto es exacto: el formato es de ancho fijo y de mayor a menor.
  return texto < PRIMERO ? PRIMERO : texto > ULTIMO ? ULTIMO : texto;
};

/** ¿La zona existe? Una zona mal escrita en el `.env` no puede fallar en la puerta. */
export const zonaValida = (zona: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
};

export const personaEnElEquipo = (
  identificador: string,
  vigencia: Vigencia | undefined,
  numeroDePuerta: number | null | undefined,
  ajustes: AjustesDePersona = {},
): PersonaEnElEquipo => {
  const zona = ajustes.zonaHoraria ?? ZONA_POR_OMISION;
  const puerta =
    numeroDePuerta === null || numeroDePuerta === undefined
      ? {}
      : {
          doorRight: String(numeroDePuerta),
          RightPlan: [
            { doorNo: numeroDePuerta, planTemplateNo: ajustes.planDeHorario ?? PLAN_POR_OMISION },
          ],
        };
  if (vigencia === undefined) {
    return {
      employeeNo: identificador,
      // El nombre NO viaja: el equipo no es fuente de verdad y no hay motivo
      // para dejar datos personales en un aparato cuyo registro se puede
      // borrar por API. La identidad vive en `plantillas_biometricas`.
      name: identificador,
      userType: 'normal',
      Valid: { enable: false },
      ...puerta,
    };
  }
  const beginTime = horaLocalSinDesfase(vigencia.desde, zona);
  const ultimo = horaLocalSinDesfase(new Date(vigencia.hasta.getTime() - 1000), zona);
  return {
    employeeNo: identificador,
    name: identificador,
    /**
     * `[SUPUESTO]` S-69: una plantilla que se sincroniza CON vigencia es de un
     * visitante. En este sistema el dato biométrico sincronizado es el del
     * visitante (ETAPA 08, RN-10) y su vigencia es la de su autorización; el
     * residente no la lleva. E3 (15-M): si el equipo declara que no admite
     * `visitor` (el DS-KD9633 sólo admite `normal`), va `normal` con la misma
     * vigencia en `Valid`.
     */
    userType: ajustes.tipoConVigencia ?? 'visitor',
    Valid: {
      enable: true,
      beginTime,
      // Una vigencia de menos de un segundo no puede terminar antes de empezar.
      endTime: ultimo < beginTime ? beginTime : ultimo,
      timeType: 'local',
    },
    ...puerta,
  };
};
