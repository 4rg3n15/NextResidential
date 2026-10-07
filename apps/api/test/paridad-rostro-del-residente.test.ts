import { describe, expect, it } from 'vitest';
import { VersionDeReglas, esExito } from '@ncr/domain-core';
import type { Bitacora, ResultadoAcceso } from '@ncr/domain-core';
import { CargadorDeContextoPg, DecidirAcceso } from '../src/autorizaciones';
import type {
  LectorDeUmbralDeConfianza,
  RepositorioAutorizaciones,
  RepositorioListaNegra,
  ResidenteResuelto,
  ResolutorDePlaca,
} from '../src/autorizaciones';
import { contenidoDe, hashDe } from '../src/edge/aplicacion/instantanea';
import type { LecturasDeReglas } from '../src/edge/aplicacion/puertos';
import { DecidirLocalmente } from '../../edge/src/aplicacion/decidir-localmente';
import type { InstantaneaDeReglas } from '../../edge/src/aplicacion/instantanea-de-reglas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · D1 · RN-16 · EL ROSTRO DEL RESIDENTE: MISMA DECISIÓN, MISMA VERSIÓN
 *
 * Los dos caminos completos, sin base: la NUBE con su cargador y los mismos
 * datos que leería de PostgreSQL; el EDGE con la instantánea que la nube
 * construiría con esos datos (`contenidoDe`) y su `DecidirLocalmente`. Las dos
 * sellan la MISMA versión de reglas, así que se compara el resultado entero.
 * Contra la base real lo cubre `edge-misma-decision-pg.e2e.test.ts`.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const COP = '10000000-0000-4000-8000-000000000001';
const PERSONA = '40000000-0000-4000-8000-0000000000d1';
const VIVIENDA = '30000000-0000-4000-8000-000000000001';
const TERMINAL = '90000000-0000-4000-8000-0000000000d1';
const AHORA = new Date('2026-10-07T14:00:00Z');
const NUMERO = 7;
const bitacora: Bitacora = { registrar: () => undefined };

const version = (() => {
  const v = VersionDeReglas.crear(NUMERO, COP);
  if (!esExito(v)) throw new Error('versión de prueba');
  return v.valor;
})();

interface Caso {
  readonly nombre: string;
  readonly esperado: string;
  readonly residente: ResidenteResuelto;
  readonly consentido: boolean;
  readonly vetado: boolean;
}

const RESIDENTE: ResidenteResuelto = {
  residenteId: '60000000-0000-4000-8000-0000000000d1',
  personaId: PERSONA,
  viviendaId: VIVIENDA,
  viviendaActiva: true,
  registradoEn: new Date('2026-01-15T12:00:00Z'),
  bajaEn: null,
};

const CASOS: readonly Caso[] = [
  {
    nombre: 'residente',
    esperado: 'PERMITIDO',
    residente: RESIDENTE,
    consentido: true,
    vetado: false,
  },
  {
    nombre: 'vetado',
    esperado: 'LISTA_NEGRA',
    residente: RESIDENTE,
    consentido: true,
    vetado: true,
  },
  {
    nombre: 'sin consentimiento',
    esperado: 'SIN_CONSENTIMIENTO',
    residente: RESIDENTE,
    consentido: false,
    vetado: false,
  },
  {
    nombre: 'de baja',
    esperado: 'VIGENCIA_EXPIRADA',
    residente: { ...RESIDENTE, viviendaActiva: false, bajaEn: new Date('2026-10-01T05:00:00Z') },
    consentido: true,
    vetado: false,
  },
];

const nube = (c: Caso): Promise<ResultadoAcceso> =>
  new DecidirAcceso(
    new CargadorDeContextoPg(
      { vigenteDe: async () => version },
      { activasParaLectura: async () => [] } as unknown as RepositorioAutorizaciones,
      { resolver: async () => null } as ResolutorDePlaca,
      {
        activasDe: async () => (c.vetado ? [{ personaId: PERSONA, placa: null }] : []),
      } as unknown as RepositorioListaNegra,
      { umbralDeConfianzaPlaca: async () => 0.8 } as LectorDeUmbralDeConfianza,
      bitacora,
      undefined,
      { consentimientoVigente: async () => c.consentido },
      { resolver: async (_cop, persona) => (persona === PERSONA ? c.residente : null) },
    ),
    { ahora: () => AHORA },
  ).ejecutar({
    copropiedadId: COP,
    dispositivoId: TERMINAL,
    metodo: 'facial',
    personaId: PERSONA,
    placaLeida: null,
    zonaId: null,
    confianza: 1,
  });

const edge = (c: Caso) => {
  const lecturas: LecturasDeReglas = {
    autorizaciones: [],
    vehiculos: [],
    viviendasActivas: c.residente.viviendaActiva ? [VIVIENDA] : [],
    vetos: c.vetado ? [{ personaId: PERSONA, placa: null }] : [],
    zonas: [],
    plantillas: [
      {
        plantillaId: '80000000-0000-4000-8000-0000000000d1',
        personaId: PERSONA,
        reconocibleHasta: c.consentido ? new Date('2027-10-07T00:00:00Z') : null,
      },
    ],
    residentesConRostro: [c.residente],
    umbralDeConfianza: 0.8,
  };
  const contenido = contenidoDe(COP, lecturas, AHORA);
  const instantanea = {
    ...contenido,
    copropiedadId: COP,
    version: NUMERO,
    hash: hashDe(contenido),
    generadaEn: AHORA.toISOString(),
  } as unknown as InstantaneaDeReglas;
  return new DecidirLocalmente(
    { vigente: () => instantanea, guardar: () => false },
    { copropiedadId: COP, contingencia: 'denegar', cacheObsoletaMinutos: 1440 },
  ).decidir({
    dispositivoId: TERMINAL,
    metodo: 'facial',
    referenciaExterna: 'paridad-rostro',
    confianza: 1,
    placaLeida: null,
    personaId: PERSONA,
    zonaId: null,
    ocurridoEn: AHORA,
  });
};

const motivo = (r: ResultadoAcceso): string => (r.permitido ? 'PERMITIDO' : r.motivo);

describe('15-X · D1 · RN-16 · el rostro del residente, en la nube y en el Edge', () => {
  it.each(CASOS)('$nombre → $esperado en los dos, con la misma versión', async (c) => {
    const enLaNube = await nube(c);
    const enElEdge = edge(c);
    expect(enElEdge.porContingencia).toBe(false);
    expect(motivo(enLaNube)).toBe(c.esperado);
    expect(enElEdge.resultado).toEqual(enLaNube);
    expect(enElEdge.resultado.versionDeReglas.numero).toBe(NUMERO);
  });
});
