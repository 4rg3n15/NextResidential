import { describe, expect, it } from 'vitest';
import { derechoDelResidentePorPersona } from '../../autorizaciones';
import type { ResidenteResuelto } from '../../autorizaciones';
import { contenidoDe, hashDe } from './instantanea';
import type { LecturasDeReglas } from './puertos';

/**
 * 15-X · D1 · el derecho del residente por su rostro VIAJA al Edge.
 *
 * Sin él, el Edge negaba con FALLO_TECNICO el rostro que la nube ya permite: la
 * misma lectura, dos veredictos (RN-16). Viaja como el del vehículo, como una
 * autorización sintética construida con la MISMA función que usa el cargador
 * de la nube, y sin nada que no lleve ya: identificadores y vigencia.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-10-07T12:00:00Z');

const residente = (p: Partial<ResidenteResuelto> = {}): ResidenteResuelto => ({
  residenteId: '60000000-0000-4000-8000-000000000001',
  personaId: '40000000-0000-4000-8000-000000000009',
  viviendaId: '30000000-0000-4000-8000-000000000001',
  viviendaActiva: true,
  registradoEn: new Date('2026-01-15T12:00:00Z'),
  bajaEn: null,
  ...p,
});

const lecturas = (residentes: readonly ResidenteResuelto[]): LecturasDeReglas => ({
  autorizaciones: [],
  vehiculos: [],
  viviendasActivas: ['30000000-0000-4000-8000-000000000001'],
  vetos: [],
  zonas: [],
  plantillas: [],
  residentesConRostro: residentes,
  umbralDeConfianza: 0.8,
});

describe('15-X · D1 · la instantánea lleva el derecho del residente por su rostro', () => {
  it('como autorización sintética, igual a la de la nube', () => {
    const r = residente();
    const c = contenidoDe(COP, lecturas([r]), AHORA);
    const nube = derechoDelResidentePorPersona(COP, r);
    expect(c.autorizaciones).toEqual([
      expect.objectContaining({
        id: `residente:persona:${r.residenteId}`,
        personaId: r.personaId,
        viviendaId: r.viviendaId,
        desde: nube?.vigencia.desde.toISOString(),
        hasta: nube?.vigencia.hasta.toISOString(),
        estado: 'vigente',
        placa: null,
      }),
    ]);
  });

  it('el residente de baja viaja con su derecho vencido en la baja', () => {
    const baja = new Date('2026-10-01T05:00:00Z');
    const c = contenidoDe(COP, lecturas([residente({ bajaEn: baja })]), AHORA);
    expect(c.autorizaciones[0]?.hasta).toBe(baja.toISOString());
  });

  it('un residente más cambia el hash: el Edge recibe una versión nueva', () => {
    const sin = hashDe(contenidoDe(COP, lecturas([]), AHORA));
    expect(hashDe(contenidoDe(COP, lecturas([residente()]), AHORA))).not.toBe(sin);
  });

  it('el orden de lectura no cambia el hash', () => {
    const a = residente();
    const b = residente({
      residenteId: '60000000-0000-4000-8000-000000000002',
      personaId: '40000000-0000-4000-8000-000000000008',
    });
    expect(hashDe(contenidoDe(COP, lecturas([a, b]), AHORA))).toBe(
      hashDe(contenidoDe(COP, lecturas([b, a]), AHORA)),
    );
  });
});
