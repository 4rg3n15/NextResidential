import { describe, expect, it } from 'vitest';
import { Alerta, esFallo } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import {
  AlertasDelCicloDelEquipo,
  NOTA_DE_RESOLUCION_AUTOMATICA,
} from './alertas-del-ciclo-del-equipo';
import { RepositorioAlertasEnMemoria } from '../infraestructura/repositorios-en-memoria';

const COP = '10000000-0000-4000-8000-000000000001';
const PORTERO = '90000000-0000-4000-8000-0000000000a1';
const CAMARA = '90000000-0000-4000-8000-0000000000a2';
const AHORA = new Date('2026-09-30T10:00:00Z');
const bitacora: Bitacora = { registrar: () => undefined };

const abrir = async (
  repo: RepositorioAlertasEnMemoria,
  id: string,
  dispositivoId: string,
  tipo: 'dispositivo_caido' | 'acceso_dudoso' = 'dispositivo_caido',
): Promise<void> => {
  const a = Alerta.abrir({
    id,
    copropiedadId: COP,
    tipo,
    severidad: 'alta',
    generadaEn: new Date('2026-09-28T10:00:00Z'),
    dispositivoId,
    notas: 'sin latido',
  });
  if (esFallo(a)) throw new Error(a.error.detalle);
  await repo.guardar(a.valor, 'x');
};

const montar = () => {
  const repo = new RepositorioAlertasEnMemoria();
  return { repo, ciclo: new AlertasDelCicloDelEquipo(repo, { ahora: () => AHORA }, bitacora) };
};

describe('A1 · la caída se resuelve sola cuando vuelve la señal', () => {
  it('resuelve las de caída de ESE equipo, con la nota y la hora', async () => {
    const { repo, ciclo } = montar();
    await abrir(repo, '00000000-0000-4000-8000-000000000001', PORTERO);
    await abrir(repo, '00000000-0000-4000-8000-000000000002', CAMARA);
    expect(await ciclo.resolverCaida(COP, PORTERO, 'latido', 'actor')).toBe(1);
    const resuelta = await repo.porId(COP, '00000000-0000-4000-8000-000000000001');
    expect(resuelta?.estado).toBe('resuelta');
    expect(resuelta?.resueltaEn).toEqual(AHORA);
    expect(resuelta?.notas).toContain(
      `[${NOTA_DE_RESOLUCION_AUTOMATICA}] el equipo volvió su latido`,
    );
    // La de la cámara sigue: su equipo no ha vuelto.
    expect((await repo.abiertasDe(COP)).map((a) => a.dispositivoId)).toEqual([CAMARA]);
  });

  it('no toca otras alertas del mismo equipo (una llamada sigue siendo una llamada)', async () => {
    const { repo, ciclo } = montar();
    await abrir(repo, '00000000-0000-4000-8000-000000000003', PORTERO, 'acceso_dudoso');
    expect(await ciclo.resolverCaida(COP, PORTERO, 'evento', 'actor')).toBe(0);
    expect(await repo.abiertasDe(COP)).toHaveLength(1);
  });

  it('un repositorio que falla no tumba el latido', async () => {
    const roto = {
      abiertasDe: async () => {
        throw new Error('base caída');
      },
    } as unknown as RepositorioAlertasEnMemoria;
    const ciclo = new AlertasDelCicloDelEquipo(roto, { ahora: () => AHORA }, bitacora);
    expect(await ciclo.resolverCaida(COP, PORTERO, 'sondeo', 'actor')).toBe(0);
  });
});

describe('A1 · la baja archiva las alertas abiertas del equipo, con motivo', () => {
  it('todas las abiertas de ese equipo, ninguna de otro', async () => {
    const { repo, ciclo } = montar();
    await abrir(repo, '00000000-0000-4000-8000-000000000004', PORTERO);
    await abrir(repo, '00000000-0000-4000-8000-000000000005', PORTERO, 'acceso_dudoso');
    await abrir(repo, '00000000-0000-4000-8000-000000000006', CAMARA);
    expect(await ciclo.archivarPorBaja(COP, PORTERO, 'equipo reemplazado', 'actor')).toBe(2);
    expect((await repo.abiertasDe(COP)).map((a) => a.dispositivoId)).toEqual([CAMARA]);
    expect(repo.archivoDe(COP, '00000000-0000-4000-8000-000000000004')?.motivo).toBe(
      'equipo dado de baja: equipo reemplazado',
    );
  });
});
