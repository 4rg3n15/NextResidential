import { describe, expect, it } from 'vitest';
import {
  DISPARADORES_CRITICOS,
  TIPOS_DE_EQUIPO_QUE_DISPARAN,
  descriptorDeAtencion,
  disparadorDeAcceso,
  disparadorDeEventoDeEquipo,
} from './disparadores-de-atencion';

/** G1 (15-N) · P-22: qué necesita a una persona, clasificado igual para la cola y la alerta. */
describe('disparadorDeAcceso', () => {
  const negado = (motivo: string, metodo: string) =>
    disparadorDeAcceso({ resultado: 'negado', motivo, metodo });

  it('un permitido no dispara nunca, ni siquiera con motivo', () => {
    expect(
      disparadorDeAcceso({ resultado: 'permitido', motivo: null, metodo: 'placa' }),
    ).toBeNull();
  });

  it('la lista negra manda sobre el método', () => {
    expect(negado('LISTA_NEGRA', 'placa')).toBe('lista_negra');
    expect(negado('LISTA_NEGRA', 'facial')).toBe('lista_negra');
  });

  it('lo que el motor no pudo decidir es «dudoso», con placa o con rostro', () => {
    expect(negado('CONFIANZA_INSUFICIENTE', 'placa')).toBe('dudoso');
    expect(negado('FALLO_TECNICO', 'facial')).toBe('dudoso');
  });

  it('placa no registrada o sin autorización vigente: «placa»', () => {
    for (const m of ['PLACA_DESCONOCIDA', 'VIGENCIA_EXPIRADA', 'FUERA_DE_PATRON']) {
      expect(negado(m, 'placa')).toBe('placa');
    }
  });

  it('persona no autorizada, permiso vencido incluido: «rostro»', () => {
    for (const m of [
      'VIGENCIA_EXPIRADA',
      'FUERA_DE_HORARIO',
      'ZONA_NO_AUTORIZADA',
      'SIN_CONSENTIMIENTO',
    ]) {
      expect(negado(m, 'facial')).toBe('rostro');
    }
  });

  it('ni la negación manual ni la tarjeta disparan', () => {
    expect(negado('LISTA_NEGRA', 'manual')).toBeNull();
    expect(negado('VIGENCIA_EXPIRADA', 'tarjeta')).toBeNull();
  });
});

describe('disparadorDeEventoDeEquipo', () => {
  const ev = (
    tipo: string,
    extra: Partial<{
      enVivo: boolean;
      origen: 'equipo' | 'plataforma';
      eventoId: string | null;
    }> = {},
  ) =>
    disparadorDeEventoDeEquipo({ tipo, enVivo: true, origen: 'equipo', eventoId: null, ...extra });

  it('llamada y timbre son la llamada', () => {
    expect(ev('llamada')).toBe('llamada');
    expect(ev('timbre')).toBe('llamada');
  });

  it('rostro no reconocido y negación del propio equipo son «rostro»', () => {
    expect(ev('rostro_no_reconocido')).toBe('rostro');
    expect(ev('acceso_negado_por_el_equipo')).toBe('rostro');
  });

  it('el histórico, lo que emite la plataforma y lo que acompaña a un acceso no disparan', () => {
    expect(ev('llamada', { enVivo: false })).toBeNull();
    expect(ev('llamada', { origen: 'plataforma' })).toBeNull();
    expect(ev('rostro_no_reconocido', { eventoId: 'acc-1' })).toBeNull();
  });

  it('un tipo sin catalogar como disparador no dispara', () => {
    expect(ev('puerta_abierta')).toBeNull();
    expect(TIPOS_DE_EQUIPO_QUE_DISPARAN).not.toContain('puerta_abierta');
  });
});

describe('criticidad y alerta', () => {
  it('sólo lista negra y dudoso son críticos', () => {
    expect([...DISPARADORES_CRITICOS].sort()).toEqual(['dudoso', 'lista_negra']);
  });

  it('el descriptor sólo cubre lo que el dominio no alerta: rostro y placa', () => {
    expect(
      descriptorDeAtencion({ resultado: 'negado', motivo: 'VIGENCIA_EXPIRADA', metodo: 'placa' }),
    ).toEqual({
      tipo: 'acceso_dudoso',
      severidad: 'media',
      porQue: 'placa sin autorización vigente (VIGENCIA_EXPIRADA)',
    });
    expect(
      descriptorDeAtencion({ resultado: 'negado', motivo: 'FUERA_DE_HORARIO', metodo: 'facial' })
        ?.porQue,
    ).toBe('persona no autorizada en la puerta (FUERA_DE_HORARIO)');
    expect(
      descriptorDeAtencion({ resultado: 'negado', motivo: 'LISTA_NEGRA', metodo: 'placa' }),
    ).toBeNull();
    expect(
      descriptorDeAtencion({ resultado: 'permitido', motivo: null, metodo: 'placa' }),
    ).toBeNull();
  });
});
