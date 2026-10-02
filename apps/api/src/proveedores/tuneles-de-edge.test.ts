import { describe, expect, it } from 'vitest';
import { SesionDeTunel, enlacesEnMemoria } from '@ncr/providers';
import { TunelesDeEdge } from './tuneles-de-edge';
import type { TunelVivo } from './tuneles-de-edge';

/**
 * 15-Q2 · A1/A3 · los túneles vivos, UNO por copropiedad: el segundo `ocupar`
 * no desaloja al primero —ni siquiera si es el mismo Edge reconectando— y
 * sólo `liberar` del túnel dueño lo suelta. `estadoDe` dice desde cuándo.
 */
const COP_A = '10000000-0000-4000-8000-000000000001';
const COP_B = '10000000-0000-4000-8000-000000000002';
const EDGE_1 = 'a0000001-0000-4000-8000-000000000001';
const EDGE_2 = 'a0000002-0000-4000-8000-000000000002';
const DESDE = new Date('2026-10-02T12:00:00Z');

const tunel = (copropiedadId: string, edgeId: string, desde = DESDE): TunelVivo => ({
  copropiedadId,
  edgeId,
  sesion: new SesionDeTunel(enlacesEnMemoria()[0], { paridad: 'par' }),
  desde,
});

const conOyente = () => {
  const tuneles = new TunelesDeEdge();
  const cambios: string[] = [];
  tuneles.alCambiar((cop, evento, edgeId) => void cambios.push(`${cop}:${evento}:${edgeId}`));
  return { tuneles, cambios };
};

describe('TunelesDeEdge (15-Q2, A1/A3)', () => {
  it('sin túnel: sesionDe null, desconectado sin historia, 0 conectados', () => {
    const t = new TunelesDeEdge();
    expect(t.sesionDe(COP_A)).toBeNull();
    expect(t.estadoDe(COP_A)).toEqual({ conectado: false, edgeId: null, desde: null });
    expect(t.conectados).toBe(0);
  });

  it('ocupar entra (null), avisa «conectado» y deja su sesión como la de la copropiedad', () => {
    const { tuneles, cambios } = conOyente();
    const uno = tunel(COP_A, EDGE_1);
    expect(tuneles.ocupar(uno)).toBeNull();
    expect(tuneles.sesionDe(COP_A)).toBe(uno.sesion);
    expect(tuneles.estadoDe(COP_A)).toEqual({ conectado: true, edgeId: EDGE_1, desde: DESDE });
    expect(tuneles.conectados).toBe(1);
    expect(cambios).toEqual([`${COP_A}:conectado:${EDGE_1}`]);
  });

  it('A1 · un segundo ocupar para la MISMA copropiedad se rechaza: devuelve el que ya está', () => {
    const { tuneles, cambios } = conOyente();
    const uno = tunel(COP_A, EDGE_1);
    tuneles.ocupar(uno);
    for (const intruso of [tunel(COP_A, EDGE_2), tunel(COP_A, EDGE_1)]) {
      expect(tuneles.ocupar(intruso)).toBe(uno);
    }
    expect(tuneles.sesionDe(COP_A)).toBe(uno.sesion);
    expect(tuneles.conectados).toBe(1);
    expect(cambios).toHaveLength(1);
  });

  it('una copropiedad por túnel: otra copropiedad entra aparte', () => {
    const t = new TunelesDeEdge();
    t.ocupar(tunel(COP_A, EDGE_1));
    expect(t.ocupar(tunel(COP_B, EDGE_2))).toBeNull();
    expect(t.conectados).toBe(2);
    expect(t.estadoDe(COP_B)).toMatchObject({ conectado: true, edgeId: EDGE_2 });
  });

  it('liberar del dueño: avisa «desconectado» y estadoDe recuerda quién y desde cuándo', () => {
    const { tuneles, cambios } = conOyente();
    const uno = tunel(COP_A, EDGE_1);
    tuneles.ocupar(uno);
    const caida = new Date('2026-10-02T12:30:00Z');
    tuneles.liberar(uno, caida);
    expect(tuneles.sesionDe(COP_A)).toBeNull();
    expect(tuneles.estadoDe(COP_A)).toEqual({ conectado: false, edgeId: EDGE_1, desde: caida });
    expect(tuneles.conectados).toBe(0);
    expect(cambios).toEqual([`${COP_A}:conectado:${EDGE_1}`, `${COP_A}:desconectado:${EDGE_1}`]);
  });

  it('liberar de un túnel que no es el dueño no suelta nada ni avisa', () => {
    const { tuneles, cambios } = conOyente();
    const uno = tunel(COP_A, EDGE_1);
    tuneles.ocupar(uno);
    tuneles.liberar(tunel(COP_A, EDGE_2), new Date());
    tuneles.liberar(tunel(COP_B, EDGE_2), new Date());
    expect(tuneles.sesionDe(COP_A)).toBe(uno.sesion);
    expect(cambios).toEqual([`${COP_A}:conectado:${EDGE_1}`]);
  });

  it('una sesión cerrada sin liberar ya no cuenta, y el siguiente túnel puede entrar', () => {
    const { tuneles, cambios } = conOyente();
    const uno = tunel(COP_A, EDGE_1);
    tuneles.ocupar(uno);
    uno.sesion.cerrar(1000, 'fin');
    expect(tuneles.sesionDe(COP_A)).toBeNull();
    expect(tuneles.conectados).toBe(0);
    expect(tuneles.estadoDe(COP_A)).toMatchObject({ conectado: false });
    const dos = tunel(COP_A, EDGE_1, new Date('2026-10-02T13:00:00Z'));
    expect(tuneles.ocupar(dos)).toBeNull();
    expect(tuneles.sesionDe(COP_A)).toBe(dos.sesion);
    tuneles.liberar(uno, new Date());
    expect(tuneles.sesionDe(COP_A)).toBe(dos.sesion);
    expect(cambios).toEqual([`${COP_A}:conectado:${EDGE_1}`, `${COP_A}:conectado:${EDGE_1}`]);
  });

  it('al volver a entrar se olvida la caída: estadoDe dice el nuevo «desde»', () => {
    const t = new TunelesDeEdge();
    const uno = tunel(COP_A, EDGE_1);
    t.ocupar(uno);
    t.liberar(uno, new Date('2026-10-02T12:30:00Z'));
    const vuelta = new Date('2026-10-02T12:31:00Z');
    t.ocupar(tunel(COP_A, EDGE_1, vuelta));
    expect(t.estadoDe(COP_A)).toEqual({ conectado: true, edgeId: EDGE_1, desde: vuelta });
  });

  it('avisa a todos los oyentes, en orden de alta', () => {
    const t = new TunelesDeEdge();
    const orden: string[] = [];
    t.alCambiar(() => void orden.push('primero'));
    t.alCambiar(() => void orden.push('segundo'));
    t.ocupar(tunel(COP_A, EDGE_1));
    expect(orden).toEqual(['primero', 'segundo']);
  });
});
