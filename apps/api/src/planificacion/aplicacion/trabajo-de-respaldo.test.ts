import { describe, expect, it } from 'vitest';
import { CatalogoDeCopropiedadesEnMemoria } from '../infraestructura/catalogo-copropiedades-pg';
import {
  HORARIO_DEL_RESPALDO,
  NOMBRE_DEL_RESPALDO,
  ZONA_DEL_TRABAJO_DE_RESPALDO,
  trabajoDeRespaldoDiario,
} from './trabajo-de-respaldo';

/** D-147 · el trabajo corre a las 00:15 de BOGOTÁ, por copropiedad, con el actor del planificador. */
describe('trabajoDeRespaldoDiario', () => {
  const parte = {
    generados: 1,
    fallidosAlGenerar: 0,
    enviados: 2,
    fallidosAlEnviar: 0,
    sinConfigurar: 0,
  };

  it('a las 00:15 en la zona de Bogotá, no en UTC', () => {
    const t = trabajoDeRespaldoDiario(
      { ejecutar: async () => parte },
      'actor',
      new CatalogoDeCopropiedadesEnMemoria([]),
      { registrar: () => undefined },
    );
    expect([t.nombre, t.cron, t.zonaHoraria]).toEqual([
      NOMBRE_DEL_RESPALDO,
      HORARIO_DEL_RESPALDO,
      ZONA_DEL_TRABAJO_DE_RESPALDO,
    ]);
    expect(t.cron).toBe('15 0 * * *');
    expect(t.zonaHoraria).toBe('America/Bogota');
  });

  it('recorre las copropiedades activas con el actor dado y suma los partes', async () => {
    const llamadas: [string, string][] = [];
    const t = trabajoDeRespaldoDiario(
      {
        ejecutar: async (cop, actor) => {
          llamadas.push([cop, actor]);
          return parte;
        },
      },
      'actor-del-planificador',
      new CatalogoDeCopropiedadesEnMemoria(['cop-a', 'cop-b']),
      { registrar: () => undefined },
    );
    expect(await t.ejecutar()).toEqual({
      copropiedades: 2,
      fallidas: 0,
      generados: 2,
      fallidosAlGenerar: 0,
      enviados: 4,
      fallidosAlEnviar: 0,
      sinConfigurar: 0,
    });
    expect(llamadas).toEqual([
      ['cop-a', 'actor-del-planificador'],
      ['cop-b', 'actor-del-planificador'],
    ]);
  });
});
