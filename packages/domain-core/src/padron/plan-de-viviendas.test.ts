import { describe, expect, it } from 'vitest';
import {
  COTAS,
  agruparParaVistaPrevia,
  generarPlan,
  nombreDeAgrupacion,
} from './plan-de-viviendas';
import type { PlanDeGeneracion, ViviendaProyectada } from './plan-de-viviendas';

/**
 * El generador es puro, así que se prueba sin nada: ni base, ni reloj, ni
 * dobles. Lo que se comprueba no es que «devuelva algo», sino los números
 * exactos que el usuario describió en el encargo — porque el defecto que este
 * trabajo corrige era precisamente que el sistema producía otra cosa.
 */
const ok = (plan: PlanDeGeneracion): readonly ViviendaProyectada[] => {
  const r = generarPlan(plan);
  if (!r.ok) throw new Error(`se esperaba éxito y falló: ${r.error.detalle}`);
  return r.valor;
};

const mal = (plan: PlanDeGeneracion): string => {
  const r = generarPlan(plan);
  if (r.ok) throw new Error('se esperaba un rechazo y el plan se aceptó');
  return r.error.detalle;
};

const comoTexto = (v: readonly ViviendaProyectada[]): string[] =>
  v.map((x) => `${x.agrupacion ?? '—'}/${x.identificador}`);

describe('apartamentos · piso + número en decena', () => {
  it('3 por piso y 5 pisos dan 101…503, en ese orden', () => {
    const v = ok({
      tipo: 'apartamentos',
      agrupaciones: 1,
      estilo: 'numeros',
      pisos: 5,
      porPiso: 3,
    });
    expect(v).toHaveLength(15);
    expect(comoTexto(v).slice(0, 4)).toEqual(['1/101', '1/102', '1/103', '1/201']);
    expect(comoTexto(v).slice(-1)).toEqual(['1/503']);
  });

  it('con más de 10 por piso llega a 111, no salta a 201', () => {
    const v = ok({
      tipo: 'apartamentos',
      agrupaciones: 1,
      estilo: 'numeros',
      pisos: 1,
      porPiso: 11,
    });
    expect(v.map((x) => x.identificador)).toEqual([
      '101',
      '102',
      '103',
      '104',
      '105',
      '106',
      '107',
      '108',
      '109',
      '110',
      '111',
    ]);
  });

  it('el mismo número en dos torres NO es un duplicado: es el caso normal', () => {
    // Es el hallazgo H-2 visto desde el dominio. Si esta prueba fallara, el
    // índice compuesto de la migración 0029 no tendría sentido.
    const v = ok({
      tipo: 'apartamentos',
      agrupaciones: 2,
      estilo: 'numeros',
      pisos: 1,
      porPiso: 1,
    });
    expect(comoTexto(v)).toEqual(['1/101', '2/101']);
  });

  it('las letras van en orden alfabético y los números de menor a mayor', () => {
    expect(nombreDeAgrupacion(0, 'letras')).toBe('A');
    expect(nombreDeAgrupacion(25, 'letras')).toBe('Z');
    expect(nombreDeAgrupacion(0, 'numeros')).toBe('1');
  });
});

describe('excepciones por agrupación · el conjunto real no es homogéneo', () => {
  const base = {
    tipo: 'apartamentos',
    agrupaciones: 3,
    estilo: 'letras',
    pisos: 5,
    porPiso: 3,
  } as const;

  it('la torre con excepción usa SUS medidas y las demás las generales', () => {
    const v = ok({ ...base, excepciones: [{ agrupacion: 'C', pisos: 3, porPiso: 3 }] });
    const porTorre = agruparParaVistaPrevia(v, ['C']);
    expect(porTorre.map((g) => [g.agrupacion, g.cantidad])).toEqual([
      ['A', 15],
      ['B', 15],
      ['C', 9],
    ]);
    expect(porTorre[2]?.ultimas).toEqual(['302', '303']);
    expect(porTorre[2]?.porExcepcion).toBe(true);
    expect(porTorre[0]?.porExcepcion).toBe(false);
  });

  it('una excepción sobre una torre inexistente se RECHAZA, no se ignora', () => {
    const detalle = mal({ ...base, excepciones: [{ agrupacion: 'G', pisos: 2, porPiso: 2 }] });
    expect(detalle).toMatch(/«G» no existe/);
    // El mensaje dice cuáles sí existen: sin eso, «no existe» obliga a adivinar.
    expect(detalle).toMatch(/de la A a la C/);
  });

  it('la misma torre dos veces se rechaza: si no, la última ganaría en silencio', () => {
    expect(
      mal({
        ...base,
        excepciones: [
          { agrupacion: 'B', pisos: 2, porPiso: 2 },
          { agrupacion: 'B', pisos: 4, porPiso: 4 },
        ],
      }),
    ).toMatch(/aparece dos veces/);
  });

  it('una excepción con 0 pisos se rechaza con su propio motivo', () => {
    expect(mal({ ...base, excepciones: [{ agrupacion: 'A', pisos: 0, porPiso: 3 }] })).toMatch(
      /no es una excepción/,
    );
  });
});

