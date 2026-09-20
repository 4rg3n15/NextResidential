import { describe, expect, it } from 'vitest';
import { ClienteHttpDeNube, SondaHttp, firmar, mensajeCanonico } from './cliente-de-nube';
import { verificarFirma } from '../../../../api/src/autorizaciones/presentacion/firma-ingesta';
import type { EnvioPendiente } from '../../aplicacion/puertos';

/**
 * LA FIRMA DEL EDGE CONTRA EL VERIFICADOR DE LA API, EL DE VERDAD.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ SE IMPORTA EL VERIFICADOR REAL Y NO SE REESCRIBE AQUÍ
 *
 * Es el mismo razonamiento que RN-16 aplicado a la firma: dos implementaciones
 * de un acuerdo que «deberían coincidir» acaban divergiendo, y el día que lo
 * hagan el síntoma será un 401 en mitad de una reconciliación —es decir, a las
 * tres de la mañana y con la bandeja llena—. Aquí el que verifica es el mismo
 * código que corre en producción, así que un cambio en el mensaje canónico
 * rompe esta prueba antes de llegar al equipo.
 *
 * Es una importación cruzada entre aplicaciones y **solo en pruebas**: el
 * código de producción del Edge no importa nada de la API. Lo que se comparte
 * es un contrato de bytes, no una dependencia.
 */
const SECRETO = 'un-secreto-de-al-menos-treinta-y-dos-caracteres';

describe('firma HMAC · el Edge firma lo que la API verifica', () => {
  it('una firma del Edge la acepta el verificador de la API', () => {
    const cuerpo = '{"eventos":[{"referenciaExterna":"evt-0001"}]}';
    const marca = String(Math.floor(Date.now() / 1000));
    const v = verificarFirma({
      firmaRecibida: firmar(SECRETO, marca, cuerpo),
      marcaTemporal: marca,
      cuerpoCrudo: cuerpo,
      secreto: SECRETO,
      ahora: new Date(),
      ventanaSegundos: 300,
    });
    expect(v.valida).toBe(true);
  });

  it('cambiar UN byte del cuerpo la invalida', () => {
    const cuerpo = '{"permitido":false}';
    const marca = String(Math.floor(Date.now() / 1000));
    const firma = firmar(SECRETO, marca, cuerpo);
    const v = verificarFirma({
      firmaRecibida: firma,
      marcaTemporal: marca,
      cuerpoCrudo: '{"permitido":true}',
      secreto: SECRETO,
      ahora: new Date(),
      ventanaSegundos: 300,
    });
    expect(v.valida).toBe(false);
  });

  it('EL RELOJ DESVIADO LA SACA DE LA VENTANA · por eso está en la guía', () => {
    // Un gateway que pasa 24 h sin conexión pasa 24 h sin NTP. Su deriva puede
    // sacarlo de la ventana justo al intentar reconciliar, y el síntoma —401
    // con firma «correcta»— no se parece en nada a la causa.
    const cuerpo = '{"eventos":[]}';
    const marca = String(Math.floor(Date.now() / 1000) - 3600);
    const v = verificarFirma({
      firmaRecibida: firmar(SECRETO, marca, cuerpo),
      marcaTemporal: marca,
      cuerpoCrudo: cuerpo,
      secreto: SECRETO,
      ahora: new Date(),
      ventanaSegundos: 300,
    });
    expect(v.valida).toBe(false);
    if (!v.valida) expect(v.motivo).toBe('FUERA_DE_VENTANA');
  });

  it('el mensaje canónico es exactamente `<marca>.<cuerpo>`', () => {
    expect(mensajeCanonico('123', '{"a":1}')).toBe('123.{"a":1}');
  });
});

const pendiente = (clave: string, cuerpo: string): EnvioPendiente => ({
  claveIdempotencia: clave,
  secuencia: 1,
  cuerpo,
  encoladoEn: '2026-09-21T10:00:00.000Z',
  intentos: 0,
  proximoIntentoEn: null,
  ultimoError: null,
});

