import { Global, Module } from '@nestjs/common';
import { ModuleRef, NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import type { EscuchaActiva } from '@ncr/providers';
import { CierreDelPool } from '../persistencia/pool.module';
import { VigilarLatidos } from '../eventos';
import { ReiniciarAforosVencidos } from '../zonas';
import { BarrerPlantillasVencidas } from '../biometria';
import { CATALOGO_DE_COPROPIEDADES, CicloDelPlanificador, PLANIFICADOR } from '../planificacion';
import type { Planificador } from '../planificacion';
import { EscuchasDeEquipos } from './aplicacion/escuchas-de-equipos';
import { LatidosDeEquipos } from './aplicacion/latidos-de-equipos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * OTROS FALLOS (15-M) · AL APAGAR, NADIE USA EL POOL DESPUÉS DE CERRARLO
 *
 * Nest llama a `onApplicationShutdown` en el MISMO orden que al arrancar: los
 * módulos más profundos primero, y el del pool es de los más profundos. Con
 * las escuchas, los latidos y el planificador parando ahí, el pool podía
 * cerrarse con ellos todavía vivos: consultas contra un pool terminado y un
 * apagado que no acababa. Ahora paran en `beforeApplicationShutdown`, que
 * corre para todos antes que cualquier `onApplicationShutdown`.
 *
 * La prueba monta el contenedor REAL de Nest con el pool dos niveles por
 * debajo —como en `AppModule`— y compara el orden de las llamadas.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const primeraLlamada = (f: { mock: { invocationCallOrder: number[] } }): number => {
  const orden = f.mock.invocationCallOrder[0];
  if (orden === undefined) throw new Error('no se llamó');
  return orden;
};

const montarYApagar = async () => {
  const finDelPool = vi.fn(async () => undefined);
  const detenerEscucha = vi.fn();
  const detenerPlanificador = vi.fn(async () => undefined);
  const apagarLatidos = vi.spyOn(LatidosDeEquipos.prototype, 'beforeApplicationShutdown');
  const bitacora: Bitacora = { registrar: () => undefined };
  const reloj: Reloj = { ahora: () => new Date('2026-09-29T12:00:00Z') };
  const equipos = {
    activos: async () => [{ dispositivoId: 'd-1', copropiedadId: 'c-1', nombre: 'Terminal' }],
  };
  const planificador: Planificador = {
    programar: () => undefined,
    arrancar: async () => undefined,
    detener: detenerPlanificador,
    programados: [],
    estado: () => ({ fase: 'inerte' }),
  };

  @Global()
  @Module({
    providers: [
      { provide: Pool, useValue: { end: finDelPool } },
      { provide: BITACORA, useValue: bitacora },
      CierreDelPool,
    ],
    exports: [Pool, BITACORA],
  })
  class ModuloDelPool {}

  @Module({
    imports: [ModuloDelPool],
    providers: [
      {
        provide: EscuchasDeEquipos,
        useFactory: () =>
          new EscuchasDeEquipos(
            equipos,
            {
              escuchar: async (id: string): Promise<EscuchaActiva> => ({
                dispositivoId: id,
                transporte: 'suscripcion',
                detalle: 'ok',
                detener: detenerEscucha,
              }),
            },
            bitacora,
            { habilitadas: true, intervaloMs: 60_000 },
          ),
      },
      {
        provide: LatidosDeEquipos,
        useFactory: () =>
          new LatidosDeEquipos(
            { activos: async () => [] },
            { estado: async () => ({ estado: 'en_linea' }) as never },
            { ultimaSenal: () => null },
            { registrarLatido: async () => undefined },
            reloj,
            bitacora,
            { intervaloMs: 60_000 },
          ),
      },
      { provide: PLANIFICADOR, useValue: planificador },
      { provide: CATALOGO_DE_COPROPIEDADES, useValue: { activas: async () => [] } },
      { provide: VigilarLatidos, useValue: {} },
      { provide: ReiniciarAforosVencidos, useValue: {} },
      { provide: BarrerPlantillasVencidas, useValue: {} },
      {
        provide: CicloDelPlanificador,
        inject: [PLANIFICADOR, CATALOGO_DE_COPROPIEDADES, BITACORA, ModuleRef],
        useFactory: (p: Planificador, c: never, b: Bitacora, r: ModuleRef) =>
          new CicloDelPlanificador(p, c, b, r),
      },
    ],
  })
  class ModuloDeEquipos {}

  @Module({ imports: [ModuloDeEquipos] })
  class Raiz {}

  const app = await NestFactory.createApplicationContext(Raiz, {
    logger: false,
    abortOnError: false,
  });
  await app.close();
  // Se lee ANTES de restaurar: `mockRestore` borra también las llamadas.
  const orden = {
    pool: primeraLlamada(finDelPool),
    escucha: primeraLlamada(detenerEscucha),
    latidos: primeraLlamada(apagarLatidos),
    planificador: primeraLlamada(detenerPlanificador),
    vecesPool: finDelPool.mock.calls.length,
  };
  apagarLatidos.mockRestore();
  return orden;
};

describe('orden de apagado frente al pool (otros fallos, 15-M)', () => {
  it('escuchas, latidos y planificador paran ANTES de que se cierre el pool', async () => {
    const orden = await montarYApagar();

    expect(orden.vecesPool).toBe(1);
    expect(orden.escucha).toBeLessThan(orden.pool);
    expect(orden.latidos).toBeLessThan(orden.pool);
    expect(orden.planificador).toBeLessThan(orden.pool);
  });
});
