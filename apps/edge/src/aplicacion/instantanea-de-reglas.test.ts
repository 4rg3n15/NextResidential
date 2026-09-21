import { describe, expect, it } from 'vitest';
import { contextoDesde, instantaneaUsable, resolverIdentidad } from './instantanea-de-reglas';
import type { HechoLocal, InstantaneaDeReglas } from './instantanea-de-reglas';

const COP = '11111111-1111-4111-8111-111111111111';
const VIVIENDA = '22222222-2222-4222-8222-222222222222';
const PERSONA = '33333333-3333-4333-8333-333333333333';
const AHORA = new Date('2026-09-21T15:00:00.000Z');

const base = (cambios: Partial<InstantaneaDeReglas> = {}): InstantaneaDeReglas => ({
  copropiedadId: COP,
  version: 3,
  generadaEn: AHORA.toISOString(),
  autorizaciones: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      viviendaId: VIVIENDA,
      personaId: PERSONA,
      desde: '2026-09-21T00:00:00.000Z',
      hasta: '2026-09-22T00:00:00.000Z',
      estado: 'vigente',
      zonasPermitidas: ['zona-1'],
      acompanantes: [],
      maximoAcompanantes: 5,
      patron: null,
    },
  ],
  personasEnListaNegra: [],
  placasEnListaNegra: [],
  viviendasActivas: [VIVIENDA],
  vehiculos: [{ placa: 'ABC123', personaId: PERSONA, viviendaId: VIVIENDA }],
  zonas: [],
  personasConConsentimiento: [PERSONA],
  umbralDeConfianza: 0.7,
  ...cambios,
});

const hecho = (cambios: Partial<HechoLocal> = {}): HechoLocal => ({
  dispositivoId: 'camara-01',
  metodo: 'placa',
  referenciaExterna: 'evt-1',
  confianza: 0.9,
  placaLeida: 'ABC123',
  personaId: null,
  zonaId: null,
  ocurridoEn: AHORA,
  ...cambios,
});

describe('resolverIdentidad · solo por lo que la caché conoce', () => {
  it('una placa conocida trae persona y vivienda', () => {
    expect(resolverIdentidad(base(), hecho())).toEqual({
      personaId: PERSONA,
      viviendaId: VIVIENDA,
      placaConocida: true,
    });
  });

  it('una placa DESCONOCIDA no se adivina', () => {
    // Adivinar aquí sería decidir un acceso fuera del motor. Se marca como
    // desconocida y `politicaPlacaConocida` resuelve.
    const r = resolverIdentidad(base(), hecho({ placaLeida: 'ZZZ999' }));
    expect(r.placaConocida).toBe(false);
    expect(r.viviendaId).toBeNull();
  });

  it('sin placa, la identidad viene del método biométrico', () => {
    const r = resolverIdentidad(base(), hecho({ placaLeida: null, personaId: PERSONA }));
    expect(r.personaId).toBe(PERSONA);
    expect(r.viviendaId).toBe(VIVIENDA);
  });

  it('una persona sin autorización en la caché no tiene vivienda', () => {
    const r = resolverIdentidad(base(), hecho({ placaLeida: null, personaId: 'otra-persona' }));
    expect(r.viviendaId).toBeNull();
  });

  it('sin placa y sin persona, no hay nadie', () => {
    expect(resolverIdentidad(base(), hecho({ placaLeida: null }))).toEqual({
      personaId: null,
      viviendaId: null,
      placaConocida: false,
    });
  });
});

