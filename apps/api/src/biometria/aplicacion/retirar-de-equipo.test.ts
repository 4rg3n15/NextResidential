import { describe, expect, it } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { RetirarPlantillasDeEquipo } from './retirar-de-equipo';
import type { BovedaDePlantillas, DestinoDePlantilla, RepositorioPlantillas } from './puertos';

/**
 * C4 (15-M) · la baja de un equipo retira de él sus rostros (RN-11); lo que el
 * equipo no quita se cuenta PENDIENTE y sigue constando como sincronizado.
 */
const COP = 'cop-1';
const CTX = { usuarioId: 'admin-1' } as ContextoTenant;

const montar = (fallaEn: ReadonlySet<string> = new Set()) => {
  const sincronizadas: DestinoDePlantilla[] = [
    { copropiedadId: COP, plantillaId: 'p1', dispositivoId: 'term-1' },
    { copropiedadId: COP, plantillaId: 'p2', dispositivoId: 'term-1' },
    { copropiedadId: COP, plantillaId: 'p3', dispositivoId: 'term-1' },
  ];
  const retiradas: string[] = [];
  const avisos: string[] = [];
  const plantillas = {
    sincronizadasEn: async (c: string, d: string) =>
      sincronizadas.filter((s) => s.copropiedadId === c && s.dispositivoId === d),
    registrarRetirada: async (destino: DestinoDePlantilla) => {
      retiradas.push(destino.plantillaId);
    },
  } as unknown as RepositorioPlantillas;
  const boveda = {
    retirarDeTerminal: async (plantillaId: string) => {
      if (fallaEn.has(plantillaId)) throw new Error('el equipo no contestó');
    },
  } as unknown as BovedaDePlantillas;
  const bitacora: Bitacora = { registrar: (_n, mensaje) => avisos.push(mensaje) };
  return { caso: new RetirarPlantillasDeEquipo(plantillas, boveda, bitacora), retiradas, avisos };
};

describe('RetirarPlantillasDeEquipo · C4 (15-M), RN-11 en la baja de un equipo', () => {
  it('retira TODAS las del equipo y las registra como retiradas', async () => {
    const m = montar();
    const r = await m.caso.ejecutar(CTX, COP, 'term-1');
    expect(r).toEqual({ retiradas: 3, pendientes: 0 });
    expect(m.retiradas).toEqual(['p1', 'p2', 'p3']);
  });

  it('lo que el equipo no quita queda PENDIENTE, se avisa y NO se da por retirado', async () => {
    const m = montar(new Set(['p2']));
    const r = await m.caso.ejecutar(CTX, COP, 'term-1');
    expect(r).toEqual({ retiradas: 2, pendientes: 1 });
    expect(m.retiradas).toEqual(['p1', 'p3']);
    expect(m.avisos.some((a) => /no se pudo retirar/.test(a))).toBe(true);
  });

  it('otro equipo u otra copropiedad: nada que retirar', async () => {
    const m = montar();
    expect(await m.caso.ejecutar(CTX, COP, 'otro')).toEqual({ retiradas: 0, pendientes: 0 });
    expect(await m.caso.ejecutar(CTX, 'cop-2', 'term-1')).toEqual({ retiradas: 0, pendientes: 0 });
  });
});
