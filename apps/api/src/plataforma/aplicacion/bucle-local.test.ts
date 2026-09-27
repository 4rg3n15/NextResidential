import { describe, expect, it } from 'vitest';
import {
  AjustesDePlataformaEnMemoria,
  RegistroDePresenciaEnMemoria,
  RegistroDeSeguridadEnMemoria,
  ReglasDeIpEnMemoria,
} from '../infraestructura/plataforma-en-memoria';
import { ControlDeIpDePorteros } from './control-de-ip';
import { ModoPruebas } from './modo-pruebas';
import { MENSAJE_GUARDIA_REMOTA, evaluarIpDePortero, ipEnRedes } from './politica-de-ip';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ÍTEM 9 DE LA CORRECCIÓN (15-L) · EL BUCLE LOCAL ES UNA SOLA DIRECCIÓN
 *
 * En el Mac de la entrega la consola y la API comparten máquina: según por
 * dónde entre el navegador, la petición llega como `::1`, `127.0.0.1` o
 * `::ffff:127.0.0.1`, y la lista de portería puede tener escrita cualquiera
 * de las tres. Eran tres direcciones distintas para la regla, y un portero
 * quedaba fuera desde la misma máquina que la lista autoriza.
 *
 * Se prueban las tres grafías en los DOS sentidos —como IP de la petición y
 * como entrada de la lista—, y que cualquier otra dirección, incluida otra
 * del bucle local, sigue fuera.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const GRAFIAS = ['::1', '127.0.0.1', '::ffff:127.0.0.1'] as const;
// Bucle local y RFC 5737/3849: ninguna es de un equipo.
const OTRAS = ['127.0.0.2', '::2', '::ffff:127.0.0.2', '192.0.2.1', '2001:db8::1'] as const; // kpi-11-exento
/** Las redes del bucle local, en las grafías que un administrador escribe. */
const REDES_DEL_BUCLE = [
  '::1/128',
  '::ffff:127.0.0.1/128',
  '127.0.0.1/32',
  '127.0.0.0/8', // kpi-11-exento: red del bucle local
] as const;
const COP = '10000000-0000-4000-8000-000000000001';
const PORTERO = '60000000-0000-4000-8000-000000000001';

describe('ipEnRedes · las tres grafías del bucle local son la misma dirección', () => {
  for (const peticion of GRAFIAS) {
    for (const lista of GRAFIAS) {
      it(`una petición desde ${peticion} entra con ${lista} en la lista`, () => {
        expect(ipEnRedes(peticion, [lista])).toBe(true);
      });
    }
  }

  it('y también como red, en las cuatro grafías del bucle local', () => {
    for (const red of REDES_DEL_BUCLE) {
      for (const peticion of GRAFIAS)
        expect(ipEnRedes(peticion, [red]), `${peticion} ∈ ${red}`).toBe(true);
    }
  });

  it('cualquier OTRA dirección se sigue rechazando, con la lista en cualquier grafía', () => {
    for (const lista of GRAFIAS) {
      for (const otra of OTRAS) expect(ipEnRedes(otra, [lista]), `${otra} ∉ ${lista}`).toBe(false);
    }
  });
});

describe('evaluarIpDePortero · las tres vías de entrada aceptan cualquier grafía', () => {
  const vacias = { ipsPorteria: [], ipsRemotas: [] };

  it('portería escrita `127.0.0.1`, petición desde `::1`: consola presencial', () => {
    const v = evaluarIpDePortero({
      ip: '::1',
      reglas: { ...vacias, ipsPorteria: ['127.0.0.1'] },
      ipsDeSuperadministrador: [],
      soloRemota: false,
    });
    expect(v).toEqual({ permitido: true, via: 'porteria' });
  });

  it('guardia remota escrita `::1`, petición desde `::ffff:127.0.0.1`', () => {
    const v = evaluarIpDePortero({
      ip: '::ffff:127.0.0.1',
      reglas: { ...vacias, ipsRemotas: ['::1'] },
      ipsDeSuperadministrador: [],
      soloRemota: true,
    });
    expect(v).toEqual({ permitido: true, via: 'remota' });
  });

  it('lista remota vacía: la sesión del superadministrador en `::1` vale para `127.0.0.1`', () => {
    const v = evaluarIpDePortero({
      ip: '127.0.0.1',
      reglas: vacias,
      ipsDeSuperadministrador: ['::1'],
      soloRemota: true,
    });
    expect(v).toEqual({ permitido: true, via: 'superadministrador' });
  });

  it('otra dirección del bucle local no es la de la lista', () => {
    const v = evaluarIpDePortero({
      ip: '127.0.0.2', // kpi-11-exento: bucle local
      reglas: { ...vacias, ipsPorteria: ['::1'] },
      ipsDeSuperadministrador: [],
      soloRemota: false,
    });
    expect(v.permitido).toBe(false);
  });
});

describe('ControlDeIpDePorteros · con el modo pruebas APAGADO, la regla corta de verdad', () => {
  const montar = async () => {
    const ajustes = new AjustesDePlataformaEnMemoria();
    await ajustes.fijarModoPruebas(false, 'suite');
    const reglas = new ReglasDeIpEnMemoria();
    reglas.fijar(COP, { ipsPorteria: ['127.0.0.1'], ipsRemotas: [] });
    const seguridad = new RegistroDeSeguridadEnMemoria();
    const control = new ControlDeIpDePorteros(
      reglas,
      new RegistroDePresenciaEnMemoria(),
      new ModoPruebas(ajustes, () => 0),
      seguridad,
      () => 0,
    );
    return { control, seguridad };
  };
  const desde = (ip: string) => ({
    copropiedadId: COP,
    usuarioId: PORTERO,
    ip,
    agente: 'navegador',
    soloRemota: false,
    recurso: 'GET /copropiedades/:id/porteria/evento-actual',
  });

  it('las tres grafías entran sin «habría sido rechazado»', async () => {
    const { control, seguridad } = await montar();
    for (const ip of GRAFIAS) {
      expect(await control.evaluar(desde(ip)), ip).toEqual({
        permitido: true,
        habriaSidoRechazado: false,
      });
    }
    expect(seguridad.eventos).toEqual([]);
  });

  it('otra dirección: 403 con el texto exacto y su fila', async () => {
    const { control, seguridad } = await montar();
    expect(await control.evaluar(desde('192.0.2.1'))).toEqual({
      permitido: false,
      mensaje: MENSAJE_GUARDIA_REMOTA,
    });
    expect(seguridad.eventos).toMatchObject([
      { tipo: 'restriccion_de_ip', ip: '192.0.2.1', resultado: '403' },
    ]);
  });
});
