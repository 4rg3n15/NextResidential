import { describe, expect, it } from 'vitest';
import { HikvisionProvider } from './hikvision-provider';
import { RegistroEnMemoria } from './registro-de-equipos';
import type { EquipoRegistrado } from './registro-de-equipos';
import { FuenteDePlacas } from '../equipo/fuente-de-placas';
import { equiposSimulados, puertasAbiertasPor } from '../simulacion/equipo-simulado';
import type { GuionDeEquipo } from '../simulacion/equipo-simulado';
import { aplanarSalidas } from '../nucleo/salidas';
import { MockProvider } from '../mock/mock-provider';
import { CapacidadNoSoportada } from '../nucleo/errores';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P3/P5 · LAS SALIDAS DEL VIDEOPORTERO, CONTRA EL SIMULADO
 *
 * El árbol sale de lo que el equipo DECLARA (capacidades, órdenes remotas,
 * unidades seguras, submódulos) y la apertura va a la puerta ELEGIDA: el
 * oráculo es `puertasAbiertasPor`, lo que el simulado hizo, no lo que se
 * espera. Un equipo que no declara salidas se comporta como hasta la 15-P:
 * la puerta de su ficha (R1).
 * ═════════════════════════════════════════════════════════════════════════════
 */
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;

const portero = (
  id: string,
  host: string,
  extra: Partial<EquipoRegistrado> = {},
): EquipoRegistrado => ({
  dispositivoId: id,
  tipo: 'intercom',
  host,
  puerto: 80,
  protocolo: 'http',
  ...CREDENCIAL,
  canalDeAudioHabilitado: true,
  numeroDePuerta: 1,
  ...extra,
});

const montar = (guion: Partial<GuionDeEquipo>, equipo: Partial<EquipoRegistrado> = {}) => {
  const host = `portero-${Math.random().toString(36).slice(2)}.invalid`;
  const simulado = equiposSimulados({
    [host]: { familia: 'videoportero', ...CREDENCIAL, ...guion },
  });
  const pedidas: string[] = [];
  const peticion = (async (entrada: string | URL, opciones?: RequestInit) => {
    pedidas.push(`${opciones?.method ?? 'GET'} ${new URL(String(entrada)).pathname}`);
    return simulado(entrada, opciones);
  }) as typeof fetch;
  const proveedor = new HikvisionProvider({
    registro: new RegistroEnMemoria([portero('portero-1', host, equipo)]),
    reloj: { ahora: () => new Date('2026-10-01T12:00:00Z') },
    fuente: new FuenteDePlacas(),
    peticion,
  });
  return { proveedor, host, pedidas };
};

describe('HikvisionProvider · salidas del videoportero (P3)', () => {
  it('dos cerraduras declaradas: el árbol las nombra y cada una se abre por SU número', async () => {
    const m = montar({ salidas: { puertas: 2, cerraduras: true } });
    const arbol = await m.proveedor.salidasDe('portero-1');
    expect(aplanarSalidas(arbol).map((s) => [s.nombre, s.numeroDePuerta])).toEqual([
      ['Cerradura 1', 1],
      ['Cerradura 2', 2],
    ]);
    // Sin bandera de unidades ni submódulos, ni se pregunta por ellos.
    expect(m.pedidas.some((p) => /DoorSecurityModule|SubModules/.test(p))).toBe(false);

    const segunda = await m.proveedor.abrirSalida('portero-1', 2, 'operador-1');
    expect(segunda.aceptado).toBe(true);
    const primera = await m.proveedor.abrirSalida('portero-1', 1, 'operador-1');
    expect(primera.aceptado).toBe(true);
    expect(puertasAbiertasPor.get(m.host)).toEqual([2, 1]);
  });

  it('unidad segura y submódulos: se leen sólo porque el equipo los declara', async () => {
    const m = montar({
      salidas: {
        puertas: 1,
        unidadesSeguras: [{ numero: '1', enLinea: true }],
        submodulos: [{ id: 3, moduleType: 'DS-KD-KP', status: 'offline' }],
      },
    });
    const arbol = await m.proveedor.salidasDe('portero-1');
    expect(arbol.hijos.map((h) => [h.clave, h.estado])).toEqual([
      ['propio', null],
      ['unidad-segura-1', 'en_linea'],
      ['submodulo-3', 'fuera_de_linea'],
    ]);
    expect(m.pedidas.filter((p) => /DoorSecurityModule|SubModules/.test(p))).toHaveLength(2);
  });

  it('R1 · un equipo que no declara salidas: la puerta de su ficha, como hasta ahora', async () => {
    const m = montar({}, { numeroDePuerta: 1 });
    const arbol = await m.proveedor.salidasDe('portero-1');
    expect(aplanarSalidas(arbol).map((s) => s.numeroDePuerta)).toEqual([1]);
    expect(arbol.hijos[0]?.nota).toMatch(/se usa la de su ficha/);
  });

  it('sin operador la orden no sale (RN-08, CA-20)', async () => {
    const m = montar({ salidas: { puertas: 2 } });
    await expect(m.proveedor.abrirSalida('portero-1', 2, '  ')).rejects.toThrow(/sin operador/i);
    expect(puertasAbiertasPor.get(m.host)).toBeUndefined();
  });

  it('un videoportero que no declara apertura remota no abre ninguna salida', async () => {
    const m = montar({ aperturaRemota: false, salidas: { puertas: 2 } });
    await expect(m.proveedor.abrirSalida('portero-1', 1, 'operador-1')).rejects.toBeInstanceOf(
      CapacidadNoSoportada,
    );
    expect(puertasAbiertasPor.get(m.host)).toBeUndefined();
  });
});

describe('MockProvider · salidas simuladas (ADR-03)', () => {
  it('finge dos cerraduras, abre la elegida y lo anota; lo desconocido rechaza', async () => {
    const mock = new MockProvider({ dispositivos: ['vp-1'] });
    const arbol = await mock.salidasDe('vp-1');
    expect(aplanarSalidas(arbol).map((s) => s.nombre)).toEqual(['Cerradura 1', 'Cerradura 2']);
    await mock.abrirSalida('vp-1', 2, 'op-1');
    expect(mock.aperturas.at(-1)).toEqual({
      dispositivoId: 'vp-1',
      actorId: 'op-1',
      numeroDePuerta: 2,
    });
    await expect(mock.salidasDe('no-existe')).rejects.toThrow();
  });
});
