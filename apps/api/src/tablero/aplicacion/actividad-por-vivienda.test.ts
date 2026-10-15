import { describe, expect, it } from 'vitest';
import type { Reloj } from '@ncr/domain-core';
import {
  ConsultarActividadPorVivienda,
  CRITERIO_DE_ACTIVIDAD,
  ordenarPorActividad,
} from './actividad-por-vivienda';
import type { ActividadDeVivienda, ActividadPorVivienda } from './actividad-por-vivienda';
import { CopropiedadDesconocida } from './casos-de-uso';

/**
 * 15-Z3 (D-Z3) · la actividad por vivienda es una LECTURA con el instante
 * inyectado: «en este momento» es el reloj de la aplicación, no `now()` de la
 * base ni el del navegador, para que una vigencia que vence este minuto se
 * juzgue en un instante que la prueba controla.
 */
const COP = '11111111-1111-4111-8111-111111111111';
const relojEn = (iso: string): Reloj => ({ ahora: () => new Date(iso) });

const fila = (parte: Partial<ActividadDeVivienda>): ActividadDeVivienda => ({
  viviendaId: '30000000-0000-4000-8000-000000000001',
  identificador: '101',
  agrupacion: 'Torre 1',
  vehiculosEnVisita: 0,
  visitantesAhora: 0,
  ...parte,
});

class PuertoDoble implements ActividadPorVivienda {
  instantes: Date[] = [];
  filas: readonly ActividadDeVivienda[] | null = [];
  async consultar(_c: string, ahora: Date): Promise<readonly ActividadDeVivienda[] | null> {
    this.instantes.push(ahora);
    return this.filas;
  }
}

describe('ConsultarActividadPorVivienda', () => {
  it('consulta con el instante del reloj inyectado y lo declara en la respuesta, con el criterio', async () => {
    const puerto = new PuertoDoble();
    const r = await new ConsultarActividadPorVivienda(
      puerto,
      relojEn('2026-10-14T15:00:00Z'),
    ).ejecutar(COP);
    expect(puerto.instantes).toEqual([new Date('2026-10-14T15:00:00Z')]);
    expect(r.ahora.toISOString()).toBe('2026-10-14T15:00:00.000Z');
    expect(r.criterio).toBe(CRITERIO_DE_ACTIVIDAD);
    expect(r.filas).toEqual([]);
  });

  it('una copropiedad que el puerto no conoce es CopropiedadDesconocida, no una lista vacía', async () => {
    const puerto = new PuertoDoble();
    puerto.filas = null;
    await expect(
      new ConsultarActividadPorVivienda(puerto, relojEn('2026-10-14T15:00:00Z')).ejecutar(COP),
    ).rejects.toBeInstanceOf(CopropiedadDesconocida);
  });

  it('ordena por actividad: más visitantes primero, a igualdad más vehículos, y luego por vivienda', async () => {
    const puerto = new PuertoDoble();
    puerto.filas = [
      fila({ viviendaId: 'a', agrupacion: 'Torre 2', identificador: '201' }),
      fila({ viviendaId: 'b', agrupacion: 'Torre 1', identificador: '102', visitantesAhora: 2 }),
      fila({ viviendaId: 'c', agrupacion: 'Torre 1', identificador: '101' }),
      fila({
        viviendaId: 'd',
        agrupacion: 'Torre 3',
        identificador: '301',
        visitantesAhora: 2,
        vehiculosEnVisita: 1,
      }),
    ];
    const r = await new ConsultarActividadPorVivienda(
      puerto,
      relojEn('2026-10-14T15:00:00Z'),
    ).ejecutar(COP);
    expect(r.filas.map((f) => f.viviendaId)).toEqual(['d', 'b', 'c', 'a']);
  });
});

describe('ordenarPorActividad', () => {
  it('es pura: no muta la entrada y la vivienda sin agrupación va después de las agrupadas', () => {
    const entrada = [
      fila({ viviendaId: 'x', agrupacion: null, identificador: '1' }),
      fila({ viviendaId: 'y', agrupacion: 'Torre 1', identificador: '9' }),
    ];
    const copia = [...entrada];
    expect(ordenarPorActividad(entrada).map((f) => f.viviendaId)).toEqual(['y', 'x']);
    expect(entrada).toEqual(copia);
  });
});
