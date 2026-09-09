/**
 * Contratos compartidos — **paquete de solo tipos**.
 *
 * `openapi.json` lo genera `pnpm contrato` desde los controladores de NestJS;
 * `src/generado/api.ts` lo genera `pnpm contrato:cliente` desde ese JSON. Nada
 * de esto se escribe a mano (§2.6), y el control `contrato:desfasado` rompe el
 * build si el fichero generado no coincide con el contrato.
 *
 * **Por qué aquí no hay cliente HTTP.** `openapi-fetch` vive en `apps/web`, no
 * en este paquete. Dos razones: así `@ncr/contracts` no arrastra ninguna
 * dependencia de ejecución —lo consumen la consola, y mañana el generador de
 * Dart, que no comparte runtime—, y así el empaquetador de Next.js resuelve el
 * módulo ESM sin que este paquete tenga que decidir entre CJS y ESM por él.
 */
export type { components, operations, paths } from './generado/api';

import type { components } from './generado/api';

/**
 * Alias del vocabulario que la consola usa a diario. No son tipos nuevos: son
 * atajos sobre lo generado, para que una vista escriba `Indicadores` en vez de
 * `components['schemas']['IndicadoresDto']` y para que el día que el DTO cambie
 * de nombre haya un solo sitio que tocar.
 */
export type Esquemas = components['schemas'];

export type Sesion = Esquemas['SesionDto'];
export type Indicadores = Esquemas['IndicadoresDto'];
export type AccesosPorHora = Esquemas['AccesosPorHoraDto'];
export type FranjaDeAccesos = Esquemas['FranjaDeAccesosDto'];
export type EstadoDeDispositivos = Esquemas['EstadoDeDispositivosDto'];
export type DispositivoDelTablero = Esquemas['DispositivoDelTableroDto'];
export type EventoRegistrado = Esquemas['EventoRegistradoDto'];
export type PaginaDeEventos = Esquemas['PaginaDeEventosDto'];
export type AlertaExpuesta = Esquemas['AlertaExpuestaDto'];
export type ErrorApi = Esquemas['ErrorApiDto'];
export type Copropiedad = Esquemas['CopropiedadDto'];

/**
 * Motivo de denegación, tomado del contrato y no de una lista paralela.
 *
 * Es el tipo que permite a la consola discriminar sin comparar cadenas: si el
 * dominio añade un motivo —como pasó con `FUERA_DE_HORARIO`—, el `switch`
 * exhaustivo de la interfaz deja de compilar hasta que alguien le dé texto.
 */
export type MotivoAcceso = NonNullable<EventoRegistrado['motivo']>;

/** Estado de un dispositivo derivado del latido (RN-12, CA-26). */
export type EstadoDeDispositivo = DispositivoDelTablero['estado'];

/** Roles del sistema, tal como los declara el contrato. */
export type Rol = Sesion['rol'];
