import { describe, expect, it } from 'vitest';
import {
  fechaYHoraEnZona,
  finDelDiaEnZona,
  inicioDelDiaEnZona,
  instanteDeLocal,
  localEnZona,
} from '@/lib/hora-en-zona';
import {
  SIN_FILTROS,
  filtrosDeAcceso,
  filtrosDeLaUrl,
  hayFiltros,
  placaParaBuscar,
  rangoDeLaVista,
  urlDeExportacion,
  urlDeFiltros,
} from './filtros';

/**
 * D-145 · el corte del portero y el buscador, en funciones puras.
 *
 * El instante de referencia es las 22:30 del 25/10 en Bogotá, que son las 03:30
 * del 26/10 en UTC: un corte calculado en UTC daría el día equivocado.
 */
const AHORA = new Date('2026-10-26T03:30:00.000Z');
const INICIO_25 = '2026-10-25T05:00:00.000Z';
const INICIO_26 = '2026-10-26T05:00:00.000Z';
const OPERADOR = '00000000-0000-4000-8000-000000000010';

describe('D-145 · la hora de Bogotá, no la del navegador', () => {
  it('el día es el de Bogotá aunque en UTC ya sea mañana', () => {
    expect(inicioDelDiaEnZona(AHORA).toISOString()).toBe(INICIO_25);
    expect(finDelDiaEnZona(AHORA).toISOString()).toBe(INICIO_26);
    expect(localEnZona(AHORA)).toBe('2026-10-25T22:30');
    expect(fechaYHoraEnZona(AHORA)).toBe('25-10-2026 22:30:00');
  });

  it('una hora escrita en Bogotá es ese instante (UTC−5), y lo que no es hora, nada', () => {
    expect(instanteDeLocal('2026-10-20T08:15')?.toISOString()).toBe('2026-10-20T13:15:00.000Z');
    expect(instanteDeLocal('2026-10-20')).toBeNull();
    expect(instanteDeLocal('2026-13-20T08:15')).toBeNull();
    expect(fechaYHoraEnZona('no-es-fecha')).toBe('—');
  });
});

describe('D-145 · el rango que ve cada rol', () => {
  it('el portero sin filtros ve su día de Bogotá: la vista del día', () => {
    const r = rangoDeLaVista(SIN_FILTROS, { delPortero: true, limpiadoEn: null }, AHORA);
    expect([r.desde.toISOString(), r.hasta.toISOString()]).toEqual([INICIO_25, INICIO_26]);
    expect(r.delDia).toBe(true);
  });

  it('D-146 · el portero que pone fechas ve el rango que pidió, días anteriores incluidos', () => {
    const f = { ...SIN_FILTROS, desde: '2026-10-22T00:00' };
    const r = rangoDeLaVista(f, { delPortero: true, limpiadoEn: null }, AHORA);
    expect([r.desde.toISOString(), r.hasta.toISOString()]).toEqual([
      '2026-10-22T05:00:00.000Z',
      INICIO_26,
    ]);
    expect(r.delDia).toBe(false);
  });

  it('D-146 · «Limpiar» no recorta una búsqueda, tampoco una sin fechas', () => {
    const limpio = new Date('2026-10-26T03:00:00.000Z');
    const conFechas = rangoDeLaVista(
      { ...SIN_FILTROS, desde: '2026-10-25T06:00' },
      { delPortero: true, limpiadoEn: limpio },
      AHORA,
    );
    expect(conFechas.desde.toISOString()).toBe('2026-10-25T11:00:00.000Z');
    // Sólo con un filtro, sin fechas: lo mismo que la administración, 7 días.
    const soloPlaca = rangoDeLaVista(
      { ...SIN_FILTROS, placa: 'ABC123' },
      { delPortero: true, limpiadoEn: limpio },
      AHORA,
    );
    expect(soloPlaca.desde.toISOString()).toBe('2026-10-18T05:00:00.000Z');
    expect(soloPlaca.delDia).toBe(false);
  });

  it('tras «Limpiar», desde ese instante; un «Limpiar» de ayer ya no cuenta', () => {
    const limpio = new Date('2026-10-26T01:00:00.000Z');
    const hoy = rangoDeLaVista(SIN_FILTROS, { delPortero: true, limpiadoEn: limpio }, AHORA);
    expect(hoy.desde).toEqual(limpio);
    const ayer = new Date('2026-10-24T20:00:00.000Z');
    const otro = rangoDeLaVista(SIN_FILTROS, { delPortero: true, limpiadoEn: ayer }, AHORA);
    expect(otro.desde.toISOString()).toBe(INICIO_25);
  });

  it('la administración no tiene corte: lo que pida, y por omisión 7 días', () => {
    const porOmision = rangoDeLaVista(SIN_FILTROS, { delPortero: false, limpiadoEn: null }, AHORA);
    expect(porOmision.desde.toISOString()).toBe('2026-10-18T05:00:00.000Z');
    expect(porOmision.hasta.toISOString()).toBe(INICIO_26);
    const pedido = rangoDeLaVista(
      { ...SIN_FILTROS, desde: '2025-01-01T06:00', hasta: '2025-01-01T06:59' },
      { delPortero: false, limpiadoEn: null },
      AHORA,
    );
    expect(pedido.desde.toISOString()).toBe('2025-01-01T11:00:00.000Z');
    // `hasta` incluye el minuto escrito entero.
    expect(pedido.hasta.toISOString()).toBe('2025-01-01T12:00:00.000Z');
  });

  it('fechas al revés: lo de por omisión, y se avisa', () => {
    const r = rangoDeLaVista(
      { ...SIN_FILTROS, desde: '2026-10-20T10:00', hasta: '2026-10-19T10:00' },
      { delPortero: false, limpiadoEn: null },
      AHORA,
    );
    expect(r.ajustado).toBe(true);
    expect(r.desde.toISOString()).toBe('2026-10-18T05:00:00.000Z');
  });
});