describe('cliente de nube', () => {
  it('REENVÍA EL CUERPO TAL CUAL, sin volver a serializarlo', async () => {
    // Si lo parseara y reserializara, los bytes firmados cambiarían sin cambiar
    // el contenido —el orden de las claves no está garantizado— y la firma
    // dejaría de cuadrar. Aquí se comprueba con un cuerpo cuyas claves están en
    // un orden que `JSON.stringify` no reproduciría.
    let cuerpoEnviado = '';
    let firmaEnviada = '';
    let marcaEnviada = '';
    const cliente = new ClienteHttpDeNube({
      urlBase: 'http://nube.invalid',
      secreto: SECRETO,
      copropiedadId: 'cop',
      transporte: (async (_url: string, init: RequestInit) => {
        cuerpoEnviado = String(init.body);
        const h = init.headers as Record<string, string>;
        firmaEnviada = h['x-ncr-firma'] ?? '';
        marcaEnviada = h['x-ncr-marca-temporal'] ?? '';
        return {
          ok: true,
          status: 202,
          json: async () => ({
            aceptado: true,
            resultados: [{ claveIdempotencia: 'k1', aceptado: true, duplicado: false }],
          }),
        } as Response;
      }) as unknown as typeof fetch,
    });

    const crudo = '{"zeta":1,"alfa":2}';
    const r = await cliente.reconciliar([pendiente('k1', crudo)]);

    expect(cuerpoEnviado).toBe(`{"eventos":[${crudo}]}`);
    expect(r[0]?.aceptado).toBe(true);
    // Y lo enviado es exactamente lo firmado.
    expect(firmaEnviada).toBe(firmar(SECRETO, marcaEnviada, cuerpoEnviado));
  });

  it('una clave sin respuesta NO se da por aceptada', async () => {
    const cliente = new ClienteHttpDeNube({
      urlBase: 'http://nube.invalid',
      secreto: SECRETO,
      copropiedadId: 'cop',
      transporte: (async () =>
        ({ ok: true, status: 202, json: async () => ({ aceptado: true, resultados: [] }) }) as Response) as unknown as typeof fetch,
    });
    const r = await cliente.reconciliar([pendiente('k1', '{}')]);
    expect(r[0]?.aceptado).toBe(false);
    expect(r[0]?.detalle).toContain('no devolvió resultado');
  });

  it('el estado HTTP viaja en el mensaje: un 401 y un 503 se tratan distinto', async () => {
    const cliente = new ClienteHttpDeNube({
      urlBase: 'http://nube.invalid',
      secreto: SECRETO,
      copropiedadId: 'cop',
      transporte: (async () => ({ ok: false, status: 401 }) as Response) as unknown as typeof fetch,
    });
    await expect(cliente.reconciliar([pendiente('k1', '{}')])).rejects.toThrow('401');
  });

  it('un lote vacío no toca la red', async () => {
    let llamadas = 0;
    const cliente = new ClienteHttpDeNube({
      urlBase: 'http://nube.invalid',
      secreto: SECRETO,
      copropiedadId: 'cop',
      transporte: (async () => {
        llamadas += 1;
        return { ok: true, status: 202, json: async () => ({}) } as Response;
      }) as unknown as typeof fetch,
    });
    expect(await cliente.reconciliar([])).toEqual([]);
    expect(llamadas).toBe(0);
  });

  it('una instantánea de OTRA copropiedad se descarta (RN-15)', async () => {
    const cliente = new ClienteHttpDeNube({
      urlBase: 'http://nube.invalid',
      secreto: SECRETO,
      copropiedadId: 'cop-a',
      transporte: (async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ copropiedadId: 'cop-b', version: 9 }),
        }) as Response) as unknown as typeof fetch,
    });
    expect(await cliente.descargarReglas('cop-a', 1)).toBeNull();
  });

  it('la sonda dice «no» ante cualquier fallo, sin distinguir el motivo', async () => {
    // El Edge responde lo mismo a un DNS caído que a un 500: seguir solo.
    const sonda = new SondaHttp('http://nube.invalid', (async () => {
      throw new Error('ENOTFOUND');
    }) as unknown as typeof fetch);
    expect(await sonda.hayEnlace()).toBe(false);

    const buena = new SondaHttp('http://nube.invalid', (async () =>
      ({ ok: true }) as Response) as unknown as typeof fetch);
    expect(await buena.hayEnlace()).toBe(true);
  });
});
