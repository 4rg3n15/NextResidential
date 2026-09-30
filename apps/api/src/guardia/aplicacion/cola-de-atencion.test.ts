import { describe, expect, it } from 'vitest';
import {
  UMBRAL_DE_DEMORA_SEGUNDOS,
  VIGENCIA_EN_COLA_POR_OMISION_S,
  construirCola,
  resumenDeCola,
  urgenciaDe,
} from './cola-de-atencion';
import type { AccesoReciente, EventoDeEquipoReciente, MaterialDeLaCola } from './cola-de-atencion';

/**
 * CU-03 · P-22 (G1, 15-N) · lo que esta cola impide es dejar a alguien en la
 * calle… y enterrar al que espera bajo lo que no necesita a nadie.
 *
 * Hasta la 15-N entraban los permitidos de la última hora: el «evento actual»
 * de la portería podía ser un residente que entró hace 50 minutos. Ahora sólo
 * entra lo que necesita a una persona, en vivo y vigente.
 */
const AHORA = new Date(Date.UTC(2026, 8, 30, 12, 0, 0));
const hace = (segundos: number): Date => new Date(AHORA.getTime() - segundos * 1000);

const acceso = (
  id: string,
  haceSegundos: number,
  motivo: string | null,
  metodo = 'placa',
): AccesoReciente => ({
  id,
  ocurridoEn: hace(haceSegundos),
  resultado: motivo === null ? 'permitido' : 'negado',
  motivo,
  metodo,
  dispositivoId: 'disp-camara',
  viviendaId: 'viv-1',
  placaDetectada: 'ABC123',
  evidenciaId: null,
});

const deEquipo = (
  id: string,
  haceSegundos: number,
  tipo: string,
  extra: Partial<EventoDeEquipoReciente> = {},
): EventoDeEquipoReciente => ({
  id,
  dispositivoId: 'disp-portero',
  tipo,
  titulo: `Título de ${tipo}`,
  enVivo: true,
  origen: 'equipo',
  eventoId: null,
  recibidoEn: hace(haceSegundos),
  ...extra,
});

const material = (
  accesos: readonly AccesoReciente[],
  eventosDeEquipo: readonly EventoDeEquipoReciente[] = [],
  atendidos: readonly string[] = [],
): MaterialDeLaCola => ({ accesos, eventosDeEquipo, atendidos: new Set(atendidos) });

const ids = (m: MaterialDeLaCola): readonly string[] => construirCola(m, AHORA).map((e) => e.id);

describe('qué entra (P-22)', () => {
  it('un acceso PERMITIDO no entra: va a Eventos', () => {
    expect(ids(material([acceso('entro', 5, null)]))).toEqual([]);
  });

  it('una placa sin autorización entra como «placa»', () => {
    const [e] = construirCola(material([acceso('p', 5, 'PLACA_DESCONOCIDA')]), AHORA);
    expect(e?.disparador).toBe('placa');
    expect(e?.titulo).toBe('Placa sin autorización');
  });

  it('el permiso vencido de un rostro entra: el cliente lo pidió aunque el motor decida con certeza', () => {
    const [e] = construirCola(material([acceso('r', 5, 'VIGENCIA_EXPIRADA', 'facial')]), AHORA);
    expect(e?.disparador).toBe('rostro');
    expect(e?.motivo).toBe('VIGENCIA_EXPIRADA');
  });

  it('una negación MANUAL no entra: ya la decidió una persona', () => {
    expect(ids(material([acceso('m', 5, 'LISTA_NEGRA', 'manual')]))).toEqual([]);
  });

  it('la llamada del videoportero en vivo entra, con el título del equipo', () => {
    const [e] = construirCola(material([], [deEquipo('ll', 3, 'llamada')]), AHORA);
    expect(e).toMatchObject({ id: 'll', origen: 'equipo', disparador: 'llamada' });
    expect(e?.titulo).toBe('Título de llamada');
    expect(e?.dispositivoId).toBe('disp-portero');
  });

  it('el volcado HISTÓRICO de un equipo no entra', () => {
    expect(ids(material([], [deEquipo('h', 3, 'llamada', { enVivo: false })]))).toEqual([]);
  });

  it('un evento de equipo que acompaña a un acceso no entra dos veces', () => {
    const m = material(
      [acceso('a', 5, 'VIGENCIA_EXPIRADA', 'facial')],
      [deEquipo('e', 5, 'rostro_no_reconocido', { eventoId: 'a' })],
    );
    expect(ids(m)).toEqual(['a']);
  });

  it('la misma llamada que el equipo anuncia dos veces (VoiceTalk y 5/51, o dos timbrazos) es UN elemento', () => {
    // Se queda la primera: el visitante espera desde que llamó por primera vez.
    const m = material(
      [],
      [
        deEquipo('ll-1', 40, 'llamada'),
        deEquipo('ll-2', 38, 'llamada'),
        deEquipo('t', 10, 'timbre'),
      ],
    );
    expect(ids(m)).toEqual(['ll-1']);
  });

  it('dos videoporteros llamando son dos elementos', () => {
    const m = material(
      [],
      [deEquipo('a', 40, 'llamada'), deEquipo('b', 30, 'llamada', { dispositivoId: 'otro' })],
    );
    expect(ids(m)).toEqual(['a', 'b']);
  });

  it('R2 · la negación del propio equipo entra como «rostro» con el motivo del equipo', () => {
    const [e] = construirCola(
      material(
        [],
        [deEquipo('n', 5, 'acceso_negado_por_el_equipo', { motivo: 'VIGENCIA_EXPIRADA' })],
      ),
      AHORA,
    );
    expect(e).toMatchObject({ disparador: 'rostro', motivo: 'VIGENCIA_EXPIRADA' });
  });

  it('un tipo que no necesita a nadie (puerta abierta) no entra', () => {
    expect(ids(material([], [deEquipo('pu', 3, 'puerta_abierta')]))).toEqual([]);
  });
});