describe('casas · reparto uniforme y el resto en la última', () => {
  it('62 casas en 3 secciones dan 20 · 20 · 22', () => {
    const v = ok({ tipo: 'casas', secciones: 3, total: 62, reiniciarNumeracion: false });
    expect(agruparParaVistaPrevia(v).map((g) => g.cantidad)).toEqual([20, 20, 22]);
    expect(v).toHaveLength(62);
  });

  it('sin reiniciar, la numeración es corrida de 1 a 62', () => {
    const v = ok({ tipo: 'casas', secciones: 3, total: 62, reiniciarNumeracion: false });
    expect(v[0]?.identificador).toBe('1');
    expect(v[v.length - 1]?.identificador).toBe('62');
  });

  it('reiniciando, cada sección empieza en 1 — y el par sigue siendo único', () => {
    const v = ok({ tipo: 'casas', secciones: 3, total: 62, reiniciarNumeracion: true });
    expect(comoTexto(v).slice(0, 2)).toEqual(['1/1', '1/2']);
    expect(comoTexto(v)[20]).toBe('2/1');
    expect(new Set(comoTexto(v)).size).toBe(62);
  });

  it('con 0 secciones no hay agrupación: son Casa 1 … Casa N', () => {
    const v = ok({ tipo: 'casas', secciones: 0, total: 4, reiniciarNumeracion: false });
    expect(v).toEqual([
      { agrupacion: null, identificador: '1' },
      { agrupacion: null, identificador: '2' },
      { agrupacion: null, identificador: '3' },
      { agrupacion: null, identificador: '4' },
    ]);
  });

  it('más secciones que casas se rechaza: alguna quedaría vacía', () => {
    expect(mal({ tipo: 'casas', secciones: 5, total: 3, reiniciarNumeracion: false })).toMatch(
      /alguna quedaría vacía/,
    );
  });
});

describe('fincas', () => {
  it('genera Finca 1 … Finca N, sin agrupación', () => {
    const v = ok({ tipo: 'fincas', cantidad: 3 });
    expect(v).toEqual([
      { agrupacion: null, identificador: '1' },
      { agrupacion: null, identificador: '2' },
      { agrupacion: null, identificador: '3' },
    ]);
  });
});

describe('la palabra NUNCA entra en el identificador (H-3)', () => {
  it('ningún identificador generado lleva letras', () => {
    // Si un día alguien «mejora» el generador para que produzca «Casa 42», esta
    // prueba se pone roja: es lo que sostiene la respuesta a «¿qué pasa al
    // cambiar el prefijo?» — no pasa nada, porque la palabra no está guardada.
    const planes: readonly PlanDeGeneracion[] = [
      { tipo: 'apartamentos', agrupaciones: 2, estilo: 'letras', pisos: 2, porPiso: 2 },
      { tipo: 'casas', secciones: 2, total: 6, reiniciarNumeracion: false },
      { tipo: 'fincas', cantidad: 3 },
    ];
    for (const plan of planes) {
      for (const v of ok(plan)) expect(v.identificador).toMatch(/^[0-9]+$/);
    }
  });
});

describe('cotas · entrada no acotada del usuario (§2.4)', () => {
  it('un plan que pasa de 2 000 viviendas se rechaza ANTES de construirlo', () => {
    const detalle = mal({
      tipo: 'apartamentos',
      agrupaciones: 99,
      estilo: 'numeros',
      pisos: 50,
      porPiso: 99,
    });
    expect(detalle).toMatch(/máximo por operación es 2000|máximo por operación es 2 000/);
    expect(COTAS.viviendas).toBe(2000);
  });

  it('más de 26 agrupaciones con letras se rechaza en vez de inventar «AA»', () => {
    expect(
      mal({ tipo: 'apartamentos', agrupaciones: 27, estilo: 'letras', pisos: 1, porPiso: 1 }),
    ).toMatch(/no puede pasar de 26/);
  });

  it('un decimal no es un número de pisos', () => {
    expect(
      mal({ tipo: 'apartamentos', agrupaciones: 1, estilo: 'numeros', pisos: 2.5, porPiso: 1 }),
    ).toMatch(/entero/);
  });
});

describe('la vista previa enseña los extremos, no las 300', () => {
  it('dos primeras y dos últimas por grupo', () => {
    const v = ok({
      tipo: 'apartamentos',
      agrupaciones: 1,
      estilo: 'numeros',
      pisos: 5,
      porPiso: 3,
    });
    const [grupo] = agruparParaVistaPrevia(v);
    expect(grupo?.primeras).toEqual(['101', '102']);
    expect(grupo?.ultimas).toEqual(['502', '503']);
  });

  it('con cuatro o menos no hay «últimas»: se solaparían con las primeras', () => {
    const v = ok({ tipo: 'fincas', cantidad: 3 });
    expect(agruparParaVistaPrevia(v)[0]?.ultimas).toEqual([]);
  });
});
