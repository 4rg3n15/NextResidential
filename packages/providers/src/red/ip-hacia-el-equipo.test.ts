import { describe, expect, it } from 'vitest';
import { ipHaciaElEquipo, mismaSubred } from './ip-hacia-el-equipo';

/**
 * Direcciones de documentación (RFC 5737) y privadas compuestas: ninguna es de
 * un equipo real (KPI-11).
 */
const ip = (...o: number[]): string => o.join('.');
const WIFI = {
  address: ip(192, 0, 2, 10),
  netmask: ip(255, 255, 255, 0),
  family: 'IPv4',
  internal: false,
};
const CABLE = {
  address: ip(198, 51, 100, 7),
  netmask: ip(255, 255, 255, 0),
  family: 4,
  internal: false,
};
const BUCLE = {
  address: ip(127, 0, 0, 1),
  netmask: ip(255, 0, 0, 0),
  family: 'IPv4',
  internal: true,
};
const V6 = {
  address: 'fe80::1',
  netmask: 'ffff:ffff:ffff:ffff::',
  family: 'IPv6',
  internal: false,
};

describe('C2 · la IP del Mac que ve el equipo', () => {
  it('elige la interfaz cuya subred contiene al equipo, no la primera', () => {
    const r = ipHaciaElEquipo(ip(198, 51, 100, 40), {
      en0: [WIFI, V6],
      en7: [CABLE],
      lo0: [BUCLE],
    });
    expect(r).toEqual({ ip: CABLE.address, origen: 'subred', interfaz: 'en7' });
  });

  it('la anunciada manda sobre las interfaces', () => {
    const r = ipHaciaElEquipo(ip(198, 51, 100, 40), { en7: [CABLE] }, ip(203, 0, 113, 5));
    expect(r).toEqual({ ip: ip(203, 0, 113, 5), origen: 'anunciada', interfaz: null });
  });

  it('una anunciada que no es IPv4 se dice, no se usa', () => {
    const r = ipHaciaElEquipo(ip(198, 51, 100, 40), { en7: [CABLE] }, 'mac.local');
    expect(r.ip).toBeNull();
    expect('motivo' in r && r.motivo).toMatch(/ALARM_SERVER_IP_ANUNCIADA/);
  });

  it('sin interfaz en la red del equipo: null con el remedio, nunca otra IP', () => {
    const r = ipHaciaElEquipo(ip(203, 0, 113, 9), { en0: [WIFI], lo0: [BUCLE] });
    expect(r.ip).toBeNull();
    expect('motivo' in r && r.motivo).toMatch(/no tiene ninguna IP en la red del equipo/);
  });

  it('un equipo registrado por nombre no permite deducir la red', () => {
    const r = ipHaciaElEquipo('camara.local', { en0: [WIFI] });
    expect('motivo' in r && r.motivo).toMatch(/por nombre/);
  });

  it('la máscara decide: /16 incluye lo que /24 no', () => {
    expect(mismaSubred(ip(10, 1, 2, 3), ip(10, 1, 9, 9), ip(255, 255, 0, 0))).toBe(true);
    expect(mismaSubred(ip(10, 1, 2, 3), ip(10, 1, 9, 9), ip(255, 255, 255, 0))).toBe(false);
    expect(mismaSubred('x', ip(10, 1, 9, 9), ip(255, 255, 255, 0))).toBe(false);
  });
});
