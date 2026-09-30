import { describe, expect, it } from 'vitest';
import type { EnAtencion, PreferenciasDeAtencion } from '@ncr/contracts';
import {
  aQuienAtender,
  actualizarVistos,
  debeSonar,
  enEspera,
  nuevos,
  rutaParaAtender,
} from './seleccion';

const elemento = (
  eventoId: string,
  disparador: EnAtencion['disparador'] = 'llamada',
  dispositivoId = 'd-1',
): EnAtencion => ({
  eventoId,
  origen: 'equipo',
  disparador,
  titulo: 't',
  ocurridoEn: '2026-09-30T12:00:00.000Z',
  motivo: null,
  resultado: null,
  dispositivoId,
  viviendaId: null,
  placaDetectada: null,
  conEvidencia: false,
  esperaSegundos: 5,
  urgencia: 'normal',
  demorado: false,
});

const todas = (abrir: boolean, sonar: boolean): PreferenciasDeAtencion => ({
  llamada: { abrir, sonar },
  rostro: { abrir, sonar },
  placa: { abrir, sonar },
  lista_negra: { abrir, sonar },
  dudoso: { abrir, sonar },
});

describe('G2 · quién pasa solo a «Atención»', () => {
  it('sin atender a nadie, el primero de la cola pasa solo', () => {
    expect(aQuienAtender(null, [elemento('a'), elemento('b')], todas(true, true))?.eventoId).toBe(
      'a',
    );
  });

  it('atendiendo a alguien que sigue en la cola, NO se le quita la pantalla', () => {
    // La cola reordena (llega algo crítico delante) y el operador sigue con el suyo.
    const cola = [elemento('critico', 'lista_negra'), elemento('mio')];
    expect(aQuienAtender('mio', cola, todas(true, true))?.eventoId).toBe('mio');
  });

  it('cuando el atendido sale de la cola, pasa solo el siguiente', () => {
    expect(aQuienAtender('ya-no-esta', [elemento('b')], todas(true, true))?.eventoId).toBe('b');
  });

  it('un disparador con la apertura automática apagada no se abre solo', () => {
    const p = { ...todas(true, true), placa: { abrir: false, sonar: true } };
    expect(aQuienAtender(null, [elemento('p', 'placa')], p)).toBeUndefined();
    expect(aQuienAtender(null, [elemento('p', 'placa'), elemento('l')], p)?.eventoId).toBe('l');
  });

  it('sin preferencias cargadas, todo se abre (valores por omisión)', () => {
    expect(aQuienAtender(null, [elemento('a')], undefined)?.eventoId).toBe('a');
  });

  it('el contador cuenta los que esperan, sin el atendido', () => {
    const cola = [elemento('a'), elemento('b'), elemento('c')];
    expect(enEspera(cola, cola[1])).toBe(2);
    expect(enEspera(cola, undefined)).toBe(3);
  });
});

describe('G2 · qué suena', () => {
  it('suena una vez por elemento nuevo: lo ya visto no vuelve a sonar', () => {
    const cola = [elemento('a'), elemento('b')];
    const recien = nuevos(new Set(['a']), cola);
    expect(recien.map((e) => e.eventoId)).toEqual(['b']);
    expect(debeSonar(recien, todas(true, true))).toBe(true);
    expect(debeSonar(nuevos(actualizarVistos(cola), cola), todas(true, true))).toBe(false);
  });

  it('con el sonido de ese disparador apagado, no suena', () => {
    const p = { ...todas(true, true), llamada: { abrir: true, sonar: false } };
    expect(debeSonar([elemento('a', 'llamada')], p)).toBe(false);
    expect(debeSonar([elemento('a', 'llamada'), elemento('b', 'rostro')], p)).toBe(true);
  });
});

describe('«Atender» desde otra pantalla', () => {
  it('lleva a Guardia con el elemento, y al portero a su Portería', () => {
    expect(rutaParaAtender('operador_central', 'e 1')).toBe('/guardia?atender=e%201');
    expect(rutaParaAtender('portero', 'e1')).toBe('/porteria?atender=e1');
  });
});
