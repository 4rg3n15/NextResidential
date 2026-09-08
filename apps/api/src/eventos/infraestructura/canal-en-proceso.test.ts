import { describe, expect, it } from 'vitest';
import { CanalEnProceso } from './canal-en-proceso';
import { bitacoraDePrueba } from '../aplicacion/dobles';

const COP_A = 'cop-a';
const COP_B = 'cop-b';

const suscriptor = (): {
  recibidos: { tema: string; carga: unknown }[];
  entregar: (t: string, c: unknown) => boolean;
} => {
  const recibidos: { tema: string; carga: unknown }[] = [];
  return { recibidos, entregar: (tema, carga) => (recibidos.push({ tema, carga }), true) };
};

describe('CanalEnProceso · aislamiento por copropiedad (KPI-35)', () => {
  it('un suscriptor NO recibe lo publicado en otra copropiedad', async () => {
    const canal = new CanalEnProceso();
    const a = suscriptor();
    const b = suscriptor();
    canal.suscribir(COP_A, a);
    canal.suscribir(COP_B, b);

    await canal.publicar(COP_A, 'eventos', { id: 'evt-1' });

    expect(a.recibidos.length).toBe(1);
    expect(b.recibidos).toEqual([]);
  });

  it('publicar en una copropiedad sin suscriptores devuelve 0', async () => {
    expect(await new CanalEnProceso().publicar(COP_A, 'alertas', {})).toBe(0);
  });

  it('devuelve el número real de destinatarios', async () => {
    const canal = new CanalEnProceso();
    canal.suscribir(COP_A, suscriptor());
    canal.suscribir(COP_A, suscriptor());
    expect(await canal.publicar(COP_A, 'eventos', {})).toBe(2);
  });
});

describe('CanalEnProceso · sockets muertos', () => {
  it('un suscriptor que ya no acepta se retira y NO se cuenta', async () => {
    // Si se contara, KPI-25 daría verde sobre entregas que no ocurrieron.
    const canal = new CanalEnProceso();
    canal.suscribir(COP_A, { entregar: () => false });
    const vivo = suscriptor();
    canal.suscribir(COP_A, vivo);

    expect(await canal.publicar(COP_A, 'eventos', {})).toBe(1);
    expect(canal.suscriptoresDe(COP_A)).toBe(1);
  });

  it('un suscriptor que LANZA se retira y no rompe la publicación', async () => {
    const bitacora = bitacoraDePrueba();
    const canal = new CanalEnProceso(bitacora);
    canal.suscribir(COP_A, {
      entregar: () => {
        throw new Error('socket roto');
      },
    });
    const vivo = suscriptor();
    canal.suscribir(COP_A, vivo);

    expect(await canal.publicar(COP_A, 'eventos', {})).toBe(1);
    expect(vivo.recibidos.length).toBe(1);
    expect(bitacora.lineas.some((l) => l.nivel === 'aviso')).toBe(true);
  });

  it('cuando se van todos, la copropiedad deja de ocupar memoria', async () => {
    const canal = new CanalEnProceso();
    const baja = canal.suscribir(COP_A, suscriptor());
    expect(canal.suscriptoresDe(COP_A)).toBe(1);
    baja();
    expect(canal.suscriptoresDe(COP_A)).toBe(0);
  });

  it('la baja solo retira al suscriptor que la pidió', async () => {
    const canal = new CanalEnProceso();
    const uno = suscriptor();
    const dos = suscriptor();
    const bajaUno = canal.suscribir(COP_A, uno);
    canal.suscribir(COP_A, dos);

    bajaUno();
    await canal.publicar(COP_A, 'eventos', {});
    expect(uno.recibidos).toEqual([]);
    expect(dos.recibidos.length).toBe(1);
  });

  it('la baja es idempotente', () => {
    const canal = new CanalEnProceso();
    const baja = canal.suscribir(COP_A, suscriptor());
    baja();
    expect(() => baja()).not.toThrow();
  });

  it('entrega el tema y la carga sin transformarlos', async () => {
    const canal = new CanalEnProceso();
    const s = suscriptor();
    canal.suscribir(COP_A, s);
    await canal.publicar(COP_A, 'alertas', { id: 'al-1', severidad: 'critica' });
    expect(s.recibidos[0]).toEqual({
      tema: 'alertas',
      carga: { id: 'al-1', severidad: 'critica' },
    });
  });
});
