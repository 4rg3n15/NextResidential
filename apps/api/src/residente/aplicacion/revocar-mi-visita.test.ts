import { describe, expect, it, vi } from 'vitest';
import { errorDominio, exito, fallo } from '@ncr/domain-core';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import type { RevocarAutorizacion } from '../../autorizaciones';
import type { SuprimirRostroDeAutorizacion } from '../../biometria';
import type { ContextoTenant } from '../../autenticacion';
import type { ResolverMiAmbito } from './casos-de-uso';
import type { BitacoraDeResidentes, HechoDeResidente } from './puertos-hogar';
import { RevocarMiVisita } from './revocar-mi-visita';
import type { SituacionDeMiVisita, VisitasDeMiVivienda } from './revocar-mi-visita';

/**
 * 15-W · D6 · revocar una visita propia SIN base: el motivo saneado y
 * obligatorio, la visita de OTRA vivienda como inexistente, la ya revocada o
 * vencida como conflicto, y el rostro fuera de los equipos en la misma llamada.
 * Contra PostgreSQL y una terminal simulada: `mis-visitas-revocacion.e2e`.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-10-06T15:00:00Z');
const ctx: ContextoTenant = {
  usuarioId: 'u-residente',
  rol: 'residente',
  copropiedadId: COP,
  copropiedadesAtendidas: [COP],
  mfaVerificado: false,
};
const como = <T>(o: object): T => o as unknown as T;

const montar = (situacion: SituacionDeMiVisita | null = 'VIGENTE') => {
  const hechos: HechoDeResidente[] = [];
  const resolver = {
    ejecutar: vi.fn(
      async (): Promise<Resultado<object, ErrorDominio>> =>
        exito({ ambito: { copropiedadId: COP, viviendaId: 'v-1' }, vinculo: {} }),
    ),
  };
  const visitas = { situacion: vi.fn(async () => situacion) };
  const revocar = {
    ejecutar: vi.fn(async (): Promise<Resultado<undefined, ErrorDominio>> => exito(undefined)),
  };
  const rostro = {
    ejecutar: vi.fn(
      async (): Promise<
        Resultado<
          { suprimidas: number; retiradas: number; retiradasPendientes: number },
          ErrorDominio
        >
      > => exito({ suprimidas: 1, retiradas: 2, retiradasPendientes: 0 }),
    ),
  };
  const caso = new RevocarMiVisita(
    como<ResolverMiAmbito>(resolver),
    como<VisitasDeMiVivienda>(visitas),
    como<RevocarAutorizacion>(revocar),
    como<SuprimirRostroDeAutorizacion>(rostro),
    como<BitacoraDeResidentes>({ anotar: async (h: HechoDeResidente) => void hechos.push(h) }),
    { ahora: () => AHORA },
  );
  return { caso, resolver, visitas, revocar, rostro, hechos };
};

describe('RevocarMiVisita (15-W, D6)', () => {
  it('revoca con el motivo saneado, suprime el rostro en el acto y lo anota', async () => {
    const { caso, revocar, rostro, hechos, visitas } = montar();
    const r = await caso.ejecutar(ctx, COP, 'a-1', '  Se canceló\u0000 la visita\u0007 ');
    expect(r).toEqual({
      ok: true,
      valor: { rostrosSuprimidos: 1, equiposRetirados: 2, equiposPendientes: 0 },
    });
    expect(visitas.situacion).toHaveBeenCalledWith(COP, 'v-1', 'a-1', AHORA);
    expect(revocar.ejecutar).toHaveBeenCalledWith(ctx, 'a-1', 'Se canceló la visita');
    expect(rostro.ejecutar).toHaveBeenCalledWith(ctx, 'a-1');
    expect(hechos).toEqual([
      expect.objectContaining({
        tipo: 'visita_revocada_por_residente',
        viviendaId: 'v-1',
        detalle: 'autorización a-1 · Se canceló la visita',
      }),
    ]);
  });

  it('sin motivo —o sólo con espacios y controles— no se mira ni la vivienda', async () => {
    const { caso, resolver } = montar();
    const r = await caso.ejecutar(ctx, COP, 'a-1', ' \u0000\t ');
    expect(r.ok === false && r.error.codigo).toBe('DATO_INVALIDO');
    expect(resolver.ejecutar).not.toHaveBeenCalled();
  });

  it('la de otra vivienda no existe; la revocada o vencida, conflicto; nada se revoca', async () => {
    const casos = [
      [null, 'ENTIDAD_NO_ENCONTRADA', 'Visita no encontrada'],
      ['REVOCADA', 'CONFLICTO_DE_CONCURRENCIA', 'La visita ya está revocada'],
      ['VENCIDA', 'CONFLICTO_DE_CONCURRENCIA', 'La visita ya venció'],
    ] as const;
    for (const [situacion, codigo, detalle] of casos) {
      const { caso, revocar } = montar(situacion);
      const r = await caso.ejecutar(ctx, COP, 'a-1', 'Motivo');
      expect(r.ok === false && [r.error.codigo, r.error.detalle], String(situacion)).toEqual([
        codigo,
        detalle,
      ]);
      expect(revocar.ejecutar).not.toHaveBeenCalled();
    }
  });

  it('si la revocación falla, el rostro no se toca; si falla la supresión, la revocación vale igual', async () => {
    const roto = montar();
    roto.revocar.ejecutar.mockResolvedValueOnce(
      fallo(errorDominio('OPERACION_NO_PERMITIDA', 'No')),
    );
    expect((await roto.caso.ejecutar(ctx, COP, 'a-1', 'Motivo')).ok).toBe(false);
    expect(roto.rostro.ejecutar).not.toHaveBeenCalled();
    const sinRostro = montar();
    sinRostro.rostro.ejecutar.mockResolvedValueOnce(
      fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'Sin rostro')),
    );
    expect(await sinRostro.caso.ejecutar(ctx, COP, 'a-1', 'Motivo')).toEqual({
      ok: true,
      valor: { rostrosSuprimidos: 0, equiposRetirados: 0, equiposPendientes: 0 },
    });
  });

  it('sin ámbito de vivienda, el error del ámbito', async () => {
    const { caso, resolver, visitas } = montar();
    resolver.ejecutar.mockResolvedValueOnce(
      fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'Sin vivienda')),
    );
    expect((await caso.ejecutar(ctx, COP, 'a-1', 'Motivo')).ok).toBe(false);
    expect(visitas.situacion).not.toHaveBeenCalled();
  });
});
