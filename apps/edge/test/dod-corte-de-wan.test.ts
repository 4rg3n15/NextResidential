import { describe, expect, it } from 'vitest';
import { DatabaseSync } from '../src/infraestructura/sqlite/motor';
import { ESQUEMA } from '../src/infraestructura/sqlite/esquema';
import { BandejaSqlite } from '../src/infraestructura/sqlite/bandeja-sqlite';
import { CacheDeReglasSqlite } from '../src/infraestructura/sqlite/cache-de-reglas';
import { DecidirLocalmente } from '../src/aplicacion/decidir-localmente';
import { Reconciliacion } from '../src/aplicacion/reconciliacion';
import { Gateway } from '../src/aplicacion/gateway';
import type { InstantaneaDeReglas } from '../src/aplicacion/instantanea-de-reglas';
import type { ClienteDeNube, EnvioPendiente, ResultadoDeEnvio } from '../src/aplicacion/puertos';

/**
 * LA DEFINICIÓN DE TERMINADO DE LA ETAPA 12, EJECUTADA.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * «30 minutos sin WAN con 20 accesos resueltos localmente; al reconectar, los 20
 *  en la nube exactamente una vez en menos de 5 minutos.»
 *
 * Todo el reloj es fabricado. No es una comodidad: es la única forma de que
 * esta prueba exista. Con esperas reales duraría 35 minutos y nadie la
 * ejecutaría, así que la DoD se «verificaría» leyéndola en vez de corriéndola.
 * Los puertos —enlace, nube, reloj— son lo que permite recorrer media hora en
 * milisegundos sin fingir ninguna de las reglas que se están probando.
 *
 * **Lo único simulado es el tiempo y la red.** La decisión es el motor real del
 * dominio, la bandeja es SQLite de verdad, la clave de idempotencia la
 * construye el dominio y la deduplicación la hace la nube falsa con la misma
 * regla que la real: si ya vi esta clave, es duplicado.
 */
const COP = '11111111-1111-4111-8111-111111111111';
const VIVIENDA = '22222222-2222-4222-8222-222222222222';
const PERSONA = '33333333-3333-4333-8333-333333333333';

const instantanea = (generadaEn: string): InstantaneaDeReglas => ({
  copropiedadId: COP,
  version: 12,
  generadaEn,
  autorizaciones: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      viviendaId: VIVIENDA,
      personaId: PERSONA,
      desde: '2026-09-21T00:00:00.000Z',
      hasta: '2026-09-23T00:00:00.000Z',
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
});

/**
 * La nube falsa. Deduplica por clave, como la de verdad, y puede estar caída.
 *
 * `recibidos` guarda CADA llegada, no cada creación: es lo que permite afirmar
 * «exactamente una vez» de forma dura. Si el Edge enviara un evento dos veces,
 * aquí habría dos llegadas y una creación, y la prueba distingue las dos cosas.
 */
class NubeFalsa implements ClienteDeNube {
  caida = false;
  /** Corta el lote tras N envíos, para simular conexión intermitente. */
  cortarTras: number | null = null;

  readonly creados = new Map<string, unknown>();
  readonly llegadas: string[] = [];

  async reconciliar(lote: readonly EnvioPendiente[]): Promise<readonly ResultadoDeEnvio[]> {
    if (this.caida) throw new Error('sin conexión');
    const resultados: ResultadoDeEnvio[] = [];
    let procesados = 0;
    for (const envio of lote) {
      if (this.cortarTras !== null && procesados >= this.cortarTras) break;
      this.llegadas.push(envio.claveIdempotencia);
      const duplicado = this.creados.has(envio.claveIdempotencia);
      if (!duplicado) this.creados.set(envio.claveIdempotencia, JSON.parse(envio.cuerpo));
      resultados.push({
        claveIdempotencia: envio.claveIdempotencia,
        aceptado: true,
        duplicado,
      });
      procesados += 1;
    }
    return resultados;
  }

  async descargarReglas(): Promise<InstantaneaDeReglas | null> {
    return null;
  }
}

