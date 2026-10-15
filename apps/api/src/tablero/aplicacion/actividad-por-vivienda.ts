import type { Reloj } from '@ncr/domain-core';
import { CopropiedadDesconocida } from './casos-de-uso';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Z3 (D-Z3) · ACTIVIDAD POR VIVIENDA — SÓLO LECTURA
 *
 * El superadministrador y el portero ven, por vivienda, cuántos vehículos hay
 * en visita activa y cuántos visitantes están «en este momento». Es un
 * recuento, no una decisión: no hay agregado, no hay invariante y nada se
 * escribe. Vive en la capa de aplicación por lo mismo que las demás lecturas
 * del tablero: el instante con que se juzga la vigencia es el del reloj
 * inyectado, y el criterio se DECLARA en la respuesta para que la pantalla lo
 * diga en vez de que cada consumidor lo reinterprete.
 *
 * «En este momento» con los datos que hay (P-41). Los eventos distinguen
 * `ingreso` de `salida`, así que un visitante está dentro si su último paso
 * permitido por la portería, dentro de la vigencia de su visita, fue un
 * ingreso y no una salida. Eso exige que los equipos REPORTEN la salida: donde
 * no lo hagan, el visitante «sigue dentro» hasta que vence su visita. Es una
 * aproximación declarada, igual que el «dentro ahora» del tablero; la decisión
 * de negocio queda abierta en P-41. El texto no lleva el código: la pantalla
 * lo enseña tal cual y ninguna pantalla muestra códigos del proyecto.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export const CRITERIO_DE_ACTIVIDAD =
  'Visitantes con autorización vigente en este instante cuyo último paso permitido por la ' +
  'portería, dentro de esa vigencia, fue un ingreso sin salida registrada después. Vehículos: ' +
  'los de esos visitantes cuya visita tiene placa o cuyo ingreso fue por placa. Si un equipo ' +
  'no reporta la salida, el visitante cuenta hasta que vence su visita.';

export interface ActividadDeVivienda {
  readonly viviendaId: string;
  readonly identificador: string;
  /** La torre, bloque o manzana de `viviendas.agrupacion`; `null` si no la hay. */
  readonly agrupacion: string | null;
  readonly vehiculosEnVisita: number;
  readonly visitantesAhora: number;
}

/**
 * Puerto de lectura. Devuelve TODAS las viviendas activas de la copropiedad —
 * también las que tienen cero— en UNA consulta, y `null` cuando la copropiedad
 * no existe o no está activa: la aplicación lo traduce a `CopropiedadDesconocida`
 * (404), que es lo mismo que responde una copropiedad ajena.
 */
export interface ActividadPorVivienda {
  consultar(copropiedadId: string, ahora: Date): Promise<readonly ActividadDeVivienda[] | null>;
}
export const ACTIVIDAD_POR_VIVIENDA = Symbol('ActividadPorVivienda');

export interface ActividadDeLaCopropiedad {
  readonly ahora: Date;
  readonly criterio: string;
  readonly filas: readonly ActividadDeVivienda[];
}

const porTexto = (a: string, b: string): number => a.localeCompare(b, 'es', { numeric: true });

/**
 * Más visitantes primero; a igualdad, más vehículos; a igualdad, por torre y
 * vivienda, con las viviendas sin agrupación al final. Pura: devuelve una copia.
 */
export const ordenarPorActividad = (
  filas: readonly ActividadDeVivienda[],
): readonly ActividadDeVivienda[] =>
  [...filas].sort(
    (a, b) =>
      b.visitantesAhora - a.visitantesAhora ||
      b.vehiculosEnVisita - a.vehiculosEnVisita ||
      Number(a.agrupacion === null) - Number(b.agrupacion === null) ||
      porTexto(a.agrupacion ?? '', b.agrupacion ?? '') ||
      porTexto(a.identificador, b.identificador),
  );

export class ConsultarActividadPorVivienda {
  constructor(
    private readonly puerto: ActividadPorVivienda,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(copropiedadId: string): Promise<ActividadDeLaCopropiedad> {
    const ahora = this.reloj.ahora();
    const filas = await this.puerto.consultar(copropiedadId, ahora);
    if (filas === null) throw new CopropiedadDesconocida(copropiedadId);
    return { ahora, criterio: CRITERIO_DE_ACTIVIDAD, filas: ordenarPorActividad(filas) };
  }
}
