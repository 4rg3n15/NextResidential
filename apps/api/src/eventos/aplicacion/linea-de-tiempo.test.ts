import { describe, expect, it } from 'vitest';
import { ConsultarLineaDeTiempo } from './linea-de-tiempo';
import type { EventoRegistrado, RepositorioEventos } from './puertos';
import { RepositorioEventosDeEquipoEnMemoria } from '../infraestructura/repositorios-en-memoria';

/** 15-L (B2) · accesos y eventos de equipo en una sola línea, con filtros. */
const COP = '10000000-0000-4000-8000-000000000001';
const EQUIPO = '90000000-0000-4000-8000-000000000001';
const T = (m: number): Date => new Date(Date.UTC(2026, 8, 27, 15, m));

const acceso = (m: number, resultado: 'permitido' | 'negado'): EventoRegistrado => ({
  id: `acc-${String(m)}`,
  copropiedadId: COP,
  ocurridoEn: T(m),
  tipo: 'ingreso',
  resultado,
  motivo: resultado === 'negado' ? 'LISTA_NEGRA' : null,
  metodo: 'placa',
  personaId: null,
  viviendaId: null,
  zonaId: null,
  dispositivoId: EQUIPO,
  placaDetectada: 'ABC123',
  confianza: 0.9,
  reglaAplicada: 'x',
  versionReglas: 1,
  operadorId: null,
  motivoManual: null,
  evidenciaId: null,
  decididoPorEdge: false,
});

const montar = async () => {
  const accesos: RepositorioEventos = {
    anexar: async () => {
      throw new Error('no se usa');
    },
    consultar: async () => ({
      filas: [acceso(1, 'permitido'), acceso(3, 'negado')],
      siguiente: null,
    }),
    porId: async () => null,
  };
  const deEquipo = new RepositorioEventosDeEquipoEnMemoria();
  for (const [m, tipo, titulo, enVivo] of [
    [2, 'puerta_forzada', 'Puerta forzada', true],
    [4, 'timbre', 'Timbre', false],
  ] as const) {
    await deEquipo.registrar({
      copropiedadId: COP,
      dispositivoId: EQUIPO,
      tipo,
      titulo,
      codigoMayor: tipo === 'puerta_forzada' ? 5 : null,
      codigoMenor: tipo === 'puerta_forzada' ? 27 : null,
      origen: 'equipo',
      enVivo,
      ocurridoEn: T(m),
      horaDelEquipo: null,
      eventoId: null,
      claveIdempotencia: `clave-${tipo}`,
      carga: {},
      creadoPor: 'actor',
    });
  }
  return new ConsultarLineaDeTiempo(accesos, deEquipo);
};

const criterios = (tipo: string | null) => ({
  copropiedadId: COP,
  desde: T(0),
  hasta: T(59),
  dispositivoId: null,
  tipo,
  limite: 50,
});

describe('ConsultarLineaDeTiempo', () => {
  it('une accesos y eventos de equipo, de lo más reciente a lo más antiguo', async () => {
    const r = await (await montar()).ejecutar(criterios(null));
    if (!r.ok) throw new Error(r.error.detalle);
    expect(r.valor.elementos.map((e) => e.titulo)).toEqual([
      'Timbre (histórico del equipo)',
      'Acceso negado · placa ABC123 · persona o placa en lista negra',
      'Puerta forzada',
      'Acceso permitido · placa ABC123',
    ]);
    expect(r.valor.elementos.find((e) => e.tipo === 'puerta_forzada')?.codigo).toEqual({
      mayor: 5,
      menor: 27,
    });
  });

  it('`acceso` deja sólo los accesos; un tipo de equipo, sólo ese', async () => {
    const c = await montar();
    const accesos = await c.ejecutar(criterios('acceso'));
    const puertas = await c.ejecutar(criterios('puerta_forzada'));
    if (!accesos.ok || !puertas.ok) throw new Error('fallo');
    expect(accesos.valor.elementos.every((e) => e.origen === 'acceso')).toBe(true);
    expect(puertas.valor.elementos.map((e) => e.tipo)).toEqual(['puerta_forzada']);
  });

  it('un rango incoherente no es de nadie: se rechaza', async () => {
    const r = await (await montar()).ejecutar({ ...criterios(null), desde: T(30), hasta: T(10) });
    expect(r.ok).toBe(false);
  });
});

