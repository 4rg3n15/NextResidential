import { describe, expect, it } from 'vitest';
import { decisionLocal, horaDePared, leerPersona, negadoEnLocal } from './personas-simuladas';
import { inspeccionarFoto } from '../terminal/foto-del-rostro';

/**
 * A2 (15-L) · las reglas con que la terminal simulada acepta a una persona y
 * decide en local, y la lectura de las medidas de una foto por su cabecera.
 * Cada caso es una rama que, sin probar, dejaría al simulado aceptando lo que
 * la guía rechaza.
 */
const persona = (info: Record<string, unknown>): string => JSON.stringify({ UserInfo: info });
const BASE = { employeeNo: 'p1', userType: 'visitor', Valid: { enable: false } };
const VALIDA = {
  enable: true,
  beginTime: '2026-09-27T09:00:00',
  endTime: '2026-09-27T12:59:59',
  timeType: 'local',
};

describe('leerPersona · lo que la guía rechaza, el simulado también', () => {
  it.each([
    ['un cuerpo que no es JSON', 'no-json'],
    ['sin UserInfo', JSON.stringify({ Otra: {} })],
    ['employeeNo vacío', persona({ ...BASE, employeeNo: '' })],
    ['employeeNo de más de 32', persona({ ...BASE, employeeNo: 'x'.repeat(33) })],
    ['userType fuera del enumerado', persona({ ...BASE, userType: 'residente' })],
    ['sin Valid', persona({ employeeNo: 'p1', userType: 'normal' })],
    ['Valid sin enable', persona({ ...BASE, Valid: {} })],
    ['vigencia en UTC', persona({ ...BASE, Valid: { ...VALIDA, timeType: 'UTC' } })],
    [
      'vigencia sin fin',
      persona({ ...BASE, Valid: { enable: true, beginTime: VALIDA.beginTime } }),
    ],
    [
      'fin antes que el comienzo',
      persona({ ...BASE, Valid: { ...VALIDA, endTime: '2026-09-27T08:00:00' } }),
    ],
    [
      'fuera del rango del equipo',
      persona({ ...BASE, Valid: { ...VALIDA, endTime: '2040-01-01T00:00:00' } }),
    ],
    ['doorRight que no es una lista de números', persona({ ...BASE, doorRight: 'puerta 1' })],
    ['doorRight que no es texto', persona({ ...BASE, doorRight: 1 })],
  ])('%s → rechazada', (_caso, cuerpo) => {
    expect(leerPersona(cuerpo)).toBeNull();
  });

  it('un registro correcto, con varias puertas', () => {
    expect(leerPersona(persona({ ...BASE, Valid: VALIDA, doorRight: '1,3' }))).toEqual({
      id: 'p1',
      persona: {
        tipo: 'visitor',
        desde: '2026-09-27T09:00:00',
        hasta: '2026-09-27T12:59:59',
        puertas: [1, 3],
      },
    });
  });
});

describe('decisionLocal · lo que la terminal resuelve sin preguntar', () => {
  const visitante = {
    tipo: 'visitor' as const,
    desde: '2026-09-27T09:00:00',
    hasta: '2026-09-27T12:59:59',
    puertas: [1],
  };

  it('sin persona registrada, pregunta (como antes de la 15-L)', () => {
    expect(decisionLocal(undefined, '2026-09-27T10:00:00', 1)).toBe('pregunta');
  });

  it('antes y después de la vigencia niega; dentro, pregunta', () => {
    expect(decisionLocal(visitante, '2026-09-27T08:59:59', 1)).toBe('fuera_de_vigencia');
    expect(decisionLocal(visitante, '2026-09-27T13:00:00', 1)).toBe('fuera_de_vigencia');
    expect(decisionLocal(visitante, '2026-09-27T12:59:59', 1)).toBe('pregunta');
  });

  it('sin hora legible no se inventa una: decide la puerta', () => {
    expect(decisionLocal(visitante, null, 1)).toBe('pregunta');
  });

  it('otra puerta: sin permiso; sin puertas declaradas: no se exige', () => {
    expect(decisionLocal(visitante, '2026-09-27T10:00:00', 2)).toBe('sin_permiso_de_puerta');
    expect(decisionLocal({ ...visitante, puertas: [] }, '2026-09-27T10:00:00', 2)).toBe('pregunta');
  });
});

describe('horaDePared y el bloque negado', () => {
  it('hora local tal cual; con desfase o en UTC, a la zona del equipo; lo demás, nada', () => {
    expect(horaDePared('2026-09-27T10:00:00', 'America/Bogota')).toBe('2026-09-27T10:00:00');
    expect(horaDePared('2026-09-27T15:00:00Z', 'America/Bogota')).toBe('2026-09-27T10:00:00');
    expect(horaDePared('ayer', 'America/Bogota')).toBeNull();
    expect(horaDePared(1_700_000_000, 'America/Bogota')).toBeNull();
  });

  it('el bloque negado no pregunta y dice «rostro no autenticado» (5/76)', () => {
    expect(negadoEnLocal({ eventType: 'x' })).toEqual({
      eventType: 'x',
      AccessControllerEvent: { majorEventType: 5, subEventType: 76 },
    });
  });
});

describe('las medidas de un JPEG, marcador a marcador', () => {
  const jpeg = (...bytes: number[]): Uint8Array => new Uint8Array([0xff, 0xd8, ...bytes]);
  const SOF = (marcador: number) => [0xff, marcador, 0x00, 0x0b, 0x08, 0x00, 0x10, 0x00, 0x20];

  it('salta el relleno, los marcadores sin longitud y las tablas', () => {
    expect(inspeccionarFoto(jpeg(0xff, ...SOF(0xc0)))).toMatchObject({ ancho: 32, alto: 16 });
    expect(inspeccionarFoto(jpeg(0xff, 0xd0, ...SOF(0xc0)))).toMatchObject({ ancho: 32 });
    expect(inspeccionarFoto(jpeg(0xff, 0xc4, 0x00, 0x02, ...SOF(0xc2)))).toMatchObject({
      ancho: 32,
    });
  });

  it.each([
    ['los datos de imagen antes del cuadro', jpeg(0xff, 0xda, 0x00, 0x04, 0, 0)],
    ['una longitud rota', jpeg(0xff, 0xe0, 0x00, 0x01, 0, 0)],
    ['un byte que no es marcador', jpeg(0xff, 0xe0, 0x00, 0x02, 0x12, 0x34, 0, 0)],
    ['un cuadro cortado', jpeg(0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00)],
  ])('sin medidas legibles: %s', (_caso, foto) => {
    expect(inspeccionarFoto(foto)).toEqual({ formato: 'jpeg', ancho: null, alto: null });
  });
});
