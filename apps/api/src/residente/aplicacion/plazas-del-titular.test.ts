import { describe, expect, it, vi } from 'vitest';
import { exito } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { ResolverMiAmbito } from './casos-de-uso';
import { PlazasDeMiVivienda, TopeDePlazasDeVivienda } from './plazas-del-titular';
import type {
  CupoDePlazas,
  PlazasDelTitular,
  PlazaRetiradaPorElTitular,
} from './puertos-de-plazas';
import type { BitacoraDeResidentes, HechoDeResidente } from './puertos-hogar';

/**
 * 15-W · D4 bis · las plazas del titular SIN base: quién puede, cuándo se
 * llegó al tope (el dominio lo dice antes; la base, al final) y qué queda en
 * la bitácora. Contra PostgreSQL, y bajo concurrencia: `plazas-del-titular-pg`.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-10-06T15:00:00Z');
const ctx: ContextoTenant = {
  usuarioId: 'u-titular',
  rol: 'residente',
  copropiedadId: COP,
  copropiedadesAtendidas: [COP],
  mfaVerificado: false,
};
const como = <T>(o: object): T => o as unknown as T;

const montar = (cupo: Partial<CupoDePlazas> = {}) => {
  const hechos: HechoDeResidente[] = [];
  const plazas = {
    cupo: vi.fn(async () => ({ activas: 2, tope: 4, esTitular: true, topePropio: false, ...cupo })),
    anadir: vi.fn(async (): Promise<'ANADIDA' | 'TOPE_ALCANZADO'> => 'ANADIDA'),
    retirar: vi.fn(async (): Promise<PlazaRetiradaPorElTitular> => 'RETIRADA'),
    cambiarTope: vi.fn(
      async (): Promise<'CAMBIADO' | 'NO_ENCONTRADA' | 'BAJO_LAS_PLAZAS'> => 'CAMBIADO',
    ),
  };
  const bitacora: BitacoraDeResidentes = como({
    anotar: async (h: HechoDeResidente) => void hechos.push(h),
  });
  const resolver = {
    ejecutar: vi.fn(async () =>
      exito({ ambito: { copropiedadId: COP, viviendaId: 'v-1' }, vinculo: {} }),
    ),
  };
  const reloj = { ahora: () => AHORA };
  return {
    mias: new PlazasDeMiVivienda(
      como<ResolverMiAmbito>(resolver),
      como<PlazasDelTitular>(plazas),
      bitacora,
      reloj,
    ),
    tope: new TopeDePlazasDeVivienda(como<PlazasDelTitular>(plazas), bitacora, reloj),
    plazas,
    hechos,
  };
};

describe('PlazasDeMiVivienda (15-W, D4 bis)', () => {
  it('sólo el titular añade y retira: cualquier otro adulto, 403 sin tocar la base', async () => {
    const { mias, plazas } = montar({ esTitular: false });
    const anadir = await mias.anadir(ctx, COP);
    const retirar = await mias.retirar(ctx, COP, 'p-3', 'Ya no vive');
    for (const r of [anadir, retirar]) expect(r.ok && !r.valor.hecho && r.valor.estado).toBe(403);
    expect(plazas.anadir).not.toHaveBeenCalled();
    expect(plazas.retirar).not.toHaveBeenCalled();
  });

  it('en el tope, 409 con la explicación de SU tope, antes de ir a la base', async () => {
    const { mias, plazas } = montar({ activas: 6, tope: 6, topePropio: true });
    const r = await mias.anadir(ctx, COP);
    expect(r).toEqual({
      ok: true,
      valor: {
        hecho: false,
        estado: 409,
        explicacion:
          'Su vivienda tiene el máximo de 6 plazas. Para más, pídalo a la administración.',
      },
    });
    expect(plazas.anadir).not.toHaveBeenCalled();
  });

  it('si la base dice que no (otra alta llegó antes), el mismo 409; si dice que sí, queda anotado', async () => {
    const { mias, plazas, hechos } = montar({ activas: 3 });
    plazas.anadir.mockResolvedValueOnce('TOPE_ALCANZADO');
    const negada = await mias.anadir(ctx, COP);
    expect(negada.ok && !negada.valor.hecho && negada.valor.estado).toBe(409);
    expect(hechos).toEqual([]);
    expect(await mias.anadir(ctx, COP)).toEqual({ ok: true, valor: { hecho: true } });
    expect(hechos).toEqual([
      expect.objectContaining({ tipo: 'plaza_anadida', actorId: 'u-titular', viviendaId: 'v-1' }),
    ]);
  });

  it('retirar: cada «no» con su estado, y el motivo en la bitácora cuando se retira', async () => {
    for (const [respuesta, estado] of [
      ['NO_ENCONTRADA', 404],
      ['OCUPADA', 409],
      ['ES_LA_DEL_TITULAR', 409],
    ] as const) {
      const { mias, plazas, hechos } = montar();
      plazas.retirar.mockResolvedValueOnce(respuesta);
      const r = await mias.retirar(ctx, COP, 'p-1', 'Motivo cualquiera');
      expect(r.ok && !r.valor.hecho && r.valor.estado, respuesta).toBe(estado);
      expect(hechos).toEqual([]);
    }
    const { mias, hechos } = montar();
    expect(await mias.retirar(ctx, COP, 'p-3', 'Ya no vive aquí')).toEqual({
      ok: true,
      valor: { hecho: true },
    });
    expect(hechos).toEqual([
      expect.objectContaining({ tipo: 'plaza_retirada', detalle: 'Ya no vive aquí' }),
    ]);
  });
});

describe('TopeDePlazasDeVivienda (15-W, D4 bis)', () => {
  it('cambiado: queda en la bitácora con el tope y el motivo; si no, no deja rastro', async () => {
    const { tope, plazas, hechos } = montar();
    expect(await tope.cambiar(ctx, COP, 'v-1', { tope: 6, motivo: 'Familia numerosa' })).toBe(
      'CAMBIADO',
    );
    expect(await tope.cambiar(ctx, COP, 'v-1', { tope: null, motivo: 'Vuelve al general' })).toBe(
      'CAMBIADO',
    );
    expect(hechos.map((h) => h.detalle)).toEqual([
      'tope 6 · Familia numerosa',
      'tope de la copropiedad · Vuelve al general',
    ]);
    plazas.cambiarTope.mockResolvedValueOnce('BAJO_LAS_PLAZAS');
    expect(await tope.cambiar(ctx, COP, 'v-1', { tope: 2, motivo: 'Demasiado bajo' })).toBe(
      'BAJO_LAS_PLAZAS',
    );
    expect(hechos).toHaveLength(2);
    expect(await tope.cupo(COP, 'v-1', 'u-super')).toMatchObject({ tope: 4, activas: 2 });
  });
});
