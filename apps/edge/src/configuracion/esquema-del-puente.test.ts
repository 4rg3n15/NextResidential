import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { entornoDeSitio } from '../../test/banco-de-sitio';
import { ConfiguracionInvalida } from './esquema';
import { cargarConfiguracionDelPuente } from './esquema-del-puente';

/**
 * 15-Q2 · la configuración del Edge como puente (ADR-035): validada al
 * arrancar como el resto (§2.7.1). Con `EDGE_TUNEL=activo` la llave de los
 * equipos es obligatoria y la semilla `EDGE_EQUIPOS` puede ir vacía.
 */
const llave = (): string => randomBytes(32).toString('base64');

/** El entorno de sitio SIN `EDGE_EQUIPOS`: con túnel, los equipos llegan de la consola. */
const sinSemilla = (cambios: Record<string, string> = {}): NodeJS.ProcessEnv => {
  const entorno = entornoDeSitio();
  delete entorno['EDGE_EQUIPOS'];
  return { ...entorno, ...cambios };
};

const mensajeDe = (hacer: () => unknown): string => {
  try {
    hacer();
  } catch (error) {
    expect(error).toBeInstanceOf(ConfiguracionInvalida);
    return (error as Error).message;
  }
  throw new Error('se esperaba que no arrancara');
};

describe('cargarConfiguracionDelPuente · sin túnel (por omisión)', () => {
  it('EDGE_TUNEL inactivo, plazo de 2500 ms, go2rtc en loopback y sin llave', () => {
    const c = cargarConfiguracionDelPuente(entornoDeSitio());
    expect(c.EDGE_TUNEL).toBe('inactivo');
    expect(c.EDGE_PLAZO_NUBE_MS).toBe(2_500);
    expect(c.EDGE_GO2RTC_URL).toBe('http://127.0.0.1:1984');
    expect(c.EDGE_EQUIPOS_LLAVE).toBeUndefined();
    // Sin túnel manda la configuración de sitio de la 15-Q, intacta.
    expect(c.EDGE_EQUIPOS).toHaveLength(2);
    expect(c.EDGE_ESCUCHA_PUERTO).toBe(8080);
  });

  it('sin túnel, la configuración de sitio sigue exigiendo al menos un equipo', () => {
    expect(() => cargarConfiguracionDelPuente(entornoDeSitio({ EDGE_EQUIPOS: '[]' }))).toThrow(
      'EDGE_EQUIPOS',
    );
  });

  it('una llave mal formada no arranca aunque el túnel esté inactivo', () => {
    expect(
      mensajeDe(() =>
        cargarConfiguracionDelPuente(entornoDeSitio({ EDGE_EQUIPOS_LLAVE: 'corta' })),
      ),
    ).toContain('EDGE_EQUIPOS_LLAVE');
  });
});

describe('cargarConfiguracionDelPuente · EDGE_PLAZO_NUBE_MS', () => {
  it.each([
    ['200', 200],
    ['800', 800],
    ['10000', 10_000],
  ])('%s se acepta', (valor, esperado) => {
    expect(
      cargarConfiguracionDelPuente(entornoDeSitio({ EDGE_PLAZO_NUBE_MS: valor }))
        .EDGE_PLAZO_NUBE_MS,
    ).toBe(esperado);
  });

  it.each(['199', '10001', '1500.5', 'pronto'])('%s no arranca', (valor) => {
    expect(
      mensajeDe(() => cargarConfiguracionDelPuente(entornoDeSitio({ EDGE_PLAZO_NUBE_MS: valor }))),
    ).toContain('EDGE_PLAZO_NUBE_MS');
  });
});

