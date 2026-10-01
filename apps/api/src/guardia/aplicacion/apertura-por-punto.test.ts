import { describe, expect, it } from 'vitest';
import { ordenAceptada } from '@ncr/domain-core';
import { AccionarPuertaAMano } from './apertura-manual';
import type { AccionadorDePuerta, BitacoraDeOrdenes, OrdenEjecutada } from './apertura-manual';
import type { PuntosDelEquipo } from './puntos-del-equipo';
import type { ContextoTenant } from '../../autenticacion';

/**
 * 15-P · P3/P5 · la orden manual por PUNTO DE ACCESO. Lo que se mira, como en
 * `apertura-manual.test.ts`, es el accionador: qué puerta recibe y cuándo no
 * recibe nada.
 */
const COP = 'cop-a';
const ctx = {
  rol: 'operador_central',
  usuarioId: 'op-1',
  copropiedadId: COP,
  copropiedadesAtendidas: [COP],
  mfaVerificado: true,
} as unknown as ContextoTenant;
const PUNTO = { id: 'p-2', nombre: 'Cerradura 2', numeroDePuerta: 2 };

const banco = () => {
  const accionadas: unknown[][] = [];
  const registradas: OrdenEjecutada[] = [];
  const accionador: AccionadorDePuerta = {
    accionar: async (...args) => {
      accionadas.push(args);
      return ordenAceptada(15);
    },
  };
  const bitacora: BitacoraDeOrdenes = {
    registrar: async (o) => void registradas.push(o),
    anotarResultado: async () => undefined,
    ultimas: async () => registradas,
  };
  const pedidos: unknown[][] = [];
  const puntos: PuntosDelEquipo = {
    resolver: async (...args) => {
      pedidos.push(args);
      return args[3] === PUNTO.id ? PUNTO : null;
    },
  };
  const caso = new AccionarPuertaAMano(
    accionador,
    bitacora,
    { ahora: () => new Date('2026-10-01T12:00:00Z') },
    { nuevo: () => 'orden-1' },
    undefined,
    puntos,
  );
  return { caso, accionadas, registradas, pedidos };
};

const orden = (extra: Record<string, unknown> = {}) => ({
  copropiedadId: COP,
  dispositivoId: 'vp-1',
  accion: 'abrir' as const,
  motivo: 'Visitante anunciado por el residente',
  ...extra,
});

describe('AccionarPuertaAMano · por punto de acceso', () => {
  it('con punto: la puerta del punto llega al accionador y queda en el rastro', async () => {
    const b = banco();
    const r = await b.caso.ejecutar(ctx, orden({ puntoId: PUNTO.id }));
    expect(r.ok && r.valor.punto).toEqual(PUNTO);
    expect(b.accionadas).toEqual([['vp-1', true, 'op-1', 2]]);
    expect(b.registradas[0]?.punto).toEqual(PUNTO);
    expect(b.pedidos).toEqual([[ctx, COP, 'vp-1', PUNTO.id]]);
  });

  it('un punto que no es de este equipo: 404 de dominio, NI rastro NI relé', async () => {
    const b = banco();
    const r = await b.caso.ejecutar(ctx, orden({ puntoId: 'p-de-otro' }));
    expect(r.ok ? null : r.error.codigo).toBe('ENTIDAD_NO_ENCONTRADA');
    expect(b.accionadas).toEqual([]);
    expect(b.registradas).toEqual([]);
  });

  it('el motivo sigue mandando ANTES que el punto: sin motivo ni se resuelve (RN-08)', async () => {
    const b = banco();
    const r = await b.caso.ejecutar(ctx, orden({ puntoId: PUNTO.id, motivo: 'corto' }));
    expect(r.ok).toBe(false);
    expect(b.pedidos).toEqual([]);
    expect(b.accionadas).toEqual([]);
  });

  it('R1 · sin punto: tres argumentos, la puerta de la ficha, como siempre', async () => {
    const b = banco();
    const r = await b.caso.ejecutar(ctx, orden());
    expect(r.ok && 'punto' in r.valor).toBe(false);
    expect(b.accionadas).toEqual([['vp-1', true, 'op-1']]);
  });

  it('negar en un punto: queda el punto en el rastro y no se acciona nada', async () => {
    const b = banco();
    const r = await b.caso.ejecutar(ctx, orden({ puntoId: PUNTO.id, accion: 'negar' }));
    expect(r.ok && r.valor.punto?.nombre).toBe('Cerradura 2');
    expect(b.accionadas).toEqual([]);
  });

  it('sin puerto de puntos (por omisión), cualquier punto se niega', async () => {
    const accionadas: unknown[] = [];
    const caso = new AccionarPuertaAMano(
      { accionar: async (...a) => (accionadas.push(a), ordenAceptada(1)) },
      {
        registrar: async () => undefined,
        anotarResultado: async () => undefined,
        ultimas: async () => [],
      },
      { ahora: () => new Date() },
      { nuevo: () => 'x' },
    );
    const r = await caso.ejecutar(ctx, orden({ puntoId: PUNTO.id }));
    expect(r.ok).toBe(false);
    expect(accionadas).toEqual([]);
  });
});
