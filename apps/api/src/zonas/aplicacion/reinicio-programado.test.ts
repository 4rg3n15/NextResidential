import { describe, expect, it } from 'vitest';
import { FranjaHoraria, HorarioDeZona } from '@ncr/domain-core';
import type { Reloj, Zona } from '@ncr/domain-core';
import { ReiniciarAforosVencidos } from './casos-de-uso';
import type { RepositorioZonas, ResultadoOcupacion } from './puertos';

/**
 * D-36 · el reinicio que nadie persistía.
 *
 * Lo que se comprueba no es que el dominio sepa decidir —eso ya lo prueba
 * `politica-reinicio.test.ts`— sino que el barrido ESCRIBE: una zona que nadie
 * toca conservaba su conteo antiguo indefinidamente porque el reinicio solo se
 * persistía al ocupar.
 */
const reloj = (iso: string): Reloj => ({ ahora: () => new Date(iso) });

interface ZonaFalsa {
  readonly id: string;
  readonly politicaReinicio: 'cierre_horario' | 'manual' | 'nunca';
  readonly horario: Zona['horario'];
  readonly ultimoReinicio: Date | null;
}

const repositorio = (zonas: readonly ZonaFalsa[]) => {
  const reinicios: { zonaId: string; ahora: Date }[] = [];
  const repo: RepositorioZonas = {
    porId: async () => null,
    listar: async () => zonas as unknown as readonly Zona[],
    guardar: async () => undefined,
    ocupar: async () => ({ tipo: 'fallo' }) as ResultadoOcupacion,
    liberar: async () => 0,
    reiniciar: async (_c, zonaId, ahora) => void reinicios.push({ zonaId, ahora }),
  };
  return { repo, reinicios };
};

/**
 * Jornada 06:00–22:00 todos los días, con el desplazamiento de Bogotá (−300).
 * Se construye con las fábricas del dominio y no con un objeto plano: un
 * literal moldeado a la fuerza pasaría por el tipo y reventaría al primer
 * método, que es exactamente lo que pasó al escribir esta prueba.
 */
const exigir = <T>(r: { ok: boolean; valor?: T }): T => {
  if (!r.ok || r.valor === undefined) throw new Error('el horario de la prueba no es válido');
  return r.valor;
};
const horarioDiario = exigir(
  HorarioDeZona.crear(
    [0, 1, 2, 3, 4, 5, 6].map((dia) =>
      exigir(FranjaHoraria.crear({ dia, minutoInicio: 6 * 60, minutoFin: 22 * 60 })),
    ),
    -300,
  ),
);

describe('ReiniciarAforosVencidos', () => {
  it('persiste el reinicio de la zona que NADIE tocó desde el cierre', async () => {
    const { repo, reinicios } = repositorio([
      {
        id: 'gimnasio',
        politicaReinicio: 'cierre_horario',
        horario: horarioDiario,
        // Se reinició hace tres días: han pasado tres cierres de jornada.
        ultimoReinicio: new Date('2026-09-19T12:00:00Z'),
      },
    ]);
    const parte = await new ReiniciarAforosVencidos(repo, reloj('2026-09-22T12:00:00Z')).ejecutar(
      'cop-a',
    );
    expect(parte).toEqual({ zonas: 1, reiniciadas: 1 });
    expect(reinicios).toHaveLength(1);
    expect(reinicios[0]!.zonaId).toBe('gimnasio');
  });

  it('es IDEMPOTENTE: la segunda pasada no vuelve a escribir', async () => {
    // Es la propiedad que permite que pg-boss reintente sin consecuencias.
    const { repo, reinicios } = repositorio([
      {
        id: 'gimnasio',
        politicaReinicio: 'cierre_horario',
        horario: horarioDiario,
        ultimoReinicio: new Date('2026-09-22T11:00:00Z'), // ya reiniciada hoy
      },
    ]);
    const parte = await new ReiniciarAforosVencidos(repo, reloj('2026-09-22T12:00:00Z')).ejecutar(
      'cop-a',
    );
    expect(parte).toEqual({ zonas: 1, reiniciadas: 0 });
    expect(reinicios).toHaveLength(0);
  });

  it('no toca las zonas de política `manual` ni `nunca`: la decisión es del dominio', async () => {
    const { repo, reinicios } = repositorio([
      {
        id: 'salon',
        politicaReinicio: 'manual',
        horario: horarioDiario,
        ultimoReinicio: new Date('2026-09-19T12:00:00Z'),
      },
      {
        id: 'piscina',
        politicaReinicio: 'nunca',
        horario: horarioDiario,
        ultimoReinicio: null,
      },
    ]);
    const parte = await new ReiniciarAforosVencidos(repo, reloj('2026-09-22T12:00:00Z')).ejecutar(
      'cop-a',
    );
    expect(parte).toEqual({ zonas: 2, reiniciadas: 0 });
    expect(reinicios).toEqual([]);
  });

  it('sin zonas, el parte lo dice en cifras', async () => {
    const { repo } = repositorio([]);
    expect(
      await new ReiniciarAforosVencidos(repo, reloj('2026-09-22T12:00:00Z')).ejecutar('cop-a'),
    ).toEqual({ zonas: 0, reiniciadas: 0 });
  });
});
