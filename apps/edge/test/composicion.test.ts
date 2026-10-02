import { describe, expect, it } from 'vitest';
import { cargarConfiguracionDeSitio } from '../src/configuracion/esquema-de-sitio';
import { componerEdge } from '../src/composicion';
import { CAMARA, TERMINAL, entornoDeSitio } from './banco-de-sitio';

/**
 * 15-Q · la raíz de composición sin extras: el `fetch` de verdad hacia la nube y
 * hacia los equipos, y un equipo que no contesta. Lo que importa: que componer no
 * toque la red, y que una escucha que no abre se registre sin tumbar las demás.
 */
describe('componerEdge (15-Q)', () => {
  it('compone sin tocar la red, con los canales y la puerta declarados', () => {
    const equipos = JSON.stringify([
      {
        dispositivoId: CAMARA,
        tipo: 'camara_lpr',
        host: '127.0.0.1',
        puerto: 1,
        usuario: 'u',
        clave: 'c',
        canalBarrera: 1,
        numeroDePuerta: 1,
        secretoAlarmServer: 's'.repeat(40),
      },
      {
        dispositivoId: TERMINAL,
        tipo: 'terminal_facial',
        host: '127.0.0.1',
        puerto: 1,
        usuario: 'u',
        clave: 'c',
      },
    ]);
    const edge = componerEdge(
      cargarConfiguracionDeSitio(entornoDeSitio({ EDGE_EQUIPOS: equipos })),
      {
        registrar: () => undefined,
        reloj: { ahora: () => new Date('2026-10-02T12:00:00Z') },
      },
    );
    expect(edge.contingencia.estado()).toEqual({
      modo: 'autonomo',
      tics: 0,
      confirmadoSinNube: false,
    });
    expect(edge.bandeja.cuantosPendientes()).toBe(0);
  });

  it('una escucha que no abre se registra y no cuenta como activa', async () => {
    const avisos: string[] = [];
    const edge = componerEdge(cargarConfiguracionDeSitio(entornoDeSitio()), {
      registrar: (_n, m) => void avisos.push(m),
      peticionAEquipos: (async () => {
        throw new TypeError('connect ECONNREFUSED');
      }) as unknown as typeof fetch,
    });
    expect(await edge.rearmarEscuchas()).toBe(0);
    expect(avisos).toContain('no se pudo abrir la escucha de un equipo');
  });
});
