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

/**
 * B.1 · La pregunta que faltaba. Cada caso de aquí abajo nombra lo que alguien
 * diría en voz alta describiendo su conjunto: «cinco torres de veinticuatro»,
 * «sesenta y dos casas en tres sectores», «doce fincas». Si el plan no puede
 * expresar esa frase, el formulario está preguntando otra cosa.
 */
describe('la cantidad es la pregunta principal, y el denominador es opcional', () => {
  it('sin agrupaciones, la cantidad es el TOTAL y las viviendas son solo número', () => {
    const v = ok({ agrupaciones: 0, estilo: 'numeros', cantidad: 12 });
    expect(v).toHaveLength(12);
    expect(comoTexto(v).slice(0, 3)).toEqual(['—/1', '—/2', '—/3']);
    expect(comoTexto(v).at(-1)).toBe('—/12');
  });

  it('con agrupaciones, la cantidad es POR CADA UNA: 5 torres de 24 son 120', () => {
    const v = ok({ agrupaciones: 5, estilo: 'numeros', cantidad: 24 });
    expect(v).toHaveLength(120);
    expect(new Set(v.map((x) => x.agrupacion)).size).toBe(5);
  });

  it('62 casas en 3 sectores ya NO se reparten: son 62 en cada uno, que es lo que se pidió', () => {
    // El reparto uniforme era consecuencia de preguntar el total teniendo
    // secciones. Con la pregunta invertida, «62» significa 62 por sector, y
    // quien quiera el reparto desigual lo expresa con excepciones.
    const v = ok({ agrupaciones: 3, estilo: 'numeros', cantidad: 62 });
    expect(v).toHaveLength(186);
  });

  it('las excepciones son la forma de decir «la torre 4 tiene 18»', () => {
    const v = ok({
      agrupaciones: 4,
      estilo: 'numeros',
      cantidad: 24,
      excepciones: [{ agrupacion: '4', cantidad: 18 }],
    });
    expect(v).toHaveLength(24 * 3 + 18);
    expect(v.filter((x) => x.agrupacion === '4')).toHaveLength(18);
  });
});

describe('numeración por piso · 101, 102, 201… deducida de la cantidad', () => {
  it('24 viviendas con 4 por piso dan 101…104 y terminan en 604', () => {
    const v = ok({ agrupaciones: 0, estilo: 'numeros', cantidad: 24, porPiso: 4 });
    expect(comoTexto(v).slice(0, 5)).toEqual(['—/101', '—/102', '—/103', '—/104', '—/201']);
    expect(comoTexto(v).at(-1)).toBe('—/604');
  });

  it('un piso incompleto no inventa viviendas: 10 con 4 por piso acaban en 302', () => {
    const v = ok({ agrupaciones: 0, estilo: 'numeros', cantidad: 10, porPiso: 4 });
    expect(v).toHaveLength(10);
    expect(comoTexto(v).at(-1)).toBe('—/302');
  });

  it('con más de 10 por piso llega a 111, no salta a 201', () => {
    const v = ok({ agrupaciones: 0, estilo: 'numeros', cantidad: 11, porPiso: 11 });
    expect(comoTexto(v).at(-1)).toBe('—/111');
  });

  it('el mismo número en dos torres NO es un duplicado: es el caso normal', () => {
    const v = ok({ agrupaciones: 2, estilo: 'numeros', cantidad: 3, porPiso: 3 });
    expect(comoTexto(v)).toEqual(['1/101', '1/102', '1/103', '2/101', '2/102', '2/103']);
  });

  it('las letras van en orden alfabético y los números de menor a mayor', () => {
    expect(nombreDeAgrupacion(0, 'letras')).toBe('A');
    expect(nombreDeAgrupacion(2, 'letras')).toBe('C');
    expect(nombreDeAgrupacion(0, 'numeros')).toBe('1');
  });
});

describe('numeración correlativa · reiniciar o seguir', () => {
  it('sin reiniciar, la numeración es corrida entre agrupaciones', () => {
    const v = ok({ agrupaciones: 3, estilo: 'numeros', cantidad: 2 });
    expect(comoTexto(v)).toEqual(['1/1', '1/2', '2/3', '2/4', '3/5', '3/6']);
  });

  it('reiniciando, cada agrupación empieza en 1 — y el par sigue siendo único', () => {
    const v = ok({ agrupaciones: 3, estilo: 'numeros', cantidad: 2, reiniciarNumeracion: true });
    expect(comoTexto(v)).toEqual(['1/1', '1/2', '2/1', '2/2', '3/1', '3/2']);
    expect(new Set(comoTexto(v)).size).toBe(6);
  });
});