describe('D-145 · los filtros en la URL y en la consulta', () => {
  it('ida y vuelta por la URL, y lo que no es lo que dice ser se descarta', () => {
    const f = filtrosDeLaUrl(
      `placa=abc-123&metodo=facial&identificacion=desconocida&operadorId=${OPERADOR}` +
        '&resultado=negado&motivo=LISTA_NEGRA&desde=2026-10-20T08:15',
    );
    expect(f).toMatchObject({
      placa: 'abc-123',
      metodo: 'facial',
      identificacion: 'desconocida',
      operadorId: OPERADOR,
      resultado: 'negado',
      motivo: 'LISTA_NEGRA',
      desde: '2026-10-20T08:15',
    });
    expect(filtrosDeLaUrl(urlDeFiltros(f))).toEqual(f);
    const malos = filtrosDeLaUrl(
      'operadorId=1%20OR%201=1&metodo=pie&motivo=INVENTADO&desde=ayer&viviendaId=x',
    );
    expect(malos).toEqual(SIN_FILTROS);
    expect(urlDeFiltros(SIN_FILTROS)).toBe('');
    expect(hayFiltros(SIN_FILTROS)).toBe(false);
  });

  it('la placa se normaliza como en el dominio, y a medio escribir no se pide', () => {
    expect(placaParaBuscar('abc-123')).toBe('ABC123');
    expect(placaParaBuscar(' a.b c_1 2 3 ')).toBe('ABC123');
    expect(placaParaBuscar('ab')).toBeNull();
    const f = { ...SIN_FILTROS, placa: 'ab' };
    expect(filtrosDeAcceso(f)).toEqual({});
  });

  it('la exportación lleva el mismo rango y los mismos filtros de acceso', () => {
    const f = { ...SIN_FILTROS, placa: 'abc-123', operadorId: OPERADOR, tipo: 'timbre' };
    const url = new URL(
      urlDeExportacion('cop', { desde: new Date(INICIO_25), hasta: new Date(INICIO_26) }, f, 'csv'),
      'http://x',
    );
    expect(url.pathname).toBe('/api/ncr/copropiedades/cop/eventos/exportacion');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      desde: INICIO_25,
      hasta: INICIO_26,
      formato: 'csv',
      placa: 'ABC123',
      operadorId: OPERADOR,
    });
  });
});
