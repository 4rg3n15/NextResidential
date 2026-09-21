import { describe, expect, it } from 'vitest';
import { DatabaseSync } from '../src/infraestructura/sqlite/motor';
import { ESQUEMA, abrirBase } from '../src/infraestructura/sqlite/esquema';
import { BandejaSqlite } from '../src/infraestructura/sqlite/bandeja-sqlite';
import { CacheDeReglasSqlite } from '../src/infraestructura/sqlite/cache-de-reglas';
import { DecidirLocalmente } from '../src/aplicacion/decidir-localmente';
import { Reconciliacion } from '../src/aplicacion/reconciliacion';
import { Gateway } from '../src/aplicacion/gateway';
import type { InstantaneaDeReglas } from '../src/aplicacion/instantanea-de-reglas';
import type { ClienteDeNube } from '../src/aplicacion/puertos';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const COP = '11111111-1111-4111-8111-111111111111';
const VIVIENDA = '22222222-2222-4222-8222-222222222222';
const PERSONA = '33333333-3333-4333-8333-333333333333';
const AHORA = new Date('2026-09-21T10:00:00.000Z');

const instantanea: InstantaneaDeReglas = {
  copropiedadId: COP,
  version: 4,
  generadaEn: AHORA.toISOString(),
  autorizaciones: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      viviendaId: VIVIENDA,
      personaId: PERSONA,
      desde: '2026-09-21T00:00:00.000Z',
      hasta: '2026-09-22T00:00:00.000Z',
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

const nubeQueAcepta = (): ClienteDeNube => ({
  reconciliar: async (lote) =>
    lote.map((e) => ({ claveIdempotencia: e.claveIdempotencia, aceptado: true, duplicado: false })),
  descargarReglas: async () => null,
});

const montar = (opciones: { contingencia?: 'denegar' | 'escalar'; conCache?: boolean } = {}) => {
  const db = new DatabaseSync(':memory:');
  db.exec(ESQUEMA);
  const bandeja = new BandejaSqlite(db);
  const cache = new CacheDeReglasSqlite(db);
  if (opciones.conCache !== false) cache.guardar(instantanea);
  let hayEnlace = true;
  const gateway = new Gateway(
    new DecidirLocalmente(cache, {
      copropiedadId: COP,
      contingencia: opciones.contingencia ?? 'denegar',
      cacheObsoletaMinutos: 1440,
    }),
    bandeja,
    { hayEnlace: async () => hayEnlace },
    new Reconciliacion(bandeja, nubeQueAcepta(), {
      lote: 50,
      intentosMaximos: 8,
      backoffBaseMs: 1000,
      aleatorio: () => 0.5,
    }),
    { copropiedadId: COP, gatewayId: 'edge-01', umbrales: { sondasParaCaer: 2, sondasParaVolver: 1 } },
  );
  return { gateway, bandeja, ponerEnlace: (v: boolean) => (hayEnlace = v) };
};

const hecho = (cambios: Record<string, unknown> = {}) => ({
  dispositivoId: 'camara-01',
  metodo: 'placa' as const,
  referenciaExterna: 'evt-0001',
  confianza: 0.95,
  placaLeida: 'ABC123',
  personaId: null,
  zonaId: null,
  ocurridoEn: AHORA,
  ...cambios,
});

describe('gateway', () => {
  it('EL CUERPO LLEVA LA DECISIÓN SELLADA, no los datos para recalcularla', () => {
    // Es lo que hace auditable la reconciliación (CA-21): la nube escribe lo
    // que el Edge decidió, no lo que decidiría hoy.
    const { gateway, bandeja } = montar();
    gateway.alRecibirHecho(hecho());
    const cuerpo = JSON.parse(bandeja.pendientes(AHORA, 1)[0]!.cuerpo);

    expect(cuerpo.decision.permitido).toBe(true);
    expect(cuerpo.decision.versionDeReglas).toBe(4);
    expect(cuerpo.decision.reglaAplicada).toBeTypeOf('string');
    expect(cuerpo.ocurridoEn).toBe(AHORA.toISOString());
    expect(cuerpo.cachePotencialmenteObsoleto).toBe(false);
    expect(cuerpo.confianzaCentesimas).toBe(95);
  });

  it('una DENEGACIÓN viaja con su motivo (CA-16)', () => {
    const { gateway, bandeja } = montar({ conCache: false });
    gateway.alRecibirHecho(hecho());
    const cuerpo = JSON.parse(bandeja.pendientes(AHORA, 1)[0]!.cuerpo);
    expect(cuerpo.decision.permitido).toBe(false);
    expect(cuerpo.decision.motivo).toBe('FALLO_TECNICO');
  });

  it('los campos opcionales ausentes NO viajan como null', () => {
    // El DTO de la API corre con `forbidNonWhitelisted` y valida `@IsUUID` en
    // los opcionales: un `personaId: null` explícito sería un 400 en mitad de
    // la reconciliación, y el Edge lo reintentaría para siempre.
    const { gateway, bandeja } = montar();
    gateway.alRecibirHecho(hecho({ personaId: null, zonaId: null }));
    const cuerpo = JSON.parse(bandeja.pendientes(AHORA, 1)[0]!.cuerpo);
    expect('personaId' in cuerpo).toBe(false);
    expect('zonaId' in cuerpo).toBe(false);
    expect('placaLeida' in cuerpo).toBe(true);
  });

  it('una decisión SIN clave no se encola', () => {
    const { gateway, bandeja } = montar();
    gateway.alRecibirHecho(hecho({ referenciaExterna: 'con espacios y símbolos ¿?' }));
    expect(bandeja.cuantosPendientes()).toBe(0);
  });

  it('el tic sin enlace no llama a la reconciliación', async () => {
    const { gateway, ponerEnlace } = montar();
    ponerEnlace(false);
    const r = await gateway.tic(AHORA);
    expect(r.modo).toBe('autonomo');
    expect(r.reconciliacion).toBeNull();
  });

  it('la conmutación se informa UNA vez, no en cada tic', async () => {
    const { gateway, ponerEnlace } = montar();
    expect((await gateway.tic(AHORA)).conmuto).toBe(true); // autonomo → en_linea
    expect((await gateway.tic(AHORA)).conmuto).toBe(false);
    ponerEnlace(false);
    await gateway.tic(AHORA);
    expect((await gateway.tic(AHORA)).conmuto).toBe(true); // en_linea → autonomo
  });

  it('UNA LECTURA DUDOSA se permite PERO marcada (CU-01 3a)', () => {
    // Entre la mitad del umbral y el umbral: no es inservible —negarla sería un
    // falso rechazo de un vehículo legítimo con la placa sucia— pero tampoco se
    // decide sola. El marcado viaja en el cuerpo para que la nube lo registre.
    const { gateway, bandeja } = montar();
    gateway.alRecibirHecho(hecho({ confianza: 0.5 }));
    const cuerpo = JSON.parse(bandeja.pendientes(AHORA, 1)[0]!.cuerpo);
    expect(cuerpo.decision.permitido).toBe(true);
    expect(cuerpo.decision.requiereConfirmacionHumana).toBe(true);
  });

  it('una lectura buena NO lleva la marca: el campo solo aparece si aplica', () => {
    const { gateway, bandeja } = montar();
    gateway.alRecibirHecho(hecho({ confianza: 0.95 }));
    const cuerpo = JSON.parse(bandeja.pendientes(AHORA, 1)[0]!.cuerpo);
    expect('requiereConfirmacionHumana' in cuerpo.decision).toBe(false);
  });
});

describe('abrirBase · el fichero de verdad', () => {
  it('crea el esquema sobre un fichero nuevo y sobrevive al reinicio', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ncr-edge-'));
    try {
      const ruta = join(dir, 'edge.sqlite');
      const primera = abrirBase(ruta);
      new BandejaSqlite(primera).encolar('k1', '{"a":1}', AHORA);
      primera.close();

      // El caso real: el gateway se reinicia y vuelve a abrir SU fichero.
      const segunda = abrirBase(ruta);
      expect(new BandejaSqlite(segunda).cuantosPendientes()).toBe(1);
      segunda.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
