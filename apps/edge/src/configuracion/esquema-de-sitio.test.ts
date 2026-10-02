import { describe, expect, it } from 'vitest';
import { entornoDeSitio } from '../../test/banco-de-sitio';
import { cargarConfiguracionDeSitio } from './esquema-de-sitio';

/**
 * 15-Q · Q5/Q7 · sin equipos, sin interfaz concreta o sin secreto local el
 * gateway NO arranca, y el mensaje nombra el campo, nunca el valor.
 */
describe('configuración de sitio del Edge (15-Q)', () => {
  it('con el entorno completo arranca, con los valores por omisión documentados', () => {
    const c = cargarConfiguracionDeSitio(entornoDeSitio());
    expect(c.EDGE_EQUIPOS).toHaveLength(2);
    expect(c.EDGE_ESCUCHA_PUERTO).toBe(8080);
    expect(c.REGLAS_DESCARGA_SEGUNDOS).toBe(300);
    expect(c.SONDA_POR_EVENTO_MS).toBe(1500);
  });

  it.each([
    ['todas las interfaces', { EDGE_ESCUCHA_HOST: '0.0.0.0' }, 'EDGE_ESCUCHA_HOST'],
    ['un nombre en vez de una IP', { EDGE_ESCUCHA_HOST: 'porteria.local' }, 'EDGE_ESCUCHA_HOST'],
    ['secreto local corto', { EDGE_LOCAL_SECRETO: 'corto' }, 'EDGE_LOCAL_SECRETO'],
    ['equipos que no son JSON', { EDGE_EQUIPOS: 'camara=1' }, 'EDGE_EQUIPOS'],
    ['ningún equipo', { EDGE_EQUIPOS: '[]' }, 'EDGE_EQUIPOS'],
  ])('no arranca con %s', (_caso, cambios, campo) => {
    expect(() => cargarConfiguracionDeSitio(entornoDeSitio(cambios))).toThrow(campo);
  });

  it('una cámara sin su secreto de Alarm Server no arranca, y la clave no aparece en el mensaje', () => {
    const equipos = JSON.stringify([
      {
        dispositivoId: '90000000-0000-4000-8000-000000000001',
        tipo: 'camara_lpr',
        host: '127.0.0.1',
        usuario: 'u',
        clave: 'CLAVE-QUE-NO-DEBE-SALIR',
      },
    ]);
    let mensaje = '';
    try {
      cargarConfiguracionDeSitio(entornoDeSitio({ EDGE_EQUIPOS: equipos }));
    } catch (e) {
      mensaje = String(e);
    }
    expect(mensaje).toContain('secretoAlarmServer');
    expect(mensaje).not.toContain('CLAVE-QUE-NO-DEBE-SALIR');
  });

  it('sin la configuración de la ETAPA 12 tampoco arranca', () => {
    expect(() => cargarConfiguracionDeSitio({ ...entornoDeSitio(), EDGE_GATEWAY_ID: '' })).toThrow(
      'EDGE_GATEWAY_ID',
    );
  });
});
