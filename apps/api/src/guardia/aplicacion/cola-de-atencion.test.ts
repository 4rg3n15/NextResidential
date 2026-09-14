import { describe, expect, it } from 'vitest';
import {
  UMBRAL_DE_DEMORA_SEGUNDOS,
  construirCola,
  resumenDeCola,
  urgenciaDe,
} from './cola-de-atencion';
import type { EventoRegistrado } from '../../eventos';

/**
 * CU-03 · lo que esta cola impide es dejar a alguien en la calle.
 *
 * Una bandeja ordenada por recencia hunde al que lleva más tiempo esperando
 * cada vez que llega otro. No da error, no rompe nada, y el operador atiende
 * siempre al último en llegar.
 */
const AHORA = new Date(Date.UTC(2026, 8, 13, 12, 0, 0));

const evento = (id: string, haceSegundos: number, motivo: string | null): EventoRegistrado =>
  ({
    id,
    copropiedadId: 'cop-a',
    ocurridoEn: new Date(AHORA.getTime() - haceSegundos * 1000),
    tipo: 'ingreso',
    resultado: motivo === null ? 'permitido' : 'negado',
    motivo,
    metodo: 'intercom',
    personaId: null,
    viviendaId: 'viv-1',
    zonaId: null,
    dispositivoId: 'disp-1',
    placaDetectada: null,
    confianza: null,
    reglaAplicada: 'r',
    versionReglas: 1,
  }) as unknown as EventoRegistrado;

describe('orden de la cola', () => {
  it('lo que lleva MÁS tiempo esperando va primero, no lo más reciente', () => {
    const cola = construirCola([evento('nuevo', 5, null), evento('viejo', 300, null)], AHORA);
    expect(cola.map((e) => e.evento.id)).toEqual(['viejo', 'nuevo']);
  });

  it('lo crítico se adelanta aunque lleve menos tiempo', () => {
    // Un sabotaje o una lista negra no se atienden «cuando toque».
    const cola = construirCola(
      [evento('espera-larga', 300, null), evento('lista-negra', 5, 'LISTA_NEGRA')],
      AHORA,
    );
    expect(cola[0]?.evento.id).toBe('lista-negra');
  });

  it('entre dos críticos manda la antigüedad', () => {
    const cola = construirCola(
      [evento('c-nuevo', 10, 'LISTA_NEGRA'), evento('c-viejo', 200, 'FALLO_TECNICO')],
      AHORA,
    );
    expect(cola.map((e) => e.evento.id)).toEqual(['c-viejo', 'c-nuevo']);
  });

  it('no muta la lista que recibe', () => {
    const entrada = [evento('a', 5, null), evento('b', 300, null)];
    construirCola(entrada, AHORA);
    expect(entrada.map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('espera y demora', () => {
  it('la espera se CALCULA con el instante inyectado, no se guarda', () => {
    expect(construirCola([evento('x', 125, null)], AHORA)[0]?.esperaSegundos).toBe(125);
  });

  it('un evento del futuro no produce una espera negativa', () => {
    // Un reloj adelantado en el dispositivo lo produce, y una espera de −40 s
    // en pantalla es peor que un cero.
    expect(construirCola([evento('x', -40, null)], AHORA)[0]?.esperaSegundos).toBe(0);
  });

  it('se marca demorado justo en el umbral', () => {
    expect(
      construirCola([evento('x', UMBRAL_DE_DEMORA_SEGUNDOS - 1, null)], AHORA)[0]?.demorado,
    ).toBe(false);
    expect(construirCola([evento('x', UMBRAL_DE_DEMORA_SEGUNDOS, null)], AHORA)[0]?.demorado).toBe(
      true,
    );
  });
});

describe('urgencia', () => {
  it('los tres motivos de riesgo son críticos', () => {
    for (const m of ['LISTA_NEGRA', 'CONFIANZA_INSUFICIENTE', 'FALLO_TECNICO']) {
      expect(urgenciaDe(evento('x', 1, m))).toBe('critica');
    }
  });

  it('una espera normal no lo es', () => {
    expect(urgenciaDe(evento('x', 1, null))).toBe('normal');
    expect(urgenciaDe(evento('x', 1, 'VIGENCIA_EXPIRADA'))).toBe('normal');
  });
});

describe('resumen para la cabecera', () => {
  it('cuenta total, críticos y la espera máxima', () => {
    const cola = construirCola(
      [evento('a', 10, null), evento('b', 240, 'LISTA_NEGRA'), evento('c', 30, null)],
      AHORA,
    );
    expect(resumenDeCola(cola)).toEqual({ total: 3, criticos: 1, esperaMaxima: 240 });
  });

  it('una cola vacía no da NaN', () => {
    expect(resumenDeCola([])).toEqual({ total: 0, criticos: 0, esperaMaxima: 0 });
  });
});
