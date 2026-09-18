import { describe, expect, it } from 'vitest';
import { alcanzaVivienda, ambitoDelResidente } from './ambito-del-residente';

const COP = '10000000-0000-4000-8000-000000000001';
const OTRA_COP = '10000000-0000-4000-8000-000000000002';
const V1 = '20000000-0000-4000-8000-000000000001';
const V2 = '20000000-0000-4000-8000-000000000002';

describe('alcanzaVivienda · el segundo eje del aislamiento', () => {
  const ambito = { copropiedadId: COP, viviendaId: V1 };

  it('alcanza un recurso de su propia vivienda', () => {
    expect(alcanzaVivienda(ambito, { copropiedadId: COP, viviendaId: V1 })).toBe(true);
  });

  it('NO alcanza el de la vivienda del vecino, en la misma copropiedad', () => {
    // El caso que motivó este módulo. Mismo conjunto, otra casa.
    expect(alcanzaVivienda(ambito, { copropiedadId: COP, viviendaId: V2 })).toBe(false);
  });

  it('NO alcanza una vivienda con el MISMO identificador en otra copropiedad', () => {
    // Un UUID no lleva escrito de qué conjunto es: sin comparar la
    // copropiedad, un identificador filtrado alcanzaría a la otra.
    expect(alcanzaVivienda(ambito, { copropiedadId: OTRA_COP, viviendaId: V1 })).toBe(false);
  });

  it('un recurso SIN vivienda no alcanza a nadie (denegar por defecto)', () => {
    expect(alcanzaVivienda(ambito, { copropiedadId: COP, viviendaId: null })).toBe(false);
  });
});

describe('ambitoDelResidente', () => {
  it('construye el ámbito cuando el vínculo es de la copropiedad pedida', () => {
    const r = ambitoDelResidente(COP, { copropiedadId: COP, viviendaId: V1 });
    expect(r).toEqual({ ok: true, ambito: { copropiedadId: COP, viviendaId: V1 } });
  });

  it('distingue «sin vivienda activa» de un cruce de copropiedad', () => {
    // Son dos estados distintos y la app los pinta distinto: el primero es la
    // pantalla «aún no tiene vivienda asignada» del mockup M-1; el segundo es
    // un intento de cruce, y se audita.
    expect(ambitoDelResidente(COP, null)).toEqual({ ok: false, motivo: 'sin_vivienda_activa' });
    expect(ambitoDelResidente(COP, { copropiedadId: OTRA_COP, viviendaId: V1 })).toEqual({
      ok: false,
      motivo: 'copropiedad_distinta',
    });
  });
});
