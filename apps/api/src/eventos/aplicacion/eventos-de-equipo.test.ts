import { describe, expect, it } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import { RegistroDeEventosDeEquipo, TEMA_EVENTOS_DE_EQUIPO } from './eventos-de-equipo';
import type { EventoDeEquipoNuevo, RepositorioEventosDeEquipo } from './eventos-de-equipo';
import { RepositorioEventosDeEquipoEnMemoria } from '../infraestructura/repositorios-en-memoria';

/**
 * 15-L (Bloque B) · lo vivo se guarda y sale por el canal en el acto; lo
 * histórico va a una cola que no retrasa a nadie; el reenvío no duplica.
 */
const COP = '10000000-0000-4000-8000-000000000001';

const evento = (n: number, extra: Partial<EventoDeEquipoNuevo> = {}): EventoDeEquipoNuevo => ({
  copropiedadId: COP,
  dispositivoId: '90000000-0000-4000-8000-000000000001',
  tipo: 'puerta_forzada',
  titulo: 'Puerta forzada',
  codigoMayor: 5,
  codigoMenor: 27,
  origen: 'equipo',
  enVivo: true,
  ocurridoEn: new Date(Date.UTC(2026, 8, 27, 15, 0, n)),
  horaDelEquipo: null,
  eventoId: null,
  claveIdempotencia: `clave-de-prueba-${String(n)}`,
  carga: {},
  creadoPor: 'actor',
  ...extra,
});

const montar = (
  repositorio: RepositorioEventosDeEquipo = new RepositorioEventosDeEquipoEnMemoria(),
) => {
  const lineas: { nivel: string; mensaje: string; contexto: unknown }[] = [];
  const bitacora: Bitacora = {
    registrar: (nivel, mensaje, contexto) => void lineas.push({ nivel, mensaje, contexto }),
  };
  const publicados: { tema: string; carga: unknown }[] = [];
  let t = 0;
  const registro = new RegistroDeEventosDeEquipo(
    repositorio,
    {
      publicar: async (_c, tema, carga) => {
        publicados.push({ tema, carga });
        return 2;
      },
    },
    bitacora,
    { ahora: () => new Date((t += 7)) },
    { maximoEnCola: 3, lote: 2 },
  );
  return { registro, lineas, publicados, repositorio };
};

describe('RegistroDeEventosDeEquipo', () => {
  it('lo vivo se guarda y sale por el canal, con su latencia', async () => {
    const { registro, publicados, lineas } = montar();
    const guardado = await registro.vivo(evento(1));
    expect(guardado?.id).toBeDefined();
    expect(publicados).toEqual([
      { tema: TEMA_EVENTOS_DE_EQUIPO, carga: expect.objectContaining({ tipo: 'puerta_forzada' }) },
    ]);
    const linea = lineas.find((l) => l.mensaje === 'evento de equipo a la consola');
    expect(linea?.contexto).toMatchObject({ destinatarios: 2, latenciaMs: 7 });
  });

  it('el reenvío del equipo no crea otra fila ni otro aviso (B3)', async () => {
    const { registro, publicados } = montar();
    await registro.vivo(evento(1));
    expect(await registro.vivo(evento(1))).toBeNull();
    expect(publicados).toHaveLength(1);
  });

  it('si la base falla, se dice y no se tumba la ingesta', async () => {
    const roto: RepositorioEventosDeEquipo = {
      registrar: async () => {
        throw new Error('base caída');
      },
      registrarVarios: async () => 0,
      consultar: async () => [],
    };
    const { registro, lineas } = montar(roto);
    expect(await registro.vivo(evento(1))).toBeNull();
    expect(lineas.some((l) => l.nivel === 'error' && /no se pudo guardar/.test(l.mensaje))).toBe(
      true,
    );
  });

  it('lo histórico va a la cola, se guarda por lotes y sin avisar a nadie', async () => {
    const repositorio = new RepositorioEventosDeEquipoEnMemoria();
    const { registro, publicados } = montar(repositorio);
    registro.historico(evento(1, { enVivo: false }));
    registro.historico(evento(2, { enVivo: false }));
    registro.historico(evento(3, { enVivo: false }));
    await registro.vaciada();
    expect(repositorio.filas).toHaveLength(3);
    expect(publicados).toEqual([]);
  });

  it('un volcado mayor que la cola se cuenta y se dice, no se esconde', async () => {
    const { registro, lineas } = montar();
    for (let i = 0; i < 6; i += 1) registro.historico(evento(i, { enVivo: false }));
    await registro.vaciada();
    expect(lineas.some((l) => /mayor que la cola/.test(l.mensaje))).toBe(true);
  });

  it('un lote que falla se registra y la cola sigue', async () => {
    const repositorio: RepositorioEventosDeEquipo = {
      registrar: async () => null,
      registrarVarios: async () => {
        throw new Error('lote roto');
      },
      consultar: async () => [],
    };
    const { registro, lineas } = montar(repositorio);
    registro.historico(evento(1, { enVivo: false }));
    await registro.vaciada();
    expect(lineas.some((l) => /no se pudo guardar un lote/.test(l.mensaje))).toBe(true);
  });
});

describe('el repositorio en memoria filtra como la tabla', () => {
  it('por equipo, tipo y rango, de lo más reciente a lo más antiguo', async () => {
    const r = new RepositorioEventosDeEquipoEnMemoria();
    await r.registrar(evento(1));
    await r.registrar(evento(2, { tipo: 'timbre', dispositivoId: 'otro' }));
    await r.registrar(evento(3));
    const todos = await r.consultar({
      copropiedadId: COP,
      desde: new Date(0),
      hasta: new Date(Date.UTC(2030, 0)),
      limite: 10,
    });
    expect(todos.map((e) => e.claveIdempotencia)).toEqual([
      'clave-de-prueba-3',
      'clave-de-prueba-2',
      'clave-de-prueba-1',
    ]);
    const timbres = await r.consultar({
      copropiedadId: COP,
      desde: new Date(0),
      hasta: new Date(Date.UTC(2030, 0)),
      tipo: 'timbre',
      dispositivoId: 'otro',
      limite: 10,
    });
    expect(timbres).toHaveLength(1);
    expect(await r.registrarVarios([evento(1), evento(4)])).toBe(1);
  });
});
