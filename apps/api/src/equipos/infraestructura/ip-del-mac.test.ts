import { describe, expect, it } from 'vitest';
import { IpDelMacPorInterfaces, SecretosDeLaDeclaracion } from './ip-del-mac';

/** RFC 5737: ninguna dirección es de nadie. */
const CABLE = {
  address: '198.51.100.7',
  netmask: '255.255.255.0', // kpi-11-exento: máscara /24, no una dirección
  family: 'IPv4',
  internal: false,
};

describe('C2 · la IP del Mac hacia cada cámara, y el secreto declarado', () => {
  it('lee las interfaces en cada llamada: el Mac cambia de red sin reiniciar', () => {
    let interfaces: Record<string, (typeof CABLE)[]> = {};
    const resolutor = new IpDelMacPorInterfaces(undefined, () => interfaces);
    expect(resolutor.hacia('198.51.100.40').ip).toBeNull();
    interfaces = { en7: [CABLE] };
    expect(resolutor.hacia('198.51.100.40')).toEqual({ ip: '198.51.100.7' });
  });

  it('la anunciada manda', () => {
    const resolutor = new IpDelMacPorInterfaces('203.0.113.5', () => ({ en7: [CABLE] }));
    expect(resolutor.hacia('198.51.100.40')).toEqual({ ip: '203.0.113.5' });
  });

  it('el secreto sale de ALARM_SERVER_EQUIPOS por dispositivo; sin declarar, null', () => {
    const secreto = 'a'.repeat(40);
    const s = new SecretosDeLaDeclaracion(`cop-1|camara-1|${secreto}|198.51.100.40`);
    expect(s.secretoDe('camara-1')).toBe(secreto);
    expect(s.secretoDe('otra')).toBeNull();
    expect(new SecretosDeLaDeclaracion(undefined).secretoDe('camara-1')).toBeNull();
  });
});
