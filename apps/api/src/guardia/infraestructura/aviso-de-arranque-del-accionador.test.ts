import { describe, expect, it } from 'vitest';
import { avisoDeArranqueDelAccionador } from './aviso-de-arranque-del-accionador';

/**
 * O5 · qué accionador atiende a cada dispositivo se dice al arrancar, como una
 * REGLA completa y no como un nombre suelto. El simulado sin barrera es AVISO;
 * el proveedor real sin barrera es información; la barrera a medias es aviso.
 */
describe('aviso de arranque del accionador', () => {
  it('simulado y sin BARRERA_*: aviso, y dice que ninguna orden mueve un brazo', () => {
    const a = avisoDeArranqueDelAccionador({
      clase: 'simulado',
      hayControlDeEntorno: false,
      dispositivoDeEntorno: '',
    });
    expect(a.nivel).toBe('aviso');
    expect(a.mensaje).toMatch(/simulado/);
    expect(a.contexto['accionador']).toBe('simulado');
    expect(String(a.contexto['consecuencia'])).toMatch(/SIMULADO/);
    expect(a.contexto['compatibilidadBarrera']).toBe(false);
  });

  it('proveedor real y sin BARRERA_*: info, y enuncia la regla del registro', () => {
    const a = avisoDeArranqueDelAccionador({
      clase: 'hikvision', // kpi-11-exento · es el nombre del adaptador, no protocolo
      hayControlDeEntorno: false,
      dispositivoDeEntorno: '',
    });
    expect(a.nivel).toBe('info');
    expect(a.contexto['accionador']).toBe('proveedor');
    expect(String(a.contexto['consecuencia'])).toMatch(/registro de equipos/);
    expect(String(a.contexto['consecuencia'])).toMatch(/capacidades/);
  });

  it('BARRERA_* declarada SIN dispositivo asignado: aviso, porque nada le llegará', () => {
    const a = avisoDeArranqueDelAccionador({
      clase: 'simulado',
      hayControlDeEntorno: true,
      dispositivoDeEntorno: '',
    });
    expect(a.nivel).toBe('aviso');
    expect(a.mensaje).toMatch(/SIN dispositivo/);
    expect(String(a.contexto['consecuencia'])).toMatch(/BARRERA_DISPOSITIVO_ID/);
  });

  it('barrera por entorno con dispositivo: mixto, nombra el dispositivo y la regla del resto', () => {
    const a = avisoDeArranqueDelAccionador({
      clase: 'simulado',
      hayControlDeEntorno: true,
      dispositivoDeEntorno: '90000000-0000-4000-8000-000000000001',
    });
    expect(a.nivel).toBe('info');
    expect(a.contexto['accionador']).toBe('mixto');
    expect(a.contexto['dispositivoId']).toBe('90000000-0000-4000-8000-000000000001');
    expect(a.mensaje).toMatch(/para el resto/);
    // Nunca la dirección ni la credencial: sólo el identificador del equipo.
    expect(JSON.stringify(a)).not.toMatch(/BARRERA_CLAVE=|host:/);
  });
});
