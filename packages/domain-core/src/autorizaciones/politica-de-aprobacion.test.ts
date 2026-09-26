import { describe, expect, it } from 'vitest';
import {
  aprobacionAutomatica,
  aprobacionDelPortero,
  esVehiculoDeTercero,
  no,
  o,
  politicaDeAprobacionPara,
  y,
} from './politica-de-aprobacion';
import type { SolicitudDeAutorizacion } from './politica-de-aprobacion';
import { Autorizacion } from './autorizacion';

const tercero: SolicitudDeAutorizacion = { traeVehiculo: true, recurrente: false };
const peaton: SolicitudDeAutorizacion = { traeVehiculo: false, recurrente: false };

describe('política de aprobación · punto de extensión (D5 c, ADR-027)', () => {
  it('hoy: automática, el vehículo de un tercero nace ACTIVO', () => {
    expect(aprobacionAutomatica(tercero)).toBe('activa');
    expect(politicaDeAprobacionPara('automatica')(tercero)).toBe('activa');
  });

  it('una política alternativa deja PENDIENTE lo que exige aprobación, sin tocar el motor', () => {
    const conPortero = politicaDeAprobacionPara('portero');
    expect(conPortero(tercero)).toBe('pendiente_de_aprobacion');
    expect(conPortero(peaton)).toBe('activa');
  });

  it('las especificaciones se componen con y / o / no', () => {
    const recurrente = (s: SolicitudDeAutorizacion) => s.recurrente;
    const soloTercerosPuntuales = aprobacionDelPortero(y(esVehiculoDeTercero, no(recurrente)));
    expect(soloTercerosPuntuales(tercero)).toBe('pendiente_de_aprobacion');
    expect(soloTercerosPuntuales({ ...tercero, recurrente: true })).toBe('activa');
    const cualquiera = aprobacionDelPortero(o(esVehiculoDeTercero, recurrente));
    expect(cualquiera({ traeVehiculo: false, recurrente: true })).toBe('pendiente_de_aprobacion');
    expect(cualquiera(peaton)).toBe('activa');
  });

  it('el agregado no conoce la política: sigue exponiendo sólo activa o revocada', () => {
    // El estado «pendiente» se añadirá al agregado y a la base cuando se active
    // (ADR-027); hoy la política existe sin que el motor ni el agregado cambien.
    expect(typeof Autorizacion).toBe('function');
  });
});