describe('contextoDesde', () => {
  const ctx = (i: InstantaneaDeReglas, h: HechoLocal) =>
    contextoDesde(i, h, resolverIdentidad(i, h));

  it('una versión imposible NO produce contexto', () => {
    expect(ctx(base({ version: 0 }), hecho())).toBeNull();
  });

  it('solo carga las autorizaciones DE ESA persona', () => {
    const i = base({
      autorizaciones: [
        ...base().autorizaciones,
        { ...base().autorizaciones[0]!, id: 'otra', personaId: 'vecino' },
      ],
    });
    expect(ctx(i, hecho())?.autorizaciones).toHaveLength(1);
  });

  it('UNA AUTORIZACIÓN CON PATRÓN CORRUPTO SE DESCARTA ENTERA', () => {
    // No se deja «sin patrón»: eso la volvería permanente, que es abrir de más.
    // Descartarla es cerrar de más, que es la dirección segura (§2.1.4).
    const i = base({
      autorizaciones: [
        {
          ...base().autorizaciones[0]!,
          patron: { dias: [9], minutoInicio: 0, minutoFin: 10, desplazamientoUtcMinutos: -300 },
        },
      ],
    });
    expect(ctx(i, hecho())?.autorizaciones).toHaveLength(0);
  });

  it('una vigencia imposible descarta la autorización', () => {
    const i = base({
      autorizaciones: [{ ...base().autorizaciones[0]!, desde: 'no-es-fecha', hasta: 'tampoco' }],
    });
    expect(ctx(i, hecho())?.autorizaciones).toHaveLength(0);
  });

  it('una autorización REVOCADA se rehidrata revocada, no vigente', () => {
    // `crear` la devolvería vigente; por eso el adaptador usa `rehidratar`.
    const i = base({ autorizaciones: [{ ...base().autorizaciones[0]!, estado: 'revocada' }] });
    expect(ctx(i, hecho())?.autorizaciones[0]?.estado).toBe('revocada');
  });

  it('UNA ZONA QUE LA CACHÉ NO CONOCE se trata como restringida y cerrada', () => {
    const c = ctx(base(), hecho({ zonaId: 'zona-fantasma' }));
    expect(c?.zona).toEqual({
      id: 'zona-fantasma',
      dentroDeHorario: false,
      aforoCompleto: false,
      restringida: true,
    });
  });

  it('una zona con horario ILEGIBLE se considera cerrada, no abierta', () => {
    const i = base({
      zonas: [
        {
          id: 'zona-1',
          restringida: false,
          aforoMaximo: 10,
          ocupacionActual: 0,
          desplazamientoUtcMinutos: 99_999,
          franjas: [{ dia: 0, minutoInicio: 0, minutoFin: 1440 }],
        },
      ],
    });
    expect(ctx(i, hecho({ zonaId: 'zona-1' }))?.zona?.dentroDeHorario).toBe(false);
  });

  it('una franja ilegible se salta sin tumbar la zona entera', () => {
    const i = base({
      zonas: [
        {
          id: 'zona-1',
          restringida: false,
          aforoMaximo: 10,
          ocupacionActual: 0,
          desplazamientoUtcMinutos: 0,
          franjas: [
            { dia: 99, minutoInicio: 0, minutoFin: 10 },
            { dia: 1, minutoInicio: 0, minutoFin: 1440 },
          ],
        },
      ],
    });
    // La buena sigue valiendo: 2026-09-21 es lunes (día 1).
    expect(ctx(i, hecho({ zonaId: 'zona-1' }))?.zona?.dentroDeHorario).toBe(true);
  });

  it('sin aforo configurado, el aforo nunca está completo', () => {
    const i = base({
      zonas: [
        {
          id: 'zona-1',
          restringida: false,
          aforoMaximo: 0,
          ocupacionActual: 50,
          desplazamientoUtcMinutos: 0,
          franjas: [{ dia: 1, minutoInicio: 0, minutoFin: 1440 }],
        },
      ],
    });
    expect(ctx(i, hecho({ zonaId: 'zona-1' }))?.zona?.aforoCompleto).toBe(false);
  });

  it('el consentimiento y la vivienda activa salen de la caché', () => {
    const c = ctx(base(), hecho());
    expect(c?.consentimientoVigente).toBe(true);
    expect(c?.viviendaActiva).toBe(true);
    expect(ctx(base({ viviendasActivas: [] }), hecho())?.viviendaActiva).toBe(false);
    expect(ctx(base({ personasConConsentimiento: [] }), hecho())?.consentimientoVigente).toBe(false);
  });
});

describe('instantaneaUsable · la guarda contra una caché truncada', () => {
  it('acepta una completa', () => {
    expect(instantaneaUsable(base())).toBe(true);
  });

  it('rechaza lo que no es objeto', () => {
    for (const x of [null, undefined, 3, 'texto', []]) expect(instantaneaUsable(x)).toBe(false);
  });

  it('rechaza una versión que no es entero ≥ 1', () => {
    expect(instantaneaUsable({ ...base(), version: 0 })).toBe(false);
    expect(instantaneaUsable({ ...base(), version: 1.5 })).toBe(false);
  });

  it('RECHAZA A LA QUE LE FALTA CUALQUIER COLECCIÓN', () => {
    // Es el caso que tumbaba el gateway: un `.find()` sobre `undefined`.
    for (const clave of [
      'autorizaciones',
      'personasEnListaNegra',
      'placasEnListaNegra',
      'viviendasActivas',
      'vehiculos',
      'zonas',
      'personasConConsentimiento',
    ] as const) {
      const rota = { ...base() };
      delete (rota as Record<string, unknown>)[clave];
      expect(instantaneaUsable(rota), `sin ${clave}`).toBe(false);
    }
  });

  it('rechaza sin copropiedad, sin fecha o sin umbral', () => {
    expect(instantaneaUsable({ ...base(), copropiedadId: '' })).toBe(false);
    expect(instantaneaUsable({ ...base(), generadaEn: 3 })).toBe(false);
    expect(instantaneaUsable({ ...base(), umbralDeConfianza: 'alto' })).toBe(false);
  });
});
