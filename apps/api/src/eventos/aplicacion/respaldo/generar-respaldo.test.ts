import { describe, expect, it } from 'vitest';
import { diasAnteriores } from './dias';
import { ACTOR, COP1, COP2, EQUIPO, HORA_DEL_TRABAJO, acceso, montar } from './dobles-del-respaldo';
import { GenerarRespaldo, MAXIMO_DE_EVENTOS_POR_DIA, sha256 } from './generar-respaldo';

/**
 * D-147 · la generación del respaldo de un día: sólo lee `eventos`, corta el
 * día en hora de Bogotá, no regenera un día ya respaldado y la huella guardada
 * es la del fichero.
 */
const AYER = diasAnteriores(HORA_DEL_TRABAJO, 1)[0];
if (AYER === undefined) throw new Error('sin día');
const BOGOTA = (h: number, m = 0): Date => new Date(Date.UTC(2026, 9, 27, h + 5, m));

describe('GenerarRespaldo', () => {
  it('incluye los eventos de 00:00 a 23:59 de Bogotá y excluye los de los bordes', async () => {
    const eventos = [
      acceso(new Date(Date.UTC(2026, 9, 27, 4, 59))), // 26/10 23:59 Bogotá
      acceso(BOGOTA(0)), // 27/10 00:00 Bogotá
      acceso(BOGOTA(23, 59)),
      acceso(new Date(Date.UTC(2026, 9, 28, 5, 0))), // 28/10 00:00 Bogotá
    ];
    const m = montar({ eventos });
    const { respaldo, generado } = await m.generar.ejecutar(COP1, AYER, ACTOR);
    expect(generado).toBe(true);
    expect(respaldo.numeroDeEventos).toBe(2);
    expect(m.formato.ultimas.map((f) => f.ocurridoEn.toISOString())).toEqual([
      BOGOTA(0).toISOString(),
      BOGOTA(23, 59).toISOString(),
    ]);
  });

  it('recorre todas las páginas y deja las filas en orden cronológico', async () => {
    const eventos = Array.from({ length: 450 }, (_, i) => acceso(BOGOTA(1, 0 + (i % 60)), {}));
    const m = montar({ eventos });
    const { respaldo } = await m.generar.ejecutar(COP1, AYER, ACTOR);
    expect(respaldo.numeroDeEventos).toBe(450);
    expect(m.eventos.consultas).toBe(3);
    const instantes = m.formato.ultimas.map((f) => f.ocurridoEn.getTime());
    expect([...instantes].sort((a, b) => a - b)).toEqual(instantes);
  });

  it('cuenta permitidos y negados y nombra el equipo por lotes', async () => {
    const eventos = [
      acceso(BOGOTA(8)),
      acceso(BOGOTA(9), { resultado: 'negado', motivo: 'LISTA_NEGRA' }),
      acceso(BOGOTA(10), { resultado: 'negado', motivo: 'VIGENCIA_EXPIRADA' }),
    ];
    const m = montar({ eventos });
    const { respaldo } = await m.generar.ejecutar(COP1, AYER, ACTOR);
    expect([respaldo.permitidos, respaldo.negados]).toEqual([1, 2]);
    expect(m.nombres.llamadas).toHaveLength(1);
    expect(m.nombres.llamadas[0]?.dispositivos).toEqual([EQUIPO]);
    expect(m.formato.ultimas.every((f) => f.equipo === 'Talanquera norte')).toBe(true);
  });

  it('la huella y el tamaño guardados son los del fichero del bucket, en su ruta', async () => {
    const m = montar({ eventos: [acceso(BOGOTA(12))] });
    const { respaldo } = await m.generar.ejecutar(COP1, AYER, ACTOR);
    const fichero = m.almacen.objetos.get(respaldo.ruta);
    expect(respaldo.ruta).toBe(`${COP1}/2026/10/eventos-2026-10-27.xls`);
    expect(fichero).toBeDefined();
    expect(respaldo.sha256).toBe(sha256(fichero ?? new Uint8Array()));
    expect(respaldo.tamanoBytes).toBe(fichero?.byteLength);
    expect(respaldo.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('un día ya respaldado no se regenera: ni se lee, ni se serializa, ni se sube', async () => {
    const m = montar({ eventos: [acceso(BOGOTA(12))] });
    const primero = await m.generar.ejecutar(COP1, AYER, ACTOR);
    const consultas = m.eventos.consultas;
    const segundo = await m.generar.ejecutar(COP1, AYER, ACTOR);
    expect(segundo.generado).toBe(false);
    expect(segundo.respaldo).toEqual(primero.respaldo);
    expect(m.eventos.consultas).toBe(consultas);
    expect(m.formato.veces).toBe(1);
  });

  it('un día sin eventos también queda respaldado, con cero', async () => {
    const m = montar({});
    const { respaldo } = await m.generar.ejecutar(COP1, AYER, ACTOR);
    expect(respaldo.numeroDeEventos).toBe(0);
  });

  it('aislamiento: los eventos de otra copropiedad no entran', async () => {
    const m = montar({
      eventos: [acceso(BOGOTA(7)), acceso(BOGOTA(7), { copropiedadId: COP2 })],
    });
    const uno = await m.generar.ejecutar(COP1, AYER, ACTOR);
    const dos = await m.generar.ejecutar(COP2, AYER, ACTOR);
    expect([uno.respaldo.numeroDeEventos, dos.respaldo.numeroDeEventos]).toEqual([1, 1]);
    expect(dos.respaldo.ruta.startsWith(`${COP2}/`)).toBe(true);
    expect(await m.respaldos.porFecha(COP2, AYER.fecha)).not.toBeNull();
  });

  it('un día con más eventos del máximo se rechaza en vez de truncarse', async () => {
    // Un repositorio que siempre tiene otra página llena: sin el tope, no acaba.
    const pagina = Array.from({ length: 200 }, () => acceso(BOGOTA(3)));
    let paginas = 0;
    const m = montar({});
    const generar = new GenerarRespaldo(
      {
        anexar: m.eventos.anexar,
        porId: m.eventos.porId,
        consultar: async () => {
          paginas += 1;
          return { filas: pagina, siguiente: 'siempre-hay-mas' };
        },
      },
      m.nombres,
      m.formato,
      m.almacen,
      m.respaldos,
    );
    await expect(generar.ejecutar(COP1, AYER, ACTOR)).rejects.toThrow(/truncado/);
    expect(paginas).toBe(Math.floor(MAXIMO_DE_EVENTOS_POR_DIA / 200) + 1);
    expect(await m.respaldos.porFecha(COP1, AYER.fecha)).toBeNull();
    expect(m.almacen.objetos.size).toBe(0);
  });
});
