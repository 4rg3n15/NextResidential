import { describe, expect, it } from 'vitest';
import {
  BarreraDeEntrada,
  cuerpoDeBarreraDeEntrada,
  leerEstadoDeBarrera,
  reportaEstadoDeBarrera,
} from './barrera-de-entrada';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * DOS VOCABULARIOS, NO UNA ORDEN CON OTRA RUTA
 *
 * La familia de aparcamiento sube el brazo con `open`; la de entrada y salida,
 * con `on`. Enviar el de una por la ruta de la otra produce una petición que el
 * equipo acepta sintácticamente y no ejecuta — el peor desenlace posible,
 * porque la consola informa de que abrió.
 */

const RESPUESTA_OK =
  '<ResponseStatus><statusCode>1</statusCode><statusString>OK</statusString></ResponseStatus>';

const equipoQueResponde = (
  cuerpo: string,
  estado = 200,
): { peticion: typeof fetch; enviados: string[] } => {
  const enviados: string[] = [];
  const peticion = ((_entrada: string | URL, opciones?: RequestInit): Promise<Response> => {
    if (typeof opciones?.body === 'string') enviados.push(opciones.body);
    return Promise.resolve(
      new Response(cuerpo, { status: estado, headers: { 'content-type': 'application/xml' } }),
    );
  }) as typeof fetch;
  return { peticion, enviados };
};

describe('las erratas del fabricante se RESPETAN', () => {
  /**
   * `barrietGateNum` y `barrietGateOper` —sin la «r»— son los nombres que el
   * esquema declara y los que el equipo espera. Corregirlos produce una
   * petición que el aparato no entiende y un error que no dice por qué.
   */
  it('el número de barrera lleva la errata', () => {
    expect(cuerpoDeBarreraDeEntrada(1, 'on')).toContain('<barrietGateNum>1</barrietGateNum>');
  });

  it('y la operación también', () => {
    expect(cuerpoDeBarreraDeEntrada(1, 'on')).toContain('<barrietGateOper>on</barrietGateOper>');
  });

  it('el cuerpo lleva el espacio de nombres del esquema', () => {
    expect(cuerpoDeBarreraDeEntrada(1, 'on')).toContain(
      'xmlns="http://www.isapi.org/ver20/XMLSchema"',
    );
  });
});

describe('el vocabulario de entrada y salida', () => {
  it('abrir es `on`, que NO es `open`', async () => {
    const { peticion, enviados } = equipoQueResponde(RESPUESTA_OK);
    const barrera = new BarreraDeEntrada({
      host: '203.0.113.30',
      usuario: 'u',
      clave: 'c',
      peticion,
      ruta: '/ruta-de-prueba',
    });
    await barrera.accionar('disp-1', true);
    expect(enviados[0]).toContain('<barrietGateOper>on</barrietGateOper>');
  });

  it('cerrar es `off`, que NO es `close`', async () => {
    const { peticion, enviados } = equipoQueResponde(RESPUESTA_OK);
    const barrera = new BarreraDeEntrada({
      host: '203.0.113.30',
      usuario: 'u',
      clave: 'c',
      peticion,
      ruta: '/ruta-de-prueba',
    });
    await barrera.accionar('disp-1', false);
    expect(enviados[0]).toContain('<barrietGateOper>off</barrietGateOper>');
  });

  it('bloquear es `locked`', async () => {
    const { peticion, enviados } = equipoQueResponde(RESPUESTA_OK);
    const barrera = new BarreraDeEntrada({
      host: '203.0.113.30',
      usuario: 'u',
      clave: 'c',
      peticion,
      ruta: '/ruta-de-prueba',
    });
    await barrera.fijarBloqueo('disp-1', true);
    expect(enviados[0]).toContain('<barrietGateOper>locked</barrietGateOper>');
  });

  it('y DESBLOQUEAR no existe en este vocabulario: se rechaza en vez de inventarlo', async () => {
    // Devolver `unlock` de la otra familia sería inventar una operación;
    // devolver `stop` y llamarlo desbloqueo sería peor, porque el equipo lo
    // aceptaría y el brazo seguiría bloqueado.
    const { peticion, enviados } = equipoQueResponde(RESPUESTA_OK);
    const barrera = new BarreraDeEntrada({
      host: '203.0.113.30',
      usuario: 'u',
      clave: 'c',
      peticion,
      ruta: '/ruta-de-prueba',
    });
    const resultado = await barrera.fijarBloqueo('disp-1', false);
    expect(resultado.estado).toBe('rechazada');
    expect(enviados).toHaveLength(0);
  });

  it('una orden aceptada NO afirma que el vehículo pasara (H-1, H-2)', async () => {
    const { peticion } = equipoQueResponde(RESPUESTA_OK);
    const barrera = new BarreraDeEntrada({
      host: '203.0.113.30',
      usuario: 'u',
      clave: 'c',
      peticion,
      ruta: '/ruta-de-prueba',
    });
    const resultado = await barrera.accionar('disp-1', true);
    expect(resultado.estado).toBe('aceptada');
    expect(Object.keys(resultado)).not.toContain('pasoFranqueado');
  });

  it('un rechazo del equipo se devuelve con su texto, no como fallo genérico', async () => {
    const { peticion } = equipoQueResponde(
      '<ResponseStatus><statusCode>4</statusCode><statusString>notSupport</statusString></ResponseStatus>',
    );
    const barrera = new BarreraDeEntrada({
      host: '203.0.113.30',
      usuario: 'u',
      clave: 'c',
      peticion,
      ruta: '/ruta-de-prueba',
    });
    const resultado = await barrera.accionar('disp-1', true);
    expect(resultado.estado).toBe('rechazada');
  });
});

describe('el estado del brazo · 1 es CERRADA y 2 es ABIERTA, no al revés', () => {
  const con = (valor: string): string =>
    `<BarrierGateStatus><barrierGateStatus>${valor}</barrierGateStatus></BarrierGateStatus>`;

  it('0 es sin señal', () => {
    expect(leerEstadoDeBarrera(con('0'))).toBe('sin_senal');
  });

  it('1 es cerrada', () => {
    expect(leerEstadoDeBarrera(con('1'))).toBe('cerrada');
  });

  it('2 es abierta', () => {
    expect(leerEstadoDeBarrera(con('2'))).toBe('abierta');
  });

  it('un valor que no está documentado no se traduce a ninguno de los tres', () => {
    expect(leerEstadoDeBarrera(con('9'))).toBe('desconocido');
    expect(leerEstadoDeBarrera('')).toBe('desconocido');
  });
});

describe('antes de sondear el estado, se pregunta si el modelo lo reporta', () => {
  it('lo declara soportado', () => {
    expect(
      reportaEstadoDeBarrera(
        '<BarrierGateCap><isSupportBarrierGateStatus>true</isSupportBarrierGateStatus></BarrierGateCap>',
      ),
    ).toBe(true);
  });

  it('lo declara NO soportado', () => {
    expect(
      reportaEstadoDeBarrera(
        '<BarrierGateCap><isSupportBarrierGateStatus>false</isSupportBarrierGateStatus></BarrierGateCap>',
      ),
    ).toBe(false);
  });

  it('y NO declararlo no es lo mismo que declarar que no', () => {
    // Un `null` deja la pregunta abierta; un `false` la cierra. Confundirlos
    // haría que la consola afirmara algo que el equipo nunca dijo.
    expect(reportaEstadoDeBarrera('<BarrierGateCap/>')).toBeNull();
  });
});