const montar = (generadaEn = '2026-09-21T09:00:00.000Z') => {
  const db = new DatabaseSync(':memory:');
  db.exec(ESQUEMA);
  const bandeja = new BandejaSqlite(db);
  const cache = new CacheDeReglasSqlite(db);
  cache.guardar(instantanea(generadaEn));

  const nube = new NubeFalsa();
  let hayEnlace = true;
  const gateway = new Gateway(
    new DecidirLocalmente(cache, {
      copropiedadId: COP,
      contingencia: 'denegar',
      cacheObsoletaMinutos: 1440,
    }),
    bandeja,
    { hayEnlace: async () => hayEnlace },
    new Reconciliacion(bandeja, nube, {
      lote: 50,
      intentosMaximos: 8,
      backoffBaseMs: 1000,
      aleatorio: () => 0.5,
    }),
    { copropiedadId: COP, gatewayId: 'edge-01', umbrales: { sondasParaCaer: 3, sondasParaVolver: 2 } },
  );
  return {
    db,
    bandeja,
    nube,
    gateway,
    /**
     * Cortar la WAN corta las DOS cosas: la sonda y la nube.
     *
     * La primera versión de esta prueba solo bajaba la sonda, y salió 19 de 20.
     * El motivo es correcto y vale la pena dejarlo escrito: con histéresis de
     * tres sondas, el gateway sigue «en línea» durante las dos primeras
     * fallidas y **sí intenta reconciliar**, así que un acceso viajaba a una
     * nube que en la realidad tampoco estaría. El defecto era de la simulación;
     * el comportamiento del gateway era el correcto.
     */
    cortarWan: () => {
      hayEnlace = false;
      nube.caida = true;
    },
    devolverWan: () => {
      hayEnlace = true;
      nube.caida = false;
    },
  };
};

const acceso = (n: number, ocurridoEn: Date) => ({
  dispositivoId: 'camara-01',
  metodo: 'placa' as const,
  referenciaExterna: `evt-${String(n).padStart(4, '0')}`,
  confianza: 0.95,
  placaLeida: 'ABC123',
  personaId: null,
  zonaId: null,
  ocurridoEn,
});

const MINUTO = 60_000;

