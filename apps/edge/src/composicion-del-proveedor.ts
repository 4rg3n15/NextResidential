/**
 * DT-15R-09 · EL PROVEEDOR DE EQUIPOS DEL EDGE, COMPUESTO COMO EL DE LA API
 *
 * Un solo sitio para lo que `componerEdge` le pasa a la fábrica de `providers`.
 * Hasta la corrección de la 15-R se componía sin los ajustes del `.env` que la
 * API sí pasa (`apps/api/src/proveedores/proveedores.module.ts`): plazo de cada
 * petición, persona y foto del alta, puerto RTSP y, sobre todo, el umbral del
 * reloj, sin el cual el alta con vigencia no miraba la hora del equipo.
 *
 * Lo que NO pasa, a propósito: la `traza` (el registro del Edge no redacta ni
 * filtra por nivel, DT-15R-C01) y el transporte del audio, que el puente fija.
 */
import { crearProveedorDeEquipos } from '@ncr/providers';
import type { FuenteDePlacas, ProveedorDeEquipos, RegistroDeEquipos } from '@ncr/providers';
import type { Reloj } from '@ncr/domain-core';
import { ajustesDelProveedor } from './configuracion/esquema-de-ajustes';
import type { ConfiguracionDeAjustes } from './configuracion/esquema-de-ajustes';

export interface DependenciasDelProveedor {
  readonly reloj: Reloj;
  readonly registro: RegistroDeEquipos;
  readonly fuente: FuenteDePlacas;
  /** Hacia los equipos. En las pruebas, los simulados de `providers`. */
  readonly peticion?: typeof fetch;
  readonly audioDelEquipo?: 'persistente' | 'fetch';
}

export const proveedorDelEdge = (
  config: ConfiguracionDeAjustes,
  d: DependenciasDelProveedor,
): ProveedorDeEquipos =>
  crearProveedorDeEquipos({
    clase: 'hikvision', // kpi-11-exento: en sitio, los equipos reales; las pruebas inyectan `peticion`
    reloj: d.reloj,
    registro: d.registro,
    fuente: d.fuente,
    ...ajustesDelProveedor(config),
    ...(d.peticion === undefined ? {} : { peticion: d.peticion }),
    ...(d.audioDelEquipo === undefined ? {} : { audioDelEquipo: d.audioDelEquipo }),
  });
