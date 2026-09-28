import { describe, expect, it } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import { ordenAceptada, ordenInalcanzable, ordenRechazada } from '@ncr/domain-core';
import type { ResultadoDeAccionamiento } from '@ncr/domain-core';
import type { EventoDeEquipoNuevo } from '../../eventos';
import type { ContextoTenant } from '../../autenticacion';
import { AccionarPuertaAMano } from '../aplicacion/apertura-manual';
import type { OrdenEjecutada } from '../aplicacion/apertura-manual';
import { ConstanciaDeOrdenesEnLineaDeTiempo } from './constancia-de-ordenes';

/**
 * A1 (ETAPA 15-L) · la orden manual aparece en la línea de tiempo con quién la
 * dio y qué contestó el equipo, en palabras. Y una constancia que falla no
 * deshace la apertura.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const EQUIPO = '90000000-0000-4000-8000-000000000001';

const orden = (extra: Partial<OrdenEjecutada> = {}): OrdenEjecutada => ({
  id: 'orden-1',
  copropiedadId: COP,
  accion: 'abrir',
  motivo: 'Visitante esperado por la vivienda 4',
  operadorId: 'op-1',
  rol: 'administrador',
  dispositivoId: EQUIPO,
  momento: new Date(Date.UTC(2026, 8, 27, 15, 0)),
  eventoId: null,
  ...extra,
});

const montar = (falla = false) => {
  const vivos: EventoDeEquipoNuevo[] = [];
  const avisos: { mensaje: string; contexto: unknown }[] = [];
  const bitacora: Bitacora = {
    registrar: (_nivel, mensaje, contexto) => void avisos.push({ mensaje, contexto }),
  };
  const constancia = new ConstanciaDeOrdenesEnLineaDeTiempo(
    {
      vivo: async (e) => {
        if (falla) throw new Error('base caída');
        vivos.push(e);
        return null;
      },
    },
    bitacora,
  );
  return { constancia, vivos, avisos };
};

describe('ConstanciaDeOrdenesEnLineaDeTiempo', () => {
  it('abrir aceptada: quién la dio y que el equipo la aceptó', async () => {
    const { constancia, vivos } = montar();
    await constancia.registrar(orden({ resultado: 'aceptada', detalle: null }));
    expect(vivos).toEqual([
      expect.objectContaining({
        tipo: 'apertura_ordenada',
        origen: 'plataforma',
        titulo: 'Apertura ordenada por la administración: el equipo la aceptó',
        claveIdempotencia: `${COP}:${EQUIPO}:plataforma:orden.orden-1`,
        creadoPor: 'op-1',
      }),
    ]);
  });

  it('rechazada: el motivo va detrás, ya traducido', async () => {
    const { constancia, vivos } = montar();
    await constancia.registrar(
      orden({ rol: 'portero', resultado: 'rechazada', detalle: 'el equipo está ocupado' }),
    );
    expect(vivos[0]?.titulo).toBe(
      'Apertura ordenada por el portero: el equipo la rechazó — el equipo está ocupado',
    );
  });

  it('sin respuesta, inalcanzable y rol sin nombre se dicen igual de claro', async () => {
    const { constancia, vivos } = montar();
    await constancia.registrar(orden({ rol: 'operador_central', resultado: 'inalcanzable' }));
    await constancia.registrar(orden({ id: 'orden-2', rol: 'residente' }));
    expect(vivos.map((v) => v.titulo)).toEqual([
      'Apertura ordenada por la guardia virtual: el equipo no respondió',
      'Apertura ordenada por un operador: sin respuesta del equipo',
    ]);
  });

  it('negar: negación a mano, sin desenlace del equipo', async () => {
    const { constancia, vivos } = montar();
    await constancia.registrar(orden({ accion: 'negar', rol: 'superadministrador' }));
    expect(vivos[0]).toMatchObject({
      tipo: 'negacion_ordenada',
      titulo: 'Acceso negado a mano por el superadministrador',
    });
  });

  it('un detalle desmesurado no desborda el título', async () => {
    const { constancia, vivos } = montar();
    await constancia.registrar(orden({ resultado: 'rechazada', detalle: 'x'.repeat(400) }));
    expect(vivos[0]?.titulo).toHaveLength(200);
  });

  it('si la línea de tiempo falla, se dice y no se lanza', async () => {
    const { constancia, avisos } = montar(true);
    await expect(constancia.registrar(orden())).resolves.toBeUndefined();
    expect(avisos).toEqual([
      {
        mensaje: 'la orden no llegó a la línea de tiempo',
        contexto: { ordenId: 'orden-1', error: 'base caída' },
      },
    ]);
  });
});

describe('AccionarPuertaAMano deja la constancia en los dos caminos', () => {
  const ctx = {
    rol: 'portero',
    usuarioId: 'op-1',
    copropiedadId: COP,
    copropiedadesAtendidas: [],
    mfaVerificado: true,
  } as unknown as ContextoTenant;

  const caso = (responde: ResultadoDeAccionamiento) => {
    const constancias: OrdenEjecutada[] = [];
    const accionar = new AccionarPuertaAMano(
      { accionar: async () => responde },
      {
        registrar: async () => undefined,
        anotarResultado: async () => undefined,
        ultimas: async () => [],
      },
      { ahora: () => new Date(Date.UTC(2026, 8, 27, 15, 0)) },
      { nuevo: () => 'orden-1' },
      { registrar: async (o) => void constancias.push(o) },
    );
    return { accionar, constancias };
  };

  it('negar: una constancia, sin tocar el equipo', async () => {
    const { accionar, constancias } = caso(ordenAceptada(1));
    await accionar.ejecutar(ctx, {
      copropiedadId: COP,
      dispositivoId: EQUIPO,
      accion: 'negar',
      motivo: 'No figura en la autorización',
    });
    expect(constancias.map((c) => [c.accion, c.resultado])).toEqual([['negar', undefined]]);
  });

  it.each([
    [ordenAceptada(12), 'aceptada', null],
    [ordenRechazada('el equipo está ocupado', 3), 'rechazada', 'el equipo está ocupado'],
    [ordenInalcanzable('sin red', 5000), 'inalcanzable', 'sin red'],
  ] as const)('abrir: la constancia lleva el desenlace (%#)', async (r, resultado, detalle) => {
    const { accionar, constancias } = caso(r);
    await accionar.ejecutar(ctx, {
      copropiedadId: COP,
      dispositivoId: EQUIPO,
      accion: 'abrir',
      motivo: 'Visitante esperado por la vivienda 4',
    });
    expect(constancias).toEqual([expect.objectContaining({ resultado, detalle })]);
  });
});