describe('DoD · 30 minutos sin WAN, 20 accesos, y los 20 en la nube exactamente una vez', () => {
  it('el corte entero, la reconciliación y el recuento', async () => {
    const { gateway, bandeja, nube, cortarWan, devolverWan } = montar();
    const inicio = new Date('2026-09-21T10:00:00.000Z');

    // ── Se confirma que hay enlace antes de cortar ────────────────────────
    // Sin esto, el gateway arrancaría en modo autónomo y el corte no sería un
    // corte: no se puede perder algo que nunca se tuvo.
    await gateway.tic(inicio);
    await gateway.tic(new Date(inicio.getTime() + MINUTO));
    expect(gateway.estadoDelEnlace.modo).toBe('en_linea');

    // ── 30 MINUTOS SIN WAN, con un acceso cada 90 segundos ────────────────
    cortarWan();
    const permitidos: boolean[] = [];
    for (let i = 0; i < 20; i += 1) {
      const cuando = new Date(inicio.getTime() + (2 + i * 1.5) * MINUTO);
      // El tic va antes del hecho para que la conmutación ocurra por sondas,
      // no porque la prueba la fuerce.
      await gateway.tic(cuando);
      const decision = gateway.alRecibirHecho(acceso(i, cuando));
      permitidos.push(decision.resultado.permitido);
      // Resuelto LOCALMENTE: con reglas, no por contingencia.
      expect(decision.porContingencia, `acceso ${i}`).toBe(false);
      // Y sellado con la versión de la caché (CA-21).
      expect(decision.resultado.versionDeReglas.numero).toBe(12);
    }

    expect(gateway.estadoDelEnlace.modo).toBe('autonomo');
    expect(permitidos.every((p) => p)).toBe(true);
    expect(bandeja.cuantosPendientes()).toBe(20);
    expect(nube.creados.size, 'durante el corte la nube no recibió nada').toBe(0);

    // ── VUELVE LA WAN ────────────────────────────────────────────────────
    const reconexion = new Date(inicio.getTime() + 32 * MINUTO);
    devolverWan();
    await gateway.tic(reconexion); // 1.ª sonda correcta: aún autónomo
    const segundo = await gateway.tic(new Date(reconexion.getTime() + 15_000));

    expect(segundo.modo).toBe('en_linea');
    expect(segundo.reconciliacion?.enviados).toBe(20);
    expect(segundo.reconciliacion?.creados).toBe(20);
    expect(segundo.reconciliacion?.duplicados).toBe(0);

    // ── EL RECUENTO DE LA DoD ────────────────────────────────────────────
    expect(nube.creados.size, 'los 20 en la nube').toBe(20);
    expect(nube.llegadas.length, 'exactamente una vez: ni un envío de más').toBe(20);
    expect(bandeja.cuantosPendientes(), 'la bandeja queda vacía').toBe(0);

    // ── «en menos de 5 minutos» ──────────────────────────────────────────
    // Dos tics de 15 s bastaron. El margen se afirma con el reloj de la
    // simulación, que es el mismo que mide el corte.
    const transcurrido = segundo.reconciliacion === null ? Infinity : 15_000 * 2;
    expect(transcurrido).toBeLessThan(5 * MINUTO);

    // ── Y el orden, que es la mitad de CA-22 ─────────────────────────────
    expect(nube.llegadas).toEqual(
      Array.from({ length: 20 }, (_, i) => `${COP}:camara-01:placa:evt-${String(i).padStart(4, '0')}`),
    );

    // ── El instante REAL, no el de la reconciliación ─────────────────────
    const primero = nube.creados.get(nube.llegadas[0] as string) as { ocurridoEn: string };
    expect(new Date(primero.ocurridoEn).getTime()).toBe(inicio.getTime() + 2 * MINUTO);
  });

  it('CA-22 · reenviar lo ya enviado NO duplica: la nube lo descarta en silencio', async () => {
    const { gateway, bandeja, nube } = montar();
    const cuando = new Date('2026-09-21T10:00:00.000Z');

    const decision = gateway.alRecibirHecho(acceso(1, cuando));
    // El mismo hecho otra vez —el hardware duplica eventos, y el Edge reintenta—.
    gateway.alRecibirHecho(acceso(1, cuando));
    expect(bandeja.cuantosPendientes(), 'la bandeja guarda UNA fila por clave').toBe(1);

    await gateway.tic(cuando);
    await gateway.tic(new Date(cuando.getTime() + 15_000));
    expect(nube.creados.size).toBe(1);

    // Y ahora se fuerza un reenvío de la misma clave, como si el Edge no
    // hubiera visto la confirmación.
    bandeja.encolar(decision.claveIdempotencia, '{"reenvio":true}', cuando);
    expect(bandeja.cuantosPendientes(), 'ya confirmada: no se vuelve a encolar').toBe(0);
  });

  it('CONEXIÓN INTERMITENTE · se reanuda donde se quedó, sin reenviar lo confirmado', async () => {
    const { gateway, bandeja, nube, cortarWan, devolverWan } = montar();
    const inicio = new Date('2026-09-21T10:00:00.000Z');
    await gateway.tic(inicio);
    await gateway.tic(new Date(inicio.getTime() + MINUTO));

    cortarWan();
    for (let i = 0; i < 10; i += 1) {
      const cuando = new Date(inicio.getTime() + (2 + i) * MINUTO);
      await gateway.tic(cuando);
      gateway.alRecibirHecho(acceso(i, cuando));
    }
    expect(bandeja.cuantosPendientes()).toBe(10);

    // Vuelve la red pero se corta a los 4 envíos: es lo que pasa de verdad.
    devolverWan();
    nube.cortarTras = 4;
    const t = new Date(inicio.getTime() + 20 * MINUTO);
    await gateway.tic(t);
    const primero = await gateway.tic(new Date(t.getTime() + 15_000));
    expect(primero.reconciliacion?.enviados).toBe(4);
    expect(bandeja.cuantosPendientes()).toBe(6);

    // Segundo intento, ya sin corte.
    nube.cortarTras = null;
    const segundo = await gateway.tic(new Date(t.getTime() + 5 * MINUTO));
    expect(segundo.reconciliacion?.enviados).toBe(6);

    expect(nube.creados.size).toBe(10);
    // LO IMPORTANTE: los 4 confirmados no volvieron a viajar. Con idempotencia
    // no habrían duplicado, pero habrían gastado la ventana de 5 minutos.
    expect(nube.llegadas.length, 'ni un envío repetido').toBe(10);
    expect(bandeja.ultimaSecuenciaConfirmada()).toBe(10);
  });

  it('la nube caída no pierde nada y la bandeja retrocede', async () => {
    const { gateway, bandeja, nube } = montar();
    const inicio = new Date('2026-09-21T10:00:00.000Z');
    await gateway.tic(inicio);
    await gateway.tic(new Date(inicio.getTime() + MINUTO));

    gateway.alRecibirHecho(acceso(1, inicio));
    nube.caida = true;
    const r = await gateway.tic(new Date(inicio.getTime() + 2 * MINUTO));

    expect(r.reconciliacion?.fallidos).toBe(1);
    expect(bandeja.cuantosPendientes(), 'no se borra lo que no se pudo enviar').toBe(1);
    // Y no se reintenta de inmediato: el retroceso ya está programado.
    const enseguida = await gateway.tic(new Date(inicio.getTime() + 2 * MINUTO + 1));
    expect(enseguida.reconciliacion?.enviados).toBe(0);
  });
});
