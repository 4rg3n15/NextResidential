import { describe, expect, it } from 'vitest';
import { ConfiguracionInvalida, cargarConfiguracion, esquemaDelEdge } from './esquema';

/**
 * La configuración del Edge, con la prueba GENÉRICA que cerró D-91.
 *
 * No se comprueba clave a clave. Se derivan las opcionales del propio esquema y
 * se exige lo mismo de todas: que `VAR=` valga por «no configurada», que el
 * espacio en blanco también, y que un valor inválido SÍ rompa. Clave a clave se
 * olvida en la siguiente que alguien añada — que es exactamente lo que pasó en
 * la API.
 */
const MINIMO = {
  EDGE_GATEWAY_ID: '11111111-1111-4111-8111-111111111111',
  EDGE_SERVICE_USER_ID: '22222222-2222-4222-8222-222222222222',
  EDGE_COPROPIEDAD_ID: '33333333-3333-4333-8333-333333333333',
  NEXT_CONTROL_API_URL: 'https://api.ejemplo.invalid',
  EDGE_INGESTA_SECRETO: 'un-secreto-de-al-menos-treinta-y-dos-caracteres',
};

describe('configuración del Edge', () => {
  it('con lo mínimo arranca y aplica los valores por omisión', () => {
    const c = cargarConfiguracion(MINIMO);
    expect(c.CONTINGENCIA_SIN_REGLA).toBe('denegar');
    expect(c.CACHE_OBSOLETA_MINUTOS).toBe(1440);
    expect(c.SONDAS_PARA_CAER).toBe(3);
  });

  it('EL VALOR POR OMISIÓN DE LA CONTINGENCIA ES DENEGAR (§2.1.4)', () => {
    // Si alguien lo cambiara a `escalar` sin decirlo, un gateway sin caché
    // empezaría a avisar al portero en vez de negar, y el cambio pasaría
    // inadvertido en el diff de un `.env`.
    expect(esquemaDelEdge.shape.CONTINGENCIA_SIN_REGLA.parse(undefined)).toBe('denegar');
  });

  it('sin identidad del equipo NO arranca, y dice cuál falta', () => {
    const sinId = { ...MINIMO } as Partial<typeof MINIMO>;
    delete sinId.EDGE_GATEWAY_ID;
    expect(() => cargarConfiguracion(sinId)).toThrow(ConfiguracionInvalida);
    try {
      cargarConfiguracion(sinId);
    } catch (e) {
      expect(String(e)).toContain('EDGE_GATEWAY_ID');
      // Y explica la consecuencia, que es lo que hace accionable el mensaje.
      expect(String(e)).toContain('decide con reglas incompletas');
    }
  });

  it('un secreto corto NO pasa: es lo que firma cada envío', () => {
    expect(() => cargarConfiguracion({ ...MINIMO, EDGE_INGESTA_SECRETO: 'corto' })).toThrow();
  });

  it('D-91 · `VAR=` significa NO CONFIGURADA en TODAS las opcionales', () => {
    const opcionales = Object.entries(esquemaDelEdge.shape)
      .filter(([, tipo]) => tipo.isOptional())
      .map(([clave]) => clave);
    expect(opcionales.length, 'si no hay opcionales, esta prueba no prueba nada').toBeGreaterThan(3);

    for (const clave of opcionales) {
      expect(() => cargarConfiguracion({ ...MINIMO, [clave]: '' }), `${clave} vacía`).not.toThrow();
      expect(() => cargarConfiguracion({ ...MINIMO, [clave]: '   ' }), `${clave} en blanco`).not.toThrow();
      // Y la otra mitad: un valor MALO sí tiene que romper. Sin esta línea, un
      // campo que no valida nada pasaría por «robusto».
      expect(
        () => cargarConfiguracion({ ...MINIMO, [clave]: '\u0000valor-imposible' }),
        `${clave} con un valor inválido debería romper`,
      ).toThrow();
    }
  });
});
