import { describe, expect, it } from 'vitest';
import { CODIGOS_DEL_FABRICANTE, interpretarError } from './errores-del-fabricante';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE ESTE MAPA APORTA NO ES EL NOMBRE DEL ERROR: ES LA REACCIÓN
 *
 * Sin él, todo lo que el equipo rechaza acaba siendo «no se pudo» y quien está
 * delante de la barrera no sabe qué hacer. Estas pruebas fijan las reacciones
 * que se pagan caras si se confunden, y cada una dice cuánto cuesta.
 */

const conEstado = (estado: number): string =>
  '<?xml version="1.0" encoding="UTF-8"?><ResponseStatus version="2.0">' +
  '<requestURL>/ISAPI/ITC/Entrance/entranceParam</requestURL>' +
  `<statusCode>${String(estado)}</statusCode>` +
  '<statusString>Error</statusString><subStatusCode>notSupport</subStatusCode>' +
  '</ResponseStatus>';

describe('el código de estado general · cinco reacciones distintas', () => {
  it('2 · ocupado se REINTENTA con espera, y no es una denegación de acceso', () => {
    // Registrarlo como acceso negado escribiría en el histórico que a alguien no
    // se le permitió entrar, cuando lo que pasó es que el equipo estaba ocupado.
    const error = interpretarError(
      '<ResponseStatus><statusCode>2</statusCode><statusString>Device Busy</statusString></ResponseStatus>',
    );
    expect(error.reaccion).toBe('equipo_ocupado');
    expect(error.reintentable).toBe(true);
  });

  it('3 · error del equipo NO se reintenta: insistir no lo arregla', () => {
    const error = interpretarError(
      '<ResponseStatus><statusCode>3</statusCode><statusString>Device Error</statusString></ResponseStatus>',
    );
    expect(error.reaccion).toBe('equipo_averiado');
    expect(error.reintentable).toBe(false);
  });

  it('4 · operación no válida significa «este modelo no», no «ahora no»', () => {
    // La salida es la ruta alternativa del catálogo. Reintentar la misma es
    // insistir en algo que este firmware no tiene.
    const error = interpretarError(conEstado(4));
    expect(error.reaccion).toBe('ruta_inexistente');
    expect(error.reintentable).toBe(false);
  });

  it.each([5, 6])(
    '%s · el XML mal formado es defecto NUESTRO y no se reintenta nunca',
    (estado) => {
      const error = interpretarError(
        `<ResponseStatus><statusCode>${String(estado)}</statusCode></ResponseStatus>`,
      );
      expect(error.reaccion).toBe('peticion_mal_formada');
      expect(error.reintentable).toBe(false);
      expect(error.detalle).toMatch(/NUESTRO/);
    },
  );

  it('7 · reinicio necesario: reintentar es inútil y ruidoso, y se dice', () => {
    const error = interpretarError(
      '<ResponseStatus><statusCode>7</statusCode><statusString>Reboot Required</statusString></ResponseStatus>',
    );
    expect(error.reaccion).toBe('reinicio_necesario');
    expect(error.reintentable).toBe(false);
    expect(error.detalle).toMatch(/reinici/i);
  });

  it('el código detallado MANDA sobre el general cuando viene', () => {
    // El general dice la clase de problema; el detallado, cuál en concreto. Con
    // los dos, el que informa es el segundo.
    const error = interpretarError(
      `<ResponseStatus><statusCode>4</statusCode><subStatusCode>badAuthorization</subStatusCode>` +
        `<errorCode>${CODIGOS_DEL_FABRICANTE.badAuthorization}</errorCode></ResponseStatus>`,
    );
    expect(error.reaccion).toBe('credencial_rechazada');
  });

  it('la credencial rechazada AVISA de que no se reintente: bloquea la cuenta', () => {
    const error = interpretarError(
      `<ResponseStatus><subStatusCode>badAuthorization</subStatusCode></ResponseStatus>`,
    );
    expect(error.reaccion).toBe('credencial_rechazada');
    expect(error.detalle).toMatch(/bloquean la cuenta/i);
  });
});

describe('los códigos por módulo se CONSERVAN aunque no se interpreten', () => {
  /**
   * No hay tabla para ellos, y tirarlos convertiría un diagnóstico posible en
   * uno imposible: son lo único que permite buscarlos en la guía cuando
   * aparecen por primera vez.
   */
  it('el del módulo funcional', () => {
    const error = interpretarError(
      '<ResponseStatus><statusCode>3</statusCode><MErrCode>0x1a2b</MErrCode></ResponseStatus>',
    );
    expect(error.codigoDeModulo).toBe('0x1a2b');
  });

  it('y el propio del equipo', () => {
    const error = interpretarError(
      '<ResponseStatus><statusCode>3</statusCode><MErrDevSelfEx>7</MErrDevSelfEx></ResponseStatus>',
    );
    expect(error.codigoDeEquipo).toBe('7');
  });

  it('también desde un sobre JSON, que trae el suyo', () => {
    const error = interpretarError('{"statusCode":3,"errorCode":"0x30001","errorMsg":"busy"}');
    expect(error.codigoDeModulo).toBe('0x30001');
  });

  it('y el estado general queda aparte del código detallado: son dos ejes', () => {
    expect(interpretarError(conEstado(4)).estado).toBe(4);
  });
});

describe('lo que no se conoce no se disfraza', () => {
  it('un cuerpo sin nada útil lo dice', () => {
    const error = interpretarError('<ResponseStatus/>');
    expect(error.reaccion).toBe('desconocida');
    expect(error.reintentable).toBe(false);
  });

  it('un código que el mapa no conoce se conserva para poder buscarlo', () => {
    const error = interpretarError(
      '<ResponseStatus><subStatusCode>0x40009999</subStatusCode></ResponseStatus>',
    );
    expect(error.codigo).toBe('0x40009999');
    expect(error.detalle).toContain('0x40009999');
  });
});