describe('cargarConfiguracionDelPuente · con túnel activo', () => {
  it('sin EDGE_EQUIPOS_LLAVE no arranca, y lo dice', () => {
    expect(
      mensajeDe(() => cargarConfiguracionDelPuente(entornoDeSitio({ EDGE_TUNEL: 'activo' }))),
    ).toBe(
      'El Edge NO arranca como puente: falta EDGE_EQUIPOS_LLAVE, la llave que cifra los equipos.',
    );
  });

  it('con la llave arranca, y la semilla de equipos puede faltar o ir vacía', () => {
    const base = { EDGE_TUNEL: 'activo', EDGE_EQUIPOS_LLAVE: llave() };
    const sin = cargarConfiguracionDelPuente(sinSemilla(base));
    expect(sin.EDGE_TUNEL).toBe('activo');
    expect(sin.EDGE_EQUIPOS).toEqual([]);
    expect(sin.EDGE_EQUIPOS_LLAVE).toBe(base.EDGE_EQUIPOS_LLAVE);
    expect(sin.EDGE_COPROPIEDAD_ID).toBe(entornoDeSitio().EDGE_COPROPIEDAD_ID);
    expect(
      cargarConfiguracionDelPuente(sinSemilla({ ...base, EDGE_EQUIPOS: '  ' })).EDGE_EQUIPOS,
    ).toEqual([]);
  });

  it('con semilla, se valida igual que la de sitio', () => {
    const c = cargarConfiguracionDelPuente(
      entornoDeSitio({ EDGE_TUNEL: 'activo', EDGE_EQUIPOS_LLAVE: llave() }),
    );
    expect(c.EDGE_EQUIPOS.map((e) => e.tipo)).toEqual(['camara_lpr', 'terminal_facial']);
  });

  it.each([
    ['no es JSON', 'camara=1'],
    ['no es una lista', '{"dispositivoId":"x"}'],
    ['un equipo sin forma', '[{"tipo":"camara_lpr"}]'],
  ])('una semilla que %s no arranca', (_caso, semilla) => {
    expect(
      mensajeDe(() =>
        cargarConfiguracionDelPuente(
          sinSemilla({ EDGE_TUNEL: 'activo', EDGE_EQUIPOS_LLAVE: llave(), EDGE_EQUIPOS: semilla }),
        ),
      ),
    ).toContain('EDGE_EQUIPOS no es una lista válida');
  });

  it('sigue exigiendo la interfaz de escucha y la configuración de la ETAPA 12', () => {
    const activo = { EDGE_TUNEL: 'activo', EDGE_EQUIPOS_LLAVE: llave() };
    expect(
      mensajeDe(() =>
        cargarConfiguracionDelPuente(sinSemilla({ ...activo, EDGE_ESCUCHA_HOST: '0.0.0.0' })),
      ),
    ).toContain('EDGE_ESCUCHA_HOST');
    expect(
      mensajeDe(() => cargarConfiguracionDelPuente(sinSemilla({ ...activo, EDGE_GATEWAY_ID: '' }))),
    ).toContain('EDGE_GATEWAY_ID');
  });
});

describe('cargarConfiguracionDelPuente · valores inválidos', () => {
  it.each([
    ['EDGE_TUNEL', 'si'],
    ['EDGE_EQUIPOS_LLAVE', randomBytes(33).toString('base64')],
    ['EDGE_EQUIPOS_LLAVE', randomBytes(16).toString('base64')],
    ['EDGE_GO2RTC_URL', 'no es una url'],
  ])('%s=%s no arranca', (variable, valor) => {
    expect(
      mensajeDe(() => cargarConfiguracionDelPuente(entornoDeSitio({ [variable]: valor }))),
    ).toContain(variable);
  });

  it('el mensaje nombra la variable, nunca el valor de la llave', () => {
    const casi = `${randomBytes(32).toString('base64').slice(0, 43)}!`;
    const mensaje = mensajeDe(() =>
      cargarConfiguracionDelPuente(entornoDeSitio({ EDGE_EQUIPOS_LLAVE: casi })),
    );
    expect(mensaje).toContain('EDGE_EQUIPOS_LLAVE');
    expect(mensaje).not.toContain(casi);
  });

  it('D-91 · declaradas VACÍAS (`VAR=` en el .env) valen su omisión, como en el resto del Edge', () => {
    const c = cargarConfiguracionDelPuente(
      entornoDeSitio({
        EDGE_PLAZO_NUBE_MS: '',
        EDGE_TUNEL: '',
        EDGE_GO2RTC_URL: '',
        EDGE_EQUIPOS_LLAVE: '',
      }),
    );
    expect(c).toMatchObject({
      EDGE_TUNEL: 'inactivo',
      EDGE_PLAZO_NUBE_MS: 2_500,
      EDGE_GO2RTC_URL: 'http://127.0.0.1:1984',
    });
    expect(c.EDGE_EQUIPOS_LLAVE).toBeUndefined();
    // Pero con túnel, una llave vacía sigue siendo una llave que falta.
    expect(
      mensajeDe(() =>
        cargarConfiguracionDelPuente(
          entornoDeSitio({ EDGE_TUNEL: 'activo', EDGE_EQUIPOS_LLAVE: '' }),
        ),
      ),
    ).toContain('falta EDGE_EQUIPOS_LLAVE');
  });
});
