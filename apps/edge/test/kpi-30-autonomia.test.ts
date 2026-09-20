import { describe, expect, it } from 'vitest';
import { DatabaseSync } from '../src/infraestructura/sqlite/motor';
import { ESQUEMA } from '../src/infraestructura/sqlite/esquema';
import { BandejaSqlite } from '../src/infraestructura/sqlite/bandeja-sqlite';
import { CacheDeReglasSqlite } from '../src/infraestructura/sqlite/cache-de-reglas';
import { DecidirLocalmente } from '../src/aplicacion/decidir-localmente';
import { enlaceInicial, minutosSinContacto, registrarSonda } from '../src/aplicacion/enlace-wan';
import type { InstantaneaDeReglas } from '../src/aplicacion/instantanea-de-reglas';

/**
 * KPI-30 · «24 h de autonomía sin degradación».
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ SIGNIFICA «SIN DEGRADACIÓN», MEDIDO Y NO AFIRMADO
 *
 * Tres cosas distintas, y las tres se comprueban por separado porque fallan por
 * separado:
 *
 * 1. **Sigue decidiendo.** A la hora 23 se decide igual que en la hora 0, con
 *    el mismo motivo. Un gateway que se «protege» negándolo todo tras unas
 *    horas cumple la letra de KPI-30 y no su propósito.
 * 2. **No se le acaba el sitio ni el tiempo.** 24 h de accesos entran en la
 *    bandeja y el coste por acceso no crece. Es lo que un `SELECT` sin índice
 *    rompería en silencio: funciona con 20 filas y se arrastra con 2.000.
 * 3. **Marca lo que decidió con reglas viejas** (KPI-31). A partir del umbral,
 *    lo decidido va etiquetado. No se deja de decidir —eso sería degradar— pero
 *    queda dicho.
 */
const COP = '11111111-1111-4111-8111-111111111111';
const VIVIENDA = '22222222-2222-4222-8222-222222222222';
const PERSONA = '33333333-3333-4333-8333-333333333333';
const INICIO = new Date('2026-09-21T00:00:00.000Z');
const HORA = 3_600_000;

const instantanea: InstantaneaDeReglas = {
  copropiedadId: COP,
  version: 12,
  generadaEn: INICIO.toISOString(),
  autorizaciones: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      viviendaId: VIVIENDA,
      personaId: PERSONA,
      desde: '2026-09-20T00:00:00.000Z',
      hasta: '2026-09-25T00:00:00.000Z',
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
};

const montar = (cacheObsoletaMinutos = 1440) => {
  const db = new DatabaseSync(':memory:');
  db.exec(ESQUEMA);
  const bandeja = new BandejaSqlite(db);
  const cache = new CacheDeReglasSqlite(db);
  cache.guardar(instantanea);
  const motor = new DecidirLocalmente(cache, {
    copropiedadId: COP,
    contingencia: 'denegar',
    cacheObsoletaMinutos,
  });
  return { bandeja, motor };
};

const acceso = (n: number, ocurridoEn: Date) => ({
  dispositivoId: 'camara-01',
  metodo: 'placa' as const,
  referenciaExterna: `evt-${String(n).padStart(5, '0')}`,
  confianza: 0.95,
  placaLeida: 'ABC123',
  personaId: null,
  zonaId: null,
  ocurridoEn,
});

