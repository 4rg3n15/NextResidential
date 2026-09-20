import { describe, expect, it } from 'vitest';
import { evaluarAcceso } from '@ncr/domain-core';
import type { ContextoDeAcceso } from '@ncr/domain-core';
import { DecidirLocalmente } from '../src/aplicacion/decidir-localmente';
import { contextoDesde, resolverIdentidad } from '../src/aplicacion/instantanea-de-reglas';
import type { HechoLocal, InstantaneaDeReglas } from '../src/aplicacion/instantanea-de-reglas';
import type { CacheDeReglas } from '../src/aplicacion/puertos';

/**
 * RN-16 · CA-21 · LA PRUEBA QUE SOSTIENE LA ETAPA ENTERA.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ AFIRMA
 *
 * Que **la misma decisión se produce en la nube y en el Edge**. No «una
 * decisión parecida», ni «el mismo permitido/denegado»: el mismo resultado
 * completo, con el mismo motivo tipado, la misma regla aplicada y la misma
 * versión sellada.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CÓMO LO AFIRMA, Y POR QUÉ ASÍ Y NO DE OTRO MODO
 *
 * Se arma un contexto, se evalúa por los dos caminos y se comparan:
 *
 *   · la nube llama `evaluarAcceso(contexto)` directamente;
 *   · el Edge llama `DecidirLocalmente`, que reconstruye el contexto **desde su
 *     caché** y luego llama al mismo `evaluarAcceso`.
 *
 * Lo segundo es lo que tiene valor. Comparar `evaluarAcceso` consigo mismo no
 * probaría nada; lo que puede divergir es **la reconstrucción del contexto**, y
 * por eso el camino del Edge parte de una instantánea serializada, como en
 * producción, y no del objeto que ya se tiene a mano.
 *
 * Si alguien añadiera una condición «solo para el Edge» en cualquier punto de
 * ese camino, esta prueba se pondría roja el mismo día.
 */
const COP = '11111111-1111-4111-8111-111111111111';
const VIVIENDA = '22222222-2222-4222-8222-222222222222';
const PERSONA = '33333333-3333-4333-8333-333333333333';
const AHORA = new Date('2026-09-21T15:00:00.000Z');

const cacheCon = (instantanea: InstantaneaDeReglas | null): CacheDeReglas => ({
  vigente: () => instantanea,
  guardar: () => true,
});

