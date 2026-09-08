import { describe, expect, it } from 'vitest';
import { FiltroDeEventos, RANGO_MAXIMO_DIAS, TAMANO_PAGINA_MAXIMO } from './filtro-eventos';
import type { CriteriosDeEventos } from './filtro-eventos';
import { esExito, esFallo } from '../compartido/resultado';
import type { Resultado } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';

const DESDE = new Date('2026-09-01T00:00:00Z');
const HASTA = new Date('2026-09-08T00:00:00Z');

const abrir = <T>(r: Resultado<T, ErrorDominio>): T => {
  if (!esExito(r)) throw new Error(`dato de prueba inválido: ${r.error.detalle}`);
  return r.valor;
};
const error = <T>(r: Resultado<T, ErrorDominio>): ErrorDominio => {
  if (!esFallo(r)) throw new Error('se esperaba un fallo');
  return r.error;
};

const criterios = (extra: Partial<CriteriosDeEventos> = {}): CriteriosDeEventos => ({
  copropiedadId: 'cop-1',
  desde: DESDE,
  hasta: HASTA,
  ...extra,
});

describe('FiltroDeEventos · HU-32, cubre el hueco D-05 del mockup', () => {
  it('acepta rango, vivienda, persona, dispositivo, zona, tipo, resultado y motivo', () => {
    const f = abrir(
      FiltroDeEventos.crear(
        criterios({
          viviendaId: 'viv-1',
          personaId: 'per-1',
          dispositivoId: 'disp-1',
          zonaId: 'zon-1',
          tipo: 'denegado',
          resultado: 'negado',
          motivo: 'LISTA_NEGRA',
        }),
      ),
    );
    expect(f.viviendaId).toBe('viv-1');
    expect(f.motivo).toBe('LISTA_NEGRA');
    expect(f.tipo).toBe('denegado');
  });

  it('los filtros no indicados quedan en null, no en undefined', () => {
    const f = abrir(FiltroDeEventos.crear(criterios()));
    expect(f.viviendaId).toBeNull();
    expect(f.cursor).toBeNull();
    expect(f.tamanoPagina).toBe(50);
  });

  it('copia las fechas', () => {
    const desde = new Date(DESDE.getTime());
    const f = abrir(FiltroDeEventos.crear(criterios({ desde })));
    desde.setFullYear(1999);
    expect(f.desde.getTime()).toBe(DESDE.getTime());
  });
});

describe('FiltroDeEventos · validación', () => {
  it('exige copropiedad (RN-15)', () => {
    expect(error(FiltroDeEventos.crear(criterios({ copropiedadId: '' }))).regla).toBe('RN-15');
  });

  it.each([
    ['desde', { desde: new Date('nada') }],
    ['hasta', { hasta: new Date('nada') }],
  ])('rechaza una fecha inválida en %s', (_c, extra) => {
    expect(error(FiltroDeEventos.crear(criterios(extra))).codigo).toBe('DATO_INVALIDO');
  });

  it('rechaza el rango invertido', () => {
    expect(
      error(FiltroDeEventos.crear(criterios({ desde: HASTA, hasta: DESDE }))).detalle,
    ).toContain('posterior');
  });

  it('rechaza un rango de duración cero', () => {
    expect(esFallo(FiltroDeEventos.crear(criterios({ hasta: DESDE })))).toBe(true);
  });

  it('rechaza un rango mayor que el máximo: la tabla está particionada por mes', () => {
    const hasta = new Date(DESDE.getTime() + (RANGO_MAXIMO_DIAS + 1) * 86_400_000);
    expect(error(FiltroDeEventos.crear(criterios({ hasta }))).detalle).toContain('días');
  });

  it('acepta el borde exacto del rango máximo', () => {
    const hasta = new Date(DESDE.getTime() + RANGO_MAXIMO_DIAS * 86_400_000);
    expect(esExito(FiltroDeEventos.crear(criterios({ hasta })))).toBe(true);
  });

  it.each([0, -1, 1.5, TAMANO_PAGINA_MAXIMO + 1])(
    'rechaza un tamaño de página de %s',
    (tamanoPagina) => {
      expect(esFallo(FiltroDeEventos.crear(criterios({ tamanoPagina })))).toBe(true);
    },
  );

  it('acepta el tamaño de página máximo', () => {
    const f = abrir(FiltroDeEventos.crear(criterios({ tamanoPagina: TAMANO_PAGINA_MAXIMO })));
    expect(f.tamanoPagina).toBe(TAMANO_PAGINA_MAXIMO);
  });

  it('el filtro está congelado', () => {
    const f = abrir(FiltroDeEventos.crear(criterios()));
    expect(() => {
      (f as unknown as Record<string, unknown>).copropiedadId = 'cop-2';
    }).toThrow();
  });
});