describe('KPI-30 · 24 horas sin WAN, sin degradación', () => {
  it('decide igual en la hora 0 y en la hora 23, y nada se pierde', () => {
    const { bandeja, motor } = montar();

    const primera = motor.decidir(acceso(0, INICIO));
    let ultima = primera;

    // Un acceso por minuto durante 24 h: 1.440 accesos, que es tráfico alto
    // para una portería y por eso sirve de tope.
    for (let minuto = 0; minuto < 1440; minuto += 1) {
      const cuando = new Date(INICIO.getTime() + minuto * 60_000);
      const d = motor.decidir(acceso(minuto, cuando));
      bandeja.encolar(d.claveIdempotencia, '{}', cuando);
      ultima = d;
    }

    expect(primera.resultado.permitido).toBe(true);
    expect(ultima.resultado.permitido, 'en la hora 23 decide igual').toBe(true);
    expect(ultima.resultado.reglaAplicada).toBe(primera.resultado.reglaAplicada);
    expect(ultima.porContingencia, 'nunca cae en contingencia').toBe(false);
    expect(bandeja.cuantosPendientes(), 'los 1.440 en la bandeja').toBe(1440);
  });

  it('el coste por acceso NO crece con la bandeja llena', () => {
    /**
     * Es la degradación que no se ve venir: un `SELECT` sin índice va bien con
     * veinte filas y se arrastra con dos mil, y el síntoma aparece a las
     * veinte horas de corte, que es cuando menos se puede diagnosticar.
     *
     * Se mide el vaciado con la bandeja casi vacía y con ella llena. El umbral
     * es holgado a propósito —un factor de 20— porque lo que se busca no es un
     * número fino sino una curva: lineal pasa, cuadrática no.
     */
    const { bandeja, motor } = montar();
    for (let i = 0; i < 40; i += 1) {
      const d = motor.decidir(acceso(i, new Date(INICIO.getTime() + i * 60_000)));
      bandeja.encolar(d.claveIdempotencia, '{}', INICIO);
    }
    const t0 = performance.now();
    for (let i = 0; i < 200; i += 1) bandeja.pendientes(new Date(INICIO.getTime() + HORA), 50);
    const conPocas = performance.now() - t0;

    for (let i = 40; i < 2000; i += 1) {
      const d = motor.decidir(acceso(i, new Date(INICIO.getTime() + i * 60_000)));
      bandeja.encolar(d.claveIdempotencia, '{}', INICIO);
    }
    const t1 = performance.now();
    for (let i = 0; i < 200; i += 1) bandeja.pendientes(new Date(INICIO.getTime() + HORA), 50);
    const conMuchas = performance.now() - t1;

    expect(bandeja.cuantosPendientes()).toBe(2000);
    // `+1` para que un cero de reloj no convierta la razón en infinito.
    expect((conMuchas + 1) / (conPocas + 1)).toBeLessThan(20);
  });

  it('KPI-31 · pasado el umbral, lo decidido va MARCADO, no negado', () => {
    const { motor } = montar(1440);

    const temprano = motor.decidir(acceso(1, new Date(INICIO.getTime() + HORA)));
    expect(temprano.cachePotencialmenteObsoleto).toBe(false);

    const tarde = motor.decidir(acceso(2, new Date(INICIO.getTime() + 25 * HORA)));
    // Lo importante: SIGUE PERMITIENDO. Negar aquí sería la degradación que
    // KPI-30 prohíbe, disfrazada de prudencia.
    expect(tarde.resultado.permitido).toBe(true);
    expect(tarde.cachePotencialmenteObsoleto, 'pero queda marcado').toBe(true);
  });

  it('el umbral se mide desde que la NUBE generó la caché, no desde que llegó', () => {
    // Un gateway que reinicia recarga su propia caché del disco. Si el umbral
    // se midiera por la llegada, esa recarga la daría por fresca y KPI-31
    // dejaría de marcar exactamente en el caso que hay que poder distinguir.
    const db = new DatabaseSync(':memory:');
    db.exec(ESQUEMA);
    const cache = new CacheDeReglasSqlite(db);
    // Generada hace dos días; se «recibe» ahora, como en un reinicio.
    cache.guardar({ ...instantanea, generadaEn: '2026-09-19T00:00:00.000Z' });
    const motor = new DecidirLocalmente(cache, {
      copropiedadId: COP,
      contingencia: 'denegar',
      cacheObsoletaMinutos: 1440,
    });
    expect(motor.decidir(acceso(1, INICIO)).cachePotencialmenteObsoleto).toBe(true);
  });

  it('la autonomía se mide desde el último contacto, y «nunca» no es cero', () => {
    let estado = enlaceInicial();
    expect(minutosSinContacto(estado, INICIO), 'nunca contactó ≠ hace 0 minutos').toBeNull();

    estado = registrarSonda(
      estado,
      { correcta: true, ahora: INICIO },
      { sondasParaCaer: 3, sondasParaVolver: 1 },
    );
    expect(estado.modo).toBe('en_linea');
    expect(minutosSinContacto(estado, new Date(INICIO.getTime() + 24 * HORA))).toBe(1440);
  });
});
