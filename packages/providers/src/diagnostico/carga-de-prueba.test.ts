import { describe, expect, it } from 'vitest';
import { cargaDePruebaDeRostro } from './carga-de-prueba';
import { equipoSimulado } from '../simulacion/equipo-simulado';

const IMAGEN = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const ID = '5e2b7c1a-0000-4000-8000-0000000000c1';

const conexion = (peticion: typeof fetch) => ({
  host: 'terminal.invalid',
  usuario: 'servicio',
  clave: 'k',
  peticion,
});

describe('15-K (§5) · la carga de prueba de la captura de sitio', () => {
  it('si el equipo ACEPTA la imagen sin rostro, lo dice, la suprime y pide la baja', async () => {
    const simulado = equipoSimulado({ familia: 'terminal', usuario: 'servicio', clave: 'k' });
    const r = await cargaDePruebaDeRostro(conexion(simulado), IMAGEN, ID);
    expect(r.aceptada).toBe(true);
    expect(r.rechazo).toBeNull();
    expect(r.baja).toEqual({ estado: 200, ok: true });
    expect(r.employeeNo).toBe('5e2b7c1a0000400080000000000000c1');
  });

  it('si la RECHAZA, conserva el motivo del equipo y pide la baja igualmente', async () => {
    const simulado = equipoSimulado({ familia: 'terminal', usuario: 'servicio', clave: 'k' });
    const vistas: string[] = [];
    const peticion: typeof fetch = async (url, opciones) => {
      vistas.push(String(url));
      if (String(url).includes('/FDSetUp')) {
        return {
          status: 400,
          ok: false,
          headers: new Headers(),
          text: async () =>
            '{"statusCode":6,"subStatusCode":"badParameters","errorCode":1610637344,"errorMsg":"prueba"}',
          body: null,
        } as unknown as Response;
      }
      return simulado(url, opciones);
    };
    const r = await cargaDePruebaDeRostro(conexion(peticion), IMAGEN, ID);
    expect(r.aceptada).toBe(false);
    expect(r.rechazo).toMatch(/badParameters|prueba/);
    expect(r.baja?.ok).toBe(true);
    // Rechazada, no hay nada que suprimir de la biblioteca: sólo la persona.
    expect(vistas.some((u) => u.includes('/FDSearch/Delete'))).toBe(false);
    expect(vistas.some((u) => u.includes('/UserInfoDetail/Delete'))).toBe(true);
  });

  it('si la baja no se puede ni pedir, lo devuelve con el employeeNo para borrarla a mano', async () => {
    const simulado = equipoSimulado({ familia: 'terminal', usuario: 'servicio', clave: 'k' });
    const peticion: typeof fetch = async (url, opciones) => {
      if (String(url).includes('/UserInfoDetail/Delete')) throw new TypeError('fetch failed');
      return simulado(url, opciones);
    };
    const r = await cargaDePruebaDeRostro(conexion(peticion), IMAGEN, ID);
    expect(r.baja).toBeNull();
    expect(r.errorDeBaja).not.toBeNull();
    expect(r.employeeNo).toBe('5e2b7c1a0000400080000000000000c1');
  });
});