describe('excepciones · el conjunto real no es homogéneo', () => {
  it('una excepción sobre una agrupación inexistente se RECHAZA, no se ignora', () => {
    const motivo = mal({
      agrupaciones: 3,
      estilo: 'letras',
      cantidad: 10,
      excepciones: [{ agrupacion: 'G', cantidad: 4 }],
    });
    expect(motivo).toContain('«G» no existe');
  });

  it('la misma agrupación dos veces se rechaza: si no, la última ganaría en silencio', () => {
    const motivo = mal({
      agrupaciones: 2,
      estilo: 'letras',
      cantidad: 10,
      excepciones: [
        { agrupacion: 'A', cantidad: 4 },
        { agrupacion: 'A', cantidad: 6 },
      ],
    });
    expect(motivo).toContain('dos veces');
  });

  it('una excepción con 0 viviendas se rechaza con su propio motivo', () => {
    const motivo = mal({
      agrupaciones: 2,
      estilo: 'letras',
      cantidad: 10,
      excepciones: [{ agrupacion: 'B', cantidad: 0 }],
    });
    expect(motivo).toContain('no es una excepción');
  });

  it('una excepción sin denominador se rechaza: no hay a qué hacerla', () => {
    const motivo = mal({
      agrupaciones: 0,
      estilo: 'numeros',
      cantidad: 10,
      excepciones: [{ agrupacion: 'A', cantidad: 4 }],
    });
    expect(motivo).toContain('no se divide');
  });
});

describe('la palabra NUNCA entra en el identificador (H-3)', () => {
  it('ningún identificador generado lleva letras', () => {
    const planes: readonly PlanDeGeneracion[] = [
      { agrupaciones: 2, estilo: 'letras', cantidad: 4, porPiso: 2 },
      { agrupaciones: 3, estilo: 'numeros', cantidad: 5 },
      { agrupaciones: 0, estilo: 'numeros', cantidad: 4 },
    ];
    for (const plan of planes) {
      for (const v of ok(plan)) expect(v.identificador).toMatch(/^\d+$/);
    }
  });
});

describe('cotas · entrada no acotada del usuario (§2.4)', () => {
  it('un plan que pasa de 2 000 viviendas se rechaza ANTES de construirlo', () => {
    const motivo = mal({ agrupaciones: 99, estilo: 'numeros', cantidad: 99 });
    expect(motivo).toContain(String(COTAS.viviendas));
  });

  it('más de 26 agrupaciones con letras se rechaza en vez de inventar «AA»', () => {
    const motivo = mal({ agrupaciones: 27, estilo: 'letras', cantidad: 2 });
    expect(motivo).toContain('26');
  });

  it('un decimal no es una cantidad de viviendas', () => {
    expect(mal({ agrupaciones: 0, estilo: 'numeros', cantidad: 2.5 })).toContain('entero');
  });

  it('cero viviendas no es un plan: es no hacer nada', () => {
    expect(mal({ agrupaciones: 0, estilo: 'numeros', cantidad: 0 })).toContain('menor que 1');
  });
});

describe('la vista previa enseña los extremos, no las 300', () => {
  it('dos primeras y dos últimas por grupo', () => {
    const grupos = agruparParaVistaPrevia(
      ok({ agrupaciones: 2, estilo: 'letras', cantidad: 9, porPiso: 3 }),
      ['B'],
    );
    expect(grupos).toHaveLength(2);
    expect(grupos[0]?.agrupacion).toBe('A');
    expect(grupos[0]?.cantidad).toBe(9);
    expect(grupos[0]?.primeras).toEqual(['101', '102']);
    expect(grupos[0]?.ultimas).toEqual(['302', '303']);
    expect(grupos[0]?.porExcepcion).toBe(false);
    expect(grupos[1]?.porExcepcion).toBe(true);
  });

  it('con cuatro o menos no hay «últimas»: se solaparían con las primeras', () => {
    const grupos = agruparParaVistaPrevia(ok({ agrupaciones: 0, estilo: 'numeros', cantidad: 3 }));
    expect(grupos[0]?.ultimas).toEqual([]);
  });
});
