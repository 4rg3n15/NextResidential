import { describe, expect, it } from 'vitest';
import { derechoDelResidente, derechoDelResidentePorPersona } from './derecho-del-residente';
import type { ResidenteResuelto } from './residentes-por-persona';

/**
 * 15-X · D1 · el derecho del residente, también por su ROSTRO.
 *
 * Hasta la 15-X el derecho sintético (S-33) sólo nacía de un vehículo del
 * padrón: el rostro de un residente llegaba al motor sin vivienda y salía
 * FALLO_TECNICO por `politica.vivienda`, en la nube y en el Edge. El derecho
 * por persona usa la MISMA vigencia que el del vehículo: desde el alta y sin
 * caducidad mientras siga viviendo allí; con la baja —del residente, de la
 * persona o de la vivienda— vence en ella.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const ALTA = new Date('2026-01-15T12:00:00Z');
const CIEN_ANOS_MS = 100 * 365 * 24 * 3600 * 1000;

const residente = (p: Partial<ResidenteResuelto> = {}): ResidenteResuelto => ({
  residenteId: 'r-1',
  personaId: 'p-1',
  viviendaId: 'v-1',
  viviendaActiva: true,
  registradoEn: ALTA,
  bajaEn: null,
  ...p,
});

describe('15-X · D1 · derechoDelResidentePorPersona', () => {
  it('residente en servicio: su vivienda, su persona y la vigencia sin caducidad', () => {
    const d = derechoDelResidentePorPersona(COP, residente());
    expect(d).not.toBeNull();
    expect(d?.id).toBe('residente:persona:r-1');
    expect(d?.personaId).toBe('p-1');
    expect(d?.viviendaId).toBe('v-1');
    expect(d?.copropiedadId).toBe(COP);
    expect(d?.vigencia.desde).toEqual(ALTA);
    expect(d?.vigencia.hasta).toEqual(new Date(ALTA.getTime() + CIEN_ANOS_MS));
    expect(d?.estaVigenteEn(new Date('2026-10-07T12:00:00Z'))).toBe(true);
  });

  it('con la baja, el derecho vence en ella: un segundo antes rige, en ella ya no', () => {
    const baja = new Date('2026-10-01T05:00:00Z');
    const d = derechoDelResidentePorPersona(COP, residente({ bajaEn: baja }));
    expect(d?.vigencia.hasta).toEqual(baja);
    expect(d?.estaVigenteEn(new Date(baja.getTime() - 1000))).toBe(true);
    expect(d?.estaVigenteEn(baja)).toBe(false);
  });

  it('una baja que no es posterior al alta no fabrica un derecho', () => {
    expect(derechoDelResidentePorPersona(COP, residente({ bajaEn: ALTA }))).toBeNull();
  });

  it('no se confunde con el del vehículo: otro prefijo, otro identificador', () => {
    const porVehiculo = derechoDelResidente(COP, {
      vehiculoId: 'r-1',
      viviendaId: 'v-1',
      viviendaActiva: true,
      viviendaDesactivadaEn: null,
      personaId: 'p-1',
      registradoEn: ALTA,
    });
    expect(porVehiculo?.id).toBe('residente:r-1');
    expect(derechoDelResidentePorPersona(COP, residente())?.id).not.toBe(porVehiculo?.id);
    expect(porVehiculo?.vigencia.hasta).toEqual(
      derechoDelResidentePorPersona(COP, residente())?.vigencia.hasta,
    );
  });
});