describe('qué sale', () => {
  it('lo que una orden manual ya atendió sale', () => {
    expect(ids(material([acceso('a', 5, 'PLACA_DESCONOCIDA')], [], ['a']))).toEqual([]);
  });

  it('pasada la vigencia sale y queda en Eventos', () => {
    const v = VIGENCIA_EN_COLA_POR_OMISION_S;
    expect(ids(material([acceso('justo', v, 'PLACA_DESCONOCIDA')]))).toEqual(['justo']);
    expect(ids(material([acceso('tarde', v + 1, 'PLACA_DESCONOCIDA')]))).toEqual([]);
  });

  it('la vigencia se configura', () => {
    const m = material([acceso('a', 90, 'PLACA_DESCONOCIDA')]);
    expect(construirCola(m, AHORA, { vigenciaSegundos: 60 })).toEqual([]);
    expect(construirCola(m, AHORA, { vigenciaSegundos: 120 })).toHaveLength(1);
  });

  it('la llamada sale cuando el MISMO equipo dice que terminó (S-161)', () => {
    const m = material([], [deEquipo('ll', 30, 'llamada'), deEquipo('fin', 10, 'llamada_colgada')]);
    expect(ids(m)).toEqual([]);
  });

  it('el fin de llamada de OTRO equipo no la saca', () => {
    const m = material(
      [],
      [
        deEquipo('ll', 30, 'llamada'),
        deEquipo('fin', 10, 'llamada_colgada', { dispositivoId: 'otro-portero' }),
      ],
    );
    expect(ids(m)).toEqual(['ll']);
  });

  it('un fin ANTERIOR a la llamada no la saca: es de la llamada de antes', () => {
    const m = material(
      [],
      [deEquipo('fin', 60, 'llamada_cancelada'), deEquipo('ll', 10, 'llamada')],
    );
    expect(ids(m)).toEqual(['ll']);
  });
});

describe('orden de la cola', () => {
  it('lo que lleva MÁS tiempo esperando va primero, no lo más reciente', () => {
    const m = material([
      acceso('nuevo', 5, 'PLACA_DESCONOCIDA'),
      acceso('viejo', 200, 'PLACA_DESCONOCIDA'),
    ]);
    expect(ids(m)).toEqual(['viejo', 'nuevo']);
  });

  it('lo crítico se adelanta aunque lleve menos tiempo', () => {
    const m = material([
      acceso('espera', 200, 'PLACA_DESCONOCIDA'),
      acceso('ln', 5, 'LISTA_NEGRA'),
    ]);
    expect(ids(m)[0]).toBe('ln');
  });

  it('accesos y eventos de equipo se ordenan juntos', () => {
    const m = material([acceso('placa', 20, 'PLACA_DESCONOCIDA')], [deEquipo('ll', 90, 'llamada')]);
    expect(ids(m)).toEqual(['ll', 'placa']);
  });

  it('entre dos críticos manda la antigüedad', () => {
    const m = material([
      acceso('c-nuevo', 10, 'LISTA_NEGRA'),
      acceso('c-viejo', 200, 'FALLO_TECNICO'),
    ]);
    expect(ids(m)).toEqual(['c-viejo', 'c-nuevo']);
  });
});

describe('espera y demora', () => {
  it('la espera se CALCULA con el instante inyectado', () => {
    const [e] = construirCola(material([acceso('x', 125, 'PLACA_DESCONOCIDA')]), AHORA);
    expect(e?.esperaSegundos).toBe(125);
  });

  it('la de un evento de equipo cuenta desde la RECEPCIÓN, no desde el reloj del equipo', () => {
    const [e] = construirCola(material([], [deEquipo('ll', 42, 'llamada')]), AHORA);
    expect(e?.esperaSegundos).toBe(42);
  });

  it('un evento del futuro no produce una espera negativa', () => {
    const [e] = construirCola(material([acceso('x', -40, 'PLACA_DESCONOCIDA')]), AHORA);
    expect(e?.esperaSegundos).toBe(0);
  });

  it('se marca demorado justo en el umbral', () => {
    const en = (s: number): boolean | undefined =>
      construirCola(material([acceso('x', s, 'PLACA_DESCONOCIDA')]), AHORA)[0]?.demorado;
    expect(en(UMBRAL_DE_DEMORA_SEGUNDOS - 1)).toBe(false);
    expect(en(UMBRAL_DE_DEMORA_SEGUNDOS)).toBe(true);
  });
});

describe('urgencia', () => {
  it('lista negra y dudoso son críticos; llamada, rostro y placa no', () => {
    expect(urgenciaDe('lista_negra')).toBe('critica');
    expect(urgenciaDe('dudoso')).toBe('critica');
    for (const d of ['llamada', 'rostro', 'placa'] as const) expect(urgenciaDe(d)).toBe('normal');
  });
});

describe('resumen para la cabecera', () => {
  it('cuenta total, críticos y la espera máxima', () => {
    const cola = construirCola(
      material([
        acceso('a', 10, 'PLACA_DESCONOCIDA'),
        acceso('b', 240, 'LISTA_NEGRA'),
        acceso('c', 30, 'PLACA_DESCONOCIDA'),
      ]),
      AHORA,
    );
    expect(resumenDeCola(cola)).toEqual({ total: 3, criticos: 1, esperaMaxima: 240 });
  });

  it('una cola vacía no da NaN', () => {
    expect(resumenDeCola([])).toEqual({ total: 0, criticos: 0, esperaMaxima: 0 });
  });
});