describe('R2 (15-N) · con el reloj del equipo desviado, la hora que se enseña es la de recepción', () => {
  const RECIBIDO = new Date(Date.UTC(2026, 8, 29, 20, 0, 0));
  const vivo = (ocurridoEn: Date, extra: Partial<EventoRegistrado> = {}): EventoRegistrado => ({
    ...acceso(1, 'negado'),
    ocurridoEn,
    registradoEn: RECIBIDO,
    ...extra,
  });
  const consultar = (filas: EventoRegistrado[], tolerancia?: number) =>
    new ConsultarLineaDeTiempo(
      {
        anexar: async () => {
          throw new Error('x');
        },
        consultar: async () => ({ filas, siguiente: null }),
        porId: async () => null,
      },
      new RepositorioEventosDeEquipoEnMemoria(),
      tolerancia,
    ).ejecutar({
      copropiedadId: COP,
      desde: new Date(Date.UTC(2026, 8, 29)),
      hasta: new Date(Date.UTC(2026, 8, 30)),
      dispositivoId: null,
      tipo: 'acceso',
      limite: 10,
    });

  it('13 h atrasado: recepción, con la hora del equipo y el desvío', async () => {
    const trece = new Date(RECIBIDO.getTime() - 46_727_000);
    const r = await consultar([vivo(trece)], 30);
    if (!r.ok) throw new Error('fallo');
    expect(r.valor.elementos[0]).toMatchObject({
      ocurridoEn: RECIBIDO.toISOString(),
      horaDelEquipo: trece.toISOString(),
      relojDesviadoSegundos: -46_727,
    });
  });

  it('dentro de tolerancia, la del equipo y sin marca', async () => {
    const r = await consultar([vivo(new Date(RECIBIDO.getTime() - 10_000))], 30);
    if (!r.ok) throw new Error('fallo');
    expect(r.valor.elementos[0]?.relojDesviadoSegundos).toBeNull();
  });

  it('lo que decidió el Edge sin conexión llega tarde a propósito: no se marca', async () => {
    const r = await consultar(
      [vivo(new Date(RECIBIDO.getTime() - 3_600_000), { decididoPorEdge: true })],
      30,
    );
    if (!r.ok) throw new Error('fallo');
    expect(r.valor.elementos[0]?.relojDesviadoSegundos).toBeNull();
  });
});

describe('R2 (15-N) · también en lo que emite el equipo en vivo; nunca en su histórico', () => {
  it('en vivo y 13 h atrás: recepción con marca; el histórico conserva su hora', async () => {
    const deEquipo = new RepositorioEventosDeEquipoEnMemoria();
    const trece = new Date(Date.now() - 46_727_000);
    for (const [enVivo, clave] of [
      [true, 'vivo'],
      [false, 'hist'],
    ] as const) {
      await deEquipo.registrar({
        copropiedadId: COP,
        dispositivoId: EQUIPO,
        tipo: 'acceso_negado_por_el_equipo',
        titulo: `negado ${clave}`,
        codigoMayor: 5,
        codigoMenor: 8,
        origen: 'equipo',
        enVivo,
        ocurridoEn: trece,
        horaDelEquipo: null,
        eventoId: null,
        claveIdempotencia: clave,
        carga: {},
        creadoPor: 'x',
      });
    }
    const r = await new ConsultarLineaDeTiempo(
      {
        anexar: async () => {
          throw new Error('x');
        },
        consultar: async () => ({ filas: [], siguiente: null }),
        porId: async () => null,
      },
      deEquipo,
      30,
    ).ejecutar({
      copropiedadId: COP,
      desde: new Date(Date.now() - 86_400_000),
      hasta: new Date(Date.now() + 60_000),
      dispositivoId: null,
      tipo: null,
      limite: 10,
    });
    if (!r.ok) throw new Error('fallo');
    const vivo = r.valor.elementos.find((e) => e.titulo === 'negado vivo');
    const hist = r.valor.elementos.find((e) => e.titulo.startsWith('negado hist'));
    expect(vivo?.relojDesviadoSegundos).toBeLessThan(-46_000);
    expect(vivo?.horaDelEquipo).toBe(trece.toISOString());
    expect(hist?.relojDesviadoSegundos).toBeNull();
    expect(hist?.ocurridoEn).toBe(trece.toISOString());
  });
});