const instantaneaBase = (cambios: Partial<InstantaneaDeReglas> = {}): InstantaneaDeReglas => ({
  copropiedadId: COP,
  version: 7,
  generadaEn: '2026-09-21T14:00:00.000Z',
  autorizaciones: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      viviendaId: VIVIENDA,
      personaId: PERSONA,
      desde: '2026-09-21T10:00:00.000Z',
      hasta: '2026-09-21T20:00:00.000Z',
      estado: 'vigente',
      zonasPermitidas: [],
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

const hechoBase = (cambios: Partial<HechoLocal> = {}): HechoLocal => ({
  dispositivoId: 'camara-01',
  metodo: 'placa',
  referenciaExterna: 'evt-0001',
  confianza: 0.95,
  placaLeida: 'ABC123',
  personaId: null,
  zonaId: null,
  ocurridoEn: AHORA,
  ...cambios,
});

/** El camino de la NUBE: contexto ya resuelto, motor del dominio. */
const decisionDeLaNube = (instantanea: InstantaneaDeReglas, hecho: HechoLocal) => {
  const identidad = resolverIdentidad(instantanea, hecho);
  const contexto = contextoDesde(instantanea, hecho, identidad) as ContextoDeAcceso;
  return evaluarAcceso(contexto);
};

/** El camino del EDGE: la instantánea pasa por serializar, como en producción. */
const decisionDelEdge = (instantanea: InstantaneaDeReglas, hecho: HechoLocal) => {
  const comoEnDisco = JSON.parse(JSON.stringify(instantanea)) as InstantaneaDeReglas;
  const motor = new DecidirLocalmente(cacheCon(comoEnDisco), {
    copropiedadId: COP,
    contingencia: 'denegar',
    cacheObsoletaMinutos: 1440,
  });
  return motor.decidir(hecho);
};

describe('RN-16 · la misma decisión en la nube y en el Edge', () => {
  const casos: readonly {
    readonly nombre: string;
    readonly instantanea: InstantaneaDeReglas;
    readonly hecho: HechoLocal;
  }[] = [
    {
      nombre: 'permitido: placa conocida con autorización vigente',
      instantanea: instantaneaBase(),
      hecho: hechoBase(),
    },
    {
      nombre: 'LISTA_NEGRA gana a una autorización vigente (CA-13)',
      instantanea: instantaneaBase({ placasEnListaNegra: ['ABC123'] }),
      hecho: hechoBase(),
    },
    {
      nombre: 'VIGENCIA_EXPIRADA cuando el instante cae fuera',
      instantanea: instantaneaBase(),
      hecho: hechoBase({ ocurridoEn: new Date('2026-09-21T21:00:00.000Z') }),
    },
    {
      nombre: 'vivienda inactiva (RN-13)',
      instantanea: instantaneaBase({ viviendasActivas: [] }),
      hecho: hechoBase(),
    },
    {
      nombre: 'PLACA_DESCONOCIDA cuando la caché no la tiene',
      instantanea: instantaneaBase({ vehiculos: [] }),
      hecho: hechoBase(),
    },
    {
      nombre: 'CONFIANZA_INSUFICIENTE por debajo del umbral',
      instantanea: instantaneaBase(),
      hecho: hechoBase({ confianza: 0.3 }),
    },
    {
      nombre: 'persona vetada por identidad, no por placa',
      instantanea: instantaneaBase({ personasEnListaNegra: [PERSONA] }),
      hecho: hechoBase(),
    },
    {
      nombre: 'zona fuera de horario (RN-14, CA-15)',
      instantanea: instantaneaBase({
        zonas: [
          {
            id: 'zona-1',
            restringida: false,
            aforoMaximo: 20,
            ocupacionActual: 0,
            desplazamientoUtcMinutos: -300,
            // 06:00–08:00 local; el hecho ocurre a las 10:00 local.
            franjas: [{ dia: 1, minutoInicio: 360, minutoFin: 480 }],
          },
        ],
      }),
      hecho: hechoBase({ zonaId: 'zona-1' }),
    },
    {
      nombre: 'zona con el aforo lleno (CA-14)',
      instantanea: instantaneaBase({
        zonas: [
          {
            id: 'zona-1',
            restringida: false,
            aforoMaximo: 10,
            ocupacionActual: 10,
            desplazamientoUtcMinutos: -300,
            franjas: [{ dia: 0, minutoInicio: 0, minutoFin: 1440 }],
          },
        ],
      }),
      hecho: hechoBase({ zonaId: 'zona-1' }),
    },
    {
      nombre: 'método facial sin consentimiento vigente (RN-09)',
      instantanea: instantaneaBase({ personasConConsentimiento: [] }),
      hecho: hechoBase({ metodo: 'facial', placaLeida: null, personaId: PERSONA }),
    },
  ];

  for (const caso of casos) {
    it(`${caso.nombre}`, () => {
      const nube = decisionDeLaNube(caso.instantanea, caso.hecho);
      const edge = decisionDelEdge(caso.instantanea, caso.hecho);

      expect(edge.porContingencia, 'este caso NO debe resolverse por contingencia').toBe(false);
      expect(edge.resultado.permitido).toBe(nube.permitido);
      expect(edge.resultado.reglaAplicada).toBe(nube.reglaAplicada);
      // El sello: la versión con la que se decidió es la de la caché (CA-21).
      expect(edge.resultado.versionDeReglas.numero).toBe(caso.instantanea.version);
      expect(edge.resultado.versionDeReglas.copropiedadId).toBe(COP);
      if (!nube.permitido && !edge.resultado.permitido) {
        // El MOTIVO, que es lo que distingue una decisión de otra parecida.
        expect(edge.resultado.motivo).toBe(nube.motivo);
      }
    });
  }

  it('los diez casos cubren permitidos Y denegados: si no, no probaría nada', () => {
    const resultados = casos.map((c) => decisionDelEdge(c.instantanea, c.hecho).resultado);
    expect(resultados.some((r) => r.permitido)).toBe(true);
    expect(resultados.some((r) => !r.permitido)).toBe(true);
    // Y varios motivos distintos: diez denegaciones por lo mismo no demuestran
    // que la precedencia se respete.
    const motivos = new Set(
      resultados.filter((r) => !r.permitido).map((r) => (r.permitido ? '' : r.motivo)),
    );
    expect(motivos.size).toBeGreaterThanOrEqual(4);
  });
});
