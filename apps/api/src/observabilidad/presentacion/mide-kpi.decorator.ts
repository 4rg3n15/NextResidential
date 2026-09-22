import { SetMetadata } from '@nestjs/common';
import type { ClaveKpi } from '../aplicacion/kpis';

export const CLAVE_KPI = 'ncr:kpi';

/**
 * Marca una ruta como el tramo que sustenta un KPI de latencia.
 *
 * **Declarativo y no disperso**, por la misma razón que el RBAC de §2.7.8 es un
 * guard y no un `if (rol === 'admin')` repartido: un cronómetro puesto a mano
 * dentro de un caso de uso obliga a tocar su constructor, sus pruebas y su
 * firma, y al tercer sitio alguien mide desde otro punto. Aquí la ruta declara
 * QUÉ indicador sustenta, y un único interceptor pone el cronómetro siempre en
 * el mismo sitio.
 *
 * Lo que esto mide es el tramo del servidor. `KPIS[clave].segmento` y
 * `noIncluye` dicen exactamente cuál y qué queda fuera; el tablero los muestra
 * junto a la cifra para que no puedan leerse por separado.
 */
export const MideKpi = (clave: ClaveKpi) => SetMetadata(CLAVE_KPI, clave);
