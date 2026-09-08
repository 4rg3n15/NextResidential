import { describe, expect, it } from 'vitest';
import { esExito, esFallo } from '../compartido/resultado';
import { CalidadDeCaptura, UMBRALES_POR_DEFECTO, evaluarCaptura } from './calidad-captura';
import type { MedidasDeCaptura } from './calidad-captura';

const buena: MedidasDeCaptura = {
  rostrosDetectados: 1,
  nitidez: 0.85,
  iluminacion: 0.6,
  proporcionRostro: 0.4,
};

describe('evaluarCaptura · CA-08, HU-13, KPI-16', () => {
  it('una captura buena se acepta y trae su calidad', () => {
    const r = evaluarCaptura(buena);
    expect(r.aceptada).toBe(true);
    if (r.aceptada) expect(r.calidad.valor).toBeCloseTo(0.617, 3);
  });

  it('sin rostro no hay plantilla', () => {
    const r = evaluarCaptura({ ...buena, rostrosDetectados: 0 });
    expect(r).toMatchObject({ aceptada: false });
    if (!r.aceptada) expect(r.motivos).toContain('SIN_ROSTRO');
  });

  it('dos rostros tampoco: no se sabría de quién es el dato', () => {
    const r = evaluarCaptura({ ...buena, rostrosDetectados: 2 });
    if (!r.aceptada) expect(r.motivos).toContain('ROSTROS_MULTIPLES');
    else throw new Error('debía rechazarse');
  });

  it('devuelve TODOS los motivos, no el primero', () => {
    // Si devolviera uno, el visitante repetiría la foto una vez por defecto.
    const r = evaluarCaptura({
      rostrosDetectados: 0,
      nitidez: 0.1,
      iluminacion: 0.02,
      proporcionRostro: 0.01,
    });
    if (r.aceptada) throw new Error('debía rechazarse');
    expect([...r.motivos].sort()).toEqual(
      ['ENCUADRE', 'ILUMINACION', 'NITIDEZ', 'SIN_ROSTRO'].sort(),
    );
  });

  it('la iluminación se rechaza por exceso, no solo por defecto', () => {
    const oscura = evaluarCaptura({ ...buena, iluminacion: 0.1 });
    const quemada = evaluarCaptura({ ...buena, iluminacion: 0.99 });
    for (const r of [oscura, quemada]) {
      if (r.aceptada) throw new Error('debía rechazarse');
      expect(r.motivos).toContain('ILUMINACION');
    }
  });

  it('el encuadre se rechaza por lejos y por demasiado cerca', () => {
    const lejos = evaluarCaptura({ ...buena, proporcionRostro: 0.05 });
    const cerca = evaluarCaptura({ ...buena, proporcionRostro: 0.95 });
    for (const r of [lejos, cerca]) {
      if (r.aceptada) throw new Error('debía rechazarse');
      expect(r.motivos).toContain('ENCUADRE');
    }
  });

  it('en el límite exacto se acepta: el umbral es inclusivo', () => {
    const limite = evaluarCaptura({
      rostrosDetectados: 1,
      nitidez: UMBRALES_POR_DEFECTO.nitidezMinima,
      iluminacion: UMBRALES_POR_DEFECTO.iluminacionMinima,
      proporcionRostro: UMBRALES_POR_DEFECTO.proporcionRostroMinima,
    });
    expect(limite.aceptada).toBe(true);
  });

  it('justo por debajo del umbral se rechaza', () => {
    const r = evaluarCaptura({ ...buena, nitidez: UMBRALES_POR_DEFECTO.nitidezMinima - 0.001 });
    if (r.aceptada) throw new Error('debía rechazarse');
    expect(r.motivos).toEqual(['NITIDEZ']);
  });

  it('los umbrales se pueden inyectar: no todo equipo de captura es igual', () => {
    const permisivos = { ...UMBRALES_POR_DEFECTO, nitidezMinima: 0.1 };
    const medidas = { ...buena, nitidez: 0.2 };
    expect(evaluarCaptura(medidas).aceptada).toBe(false);
    expect(evaluarCaptura(medidas, permisivos).aceptada).toBe(true);
  });

  it('es pura: la misma entrada da el mismo resultado y no muta nada', () => {
    const medidas = { ...buena };
    expect(evaluarCaptura(medidas)).toEqual(evaluarCaptura(medidas));
    expect(medidas).toEqual(buena);
  });
});

describe('CalidadDeCaptura', () => {
  it('vive en [0, 1]', () => {
    expect(esFallo(CalidadDeCaptura.crear(-0.1))).toBe(true);
    expect(esFallo(CalidadDeCaptura.crear(1.1))).toBe(true);
    expect(esExito(CalidadDeCaptura.crear(0))).toBe(true);
    expect(esExito(CalidadDeCaptura.crear(1))).toBe(true);
  });

  it('redondea a tres decimales, como el numeric(4,3) de la tabla', () => {
    const r = CalidadDeCaptura.crear(0.9123456);
    if (!esExito(r)) throw new Error('debía aceptarse');
    expect(r.valor.valor).toBe(0.912);
  });

  it('rechaza lo que no es número finito', () => {
    expect(esFallo(CalidadDeCaptura.crear(Number.NaN))).toBe(true);
    expect(esFallo(CalidadDeCaptura.crear(Number.POSITIVE_INFINITY))).toBe(true);
  });

  it('es inmutable', () => {
    const r = CalidadDeCaptura.crear(0.5);
    if (esExito(r)) expect(Object.isFrozen(r.valor)).toBe(true);
  });
});
