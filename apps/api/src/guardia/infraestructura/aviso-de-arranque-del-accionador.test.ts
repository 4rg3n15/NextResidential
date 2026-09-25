import { describe, expect, it } from 'vitest';
import { avisoDeArranqueDelAccionador } from './aviso-de-arranque-del-accionador';

/**
 * O5 · el accionador activo se dice al arrancar, con su consecuencia. Tres
 * estados, tres mensajes; los dos que no mueven nada real son AVISOS.
 */
describe('aviso de arranque del accionador', () => {
  it('sin control real: SIMULADO, y dice que ninguna orden mueve un brazo', () => {
    const a = avisoDeArranqueDelAccionador({ hayControlReal: false, dispositivoReal: '' });
    expect(a.nivel).toBe('aviso');
    expect(a.mensaje).toMatch(/SIMULADO/);
    expect(a.contexto['accionador']).toBe('simulado');
    expect(String(a.contexto['consecuencia'])).toMatch(/BARRERA_HOST/);
  });

  it('control real declarado SIN dispositivo asignado: aviso, porque nada le llegará', () => {
    const a = avisoDeArranqueDelAccionador({ hayControlReal: true, dispositivoReal: '' });
    expect(a.nivel).toBe('aviso');
    expect(a.mensaje).toMatch(/SIN dispositivo/);
    expect(a.contexto['accionador']).toBe('simulado');
    expect(String(a.contexto['consecuencia'])).toMatch(/BARRERA_DISPOSITIVO_ID/);
  });

  it('control real con dispositivo: info, y nombra el dispositivo', () => {
    const a = avisoDeArranqueDelAccionador({
      hayControlReal: true,
      dispositivoReal: '90000000-0000-4000-8000-000000000001',
    });
    expect(a.nivel).toBe('info');
    expect(a.contexto['accionador']).toBe('real');
    expect(a.contexto['dispositivoId']).toBe('90000000-0000-4000-8000-000000000001');
    // Nunca la dirección ni la credencial: sólo el identificador del equipo.
    expect(JSON.stringify(a)).not.toMatch(/BARRERA_CLAVE=|host:/);
  });
});
