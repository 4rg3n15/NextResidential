import { describe, expect, it } from 'vitest';
import { DIAS_PARA_RENOVAR, estadoDelRostro } from './estado-del-rostro';
import type { RostroLeido } from './estado-del-rostro';

/**
 * 15-X · D2 · lo que la app muestra de «Mi rostro», decidido sin E/S: con qué
 * plantilla viva hay, cuántos equipos la tienen y qué retiradas quedan.
 */
const AHORA = new Date('2026-10-08T12:00:00Z');
const DIA = 24 * 3600 * 1000;

const vivo = (p: Partial<RostroLeido> = {}): RostroLeido => ({
  plantilla: {
    plantillaId: 'pl-1',
    calidad: 0.91,
    registradoEn: new Date('2026-10-01T12:00:00Z'),
    venceEn: new Date(AHORA.getTime() + 300 * DIA),
  },
  equipos: [
    { nombre: 'Terminal portería', estado: 'sincronizada' },
    { nombre: 'Videoportero', estado: 'sincronizada' },
  ],
  retiradasPendientes: 0,
  ...p,
});

describe('15-X · D2 · el estado de mi rostro', () => {
  it('sin plantilla viva ni retiradas: sin_rostro', () => {
    expect(estadoDelRostro(vivo({ plantilla: null, equipos: [] }), AHORA).estado).toBe(
      'sin_rostro',
    );
  });

  it('sin plantilla viva y con equipos por retirarla: en_retiro', () => {
    expect(
      estadoDelRostro(vivo({ plantilla: null, equipos: [], retiradasPendientes: 1 }), AHORA).estado,
    ).toBe('en_retiro');
  });

  it('viva y en ningún equipo todavía: pendiente', () => {
    const r = vivo({
      equipos: [
        { nombre: 'Terminal', estado: 'pendiente' },
        { nombre: 'Videoportero', estado: 'fallida' },
      ],
    });
    expect(estadoDelRostro(r, AHORA).estado).toBe('pendiente');
  });

  it('sin equipos con rostros en la copropiedad también es pendiente, no activa', () => {
    expect(estadoDelRostro(vivo({ equipos: [] }), AHORA).estado).toBe('pendiente');
  });

  it('en algunos equipos sí y en otros no: parcial', () => {
    const r = vivo({
      equipos: [
        { nombre: 'Terminal', estado: 'sincronizada' },
        { nombre: 'Videoportero', estado: 'fallida' },
      ],
    });
    expect(estadoDelRostro(r, AHORA).estado).toBe('parcial');
  });

  it('en todos: activa', () => {
    expect(estadoDelRostro(vivo(), AHORA).estado).toBe('activa');
  });

  it(`a ${String(DIAS_PARA_RENOVAR)} días o menos del vencimiento: por_vencer, con los días`, () => {
    const justo = vivo({
      plantilla: {
        ...vivo().plantilla!,
        venceEn: new Date(AHORA.getTime() + DIAS_PARA_RENOVAR * DIA),
      },
    });
    const r = estadoDelRostro(justo, AHORA);
    expect(r.estado).toBe('por_vencer');
    expect(r.diasParaVencer).toBe(DIAS_PARA_RENOVAR);
    const unoMas = vivo({
      plantilla: {
        ...vivo().plantilla!,
        venceEn: new Date(AHORA.getTime() + (DIAS_PARA_RENOVAR + 1) * DIA),
      },
    });
    expect(estadoDelRostro(unoMas, AHORA).estado).toBe('activa');
  });

  it('los días para vencer se redondean hacia arriba y nunca bajan de cero', () => {
    const r = vivo({
      plantilla: { ...vivo().plantilla!, venceEn: new Date(AHORA.getTime() + DIA / 2) },
    });
    expect(estadoDelRostro(r, AHORA).diasParaVencer).toBe(1);
    const vencida = vivo({
      plantilla: { ...vivo().plantilla!, venceEn: new Date(AHORA.getTime() - DIA) },
    });
    expect(estadoDelRostro(vencida, AHORA).diasParaVencer).toBe(0);
  });

  it('cuenta los equipos y nunca expone la imagen', () => {
    const r = estadoDelRostro(vivo(), AHORA);
    expect(r).toMatchObject({ equiposConRostro: 2, equiposConMiRostro: 2, calidad: 0.91 });
    expect(JSON.stringify(r)).not.toMatch(/vector|imagen|contenido|base64/i);
  });
});
