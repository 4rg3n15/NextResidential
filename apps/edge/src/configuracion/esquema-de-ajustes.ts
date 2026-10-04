/**
 * ═════════════════════════════════════════════════════════════════════════════
 * DT-15R-09 · CÓMO HABLA EL EDGE CON LOS EQUIPOS, CON LOS AJUSTES DE LA API
 *
 * Desde la 15-Q2 (ADR-035), con puente, el Edge es el único que habla con los
 * equipos: también da de alta los rostros que la consola ordena por el túnel. Su
 * proveedor se componía SIN los ajustes que la API lee de su `.env`, y el que
 * más pesaba era el del reloj: sin umbral, el alta no leía la hora del equipo y
 * escribía la vigencia en uno que podía ir 13 h atrasado (29/09, R2 de la 15-N).
 *
 * Mismos NOMBRES, valores por omisión y límites que `apps/api/src/configuracion/
 * esquema.ts`; `apps/edge/test/proveedor-como-la-api.test.ts` lo comprueba contra
 * ese esquema para que no vuelvan a separarse. Con puente se ponen IGUALES en
 * los dos `.env`: la ficha de la consola juzga el reloj con el umbral de la API
 * (viaja con el diagnóstico) y el alta lo juzga aquí, con el del Edge.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { z } from 'zod';
import type { ConfiguracionDeProveedor } from '@ncr/providers';

/** Una zona mal escrita impide el arranque: si no, la vigencia caducaría a otra hora. */
const zonaIana = (zona: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
};

export const esquemaDeAjustes = z.object({
  /** R2 (15-N) · desvío del reloj del equipo, en s, a partir del cual no hay altas con vigencia. */
  EQUIPOS_DESVIO_DE_RELOJ_S: z.coerce.number().int().min(1).max(3600).default(30),
  /** A5 (15-L) · plazo de cada petición a un equipo, en ms. */
  EQUIPOS_TIEMPO_LIMITE_MS: z.coerce.number().int().min(500).max(30_000).default(5000),
  /** A2 (15-L) · zona del reloj del equipo: la vigencia se le escribe en hora local. */
  EQUIPOS_ZONA_HORARIA: z
    .string()
    .default('America/Bogota')
    .refine(zonaIana, 'zona horaria IANA desconocida (p. ej. America/Bogota)'),
  /** A2 (15-L) · `planTemplateNo` de la puerta en el alta de persona. */
  TERMINAL_PLAN_DE_HORARIO: z
    .string()
    .regex(/^\d{1,5}$/, 'número de plantilla horaria del equipo')
    .default('1'),
  /** A2 (15-L) · peso y lado mayor máximos de la foto que se sube a una terminal. */
  EQUIPOS_FOTO_KB_MAXIMOS: z.coerce.number().int().min(16).max(2048).default(200),
  EQUIPOS_FOTO_LADO_MAXIMO: z.coerce.number().int().min(160).max(4096).default(1024),
  /** D2 (15-L) · puerto RTSP de los equipos: el video del puente sale de aquí. */
  VIDEO_PUERTO_RTSP: z.coerce.number().int().min(1).max(65535).default(554),
});

export type ConfiguracionDeAjustes = z.infer<typeof esquemaDeAjustes>;

export type AjustesDelProveedor = Required<
  Pick<
    ConfiguracionDeProveedor,
    'tiempoLimiteMs' | 'persona' | 'limitesDeFoto' | 'puertoRtsp' | 'desvioDeRelojMaximoS'
  >
>;

/** Los ajustes del proveedor, compuestos como los compone la API (`proveedores.module.ts`). */
export const ajustesDelProveedor = (c: ConfiguracionDeAjustes): AjustesDelProveedor => ({
  tiempoLimiteMs: c.EQUIPOS_TIEMPO_LIMITE_MS,
  persona: { zonaHoraria: c.EQUIPOS_ZONA_HORARIA, planDeHorario: c.TERMINAL_PLAN_DE_HORARIO },
  limitesDeFoto: {
    bytesMaximos: c.EQUIPOS_FOTO_KB_MAXIMOS * 1024,
    ladoMaximo: c.EQUIPOS_FOTO_LADO_MAXIMO,
  },
  puertoRtsp: c.VIDEO_PUERTO_RTSP,
  desvioDeRelojMaximoS: c.EQUIPOS_DESVIO_DE_RELOJ_S,
});
