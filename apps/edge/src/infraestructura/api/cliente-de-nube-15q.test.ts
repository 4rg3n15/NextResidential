import { describe, expect, it } from 'vitest';
import { ClienteHttpDeNube, firmar, solicitudCanonica } from './cliente-de-nube';
import { SondaHttp } from './sonda-http';
import {
  comprobarFirma,
  derivarCredencial,
} from '../../../../api/src/edge/aplicacion/credencial-del-edge';

/**
 * 15-Q · el protocolo del Edge acreditado CONTRA EL VERIFICADOR REAL DE LA API.
 * Mismo razonamiento que la prueba de la ETAPA 12: dos implementaciones de un
 * acuerdo de bytes divergen en silencio; aquí verifica el código de producción.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const EDGE = 'ed000000-0000-4000-8000-0000000000e1';
const CREDENCIAL = derivarCredencial('m'.repeat(40), {
  copropiedadId: COP,
  edgeId: EDGE,
  credencialRef: 'env:INGESTA_FIRMA_SECRETO/g1',
});

const capturar = (respuesta: unknown, status = 200) => {
  const vistas: { url: string; init: RequestInit }[] = [];
  const transporte = (async (url: string, init: RequestInit) => {
    vistas.push({ url, init });
    return { ok: status < 400, status, json: async () => respuesta } as Response;
  }) as unknown as typeof fetch;
  const cliente = new ClienteHttpDeNube({
    urlBase: 'http://nube.invalid',
    secreto: CREDENCIAL,
    copropiedadId: COP,
    gatewayId: EDGE,
    transporte,
  });
  return { cliente, vistas };
};

describe('cliente del Edge acreditado (15-Q, Q1/Q5)', () => {
  it('la descarga va firmada con SU credencial sobre método y ruta, y la API la acepta', async () => {
    const { cliente, vistas } = capturar({
      copropiedadId: COP,
      version: 3,
      sinCambios: true,
      generadaEn: 'x',
    });
    await cliente.descargarReglas(COP, 3);
    const visto = vistas[0];
    const h = visto?.init.headers as Record<string, string>;
    const ruta = `/copropiedades/${COP}/reglas/instantanea?desde=3`;
    expect(visto?.url).toBe(`http://nube.invalid${ruta}`);
    expect(h['x-ncr-edge']).toBe(EDGE);
    const veredicto = comprobarFirma(
      CREDENCIAL,
      { marca: h['x-ncr-marca-temporal'], firma: h['x-ncr-firma'] },
      solicitudCanonica('GET', ruta, ''),
      new Date(),
      300,
    );
    expect(veredicto).toBeNull();
  });

  it('la reconciliación va a SU copropiedad, con el cuerpo crudo firmado', async () => {
    const { cliente, vistas } = capturar({ aceptado: true, resultados: [] }, 202);
    await cliente.reconciliar([
      {
        claveIdempotencia: 'k1',
        secuencia: 1,
        cuerpo: '{"b":1,"a":2}',
        encoladoEn: '',
        intentos: 0,
        proximoIntentoEn: null,
        ultimoError: null,
      },
    ]);
    const h = vistas[0]?.init.headers as Record<string, string>;
    const ruta = `/copropiedades/${COP}/edge/reconciliacion`;
    expect(vistas[0]?.url).toBe(`http://nube.invalid${ruta}`);
    const cuerpo = String(vistas[0]?.init.body);
    expect(h['x-ncr-firma']).toBe(
      firmar(CREDENCIAL, h['x-ncr-marca-temporal'] ?? '', solicitudCanonica('POST', ruta, cuerpo)),
    );
  });

  it('«sin cambios» se entrega como fe de vida; de otra copropiedad o sin versión, nada', async () => {
    const vigente = capturar({
      copropiedadId: COP,
      version: 3,
      sinCambios: true,
      generadaEn: '2026-10-02T00:00:00Z',
    });
    expect(await vigente.cliente.descargarReglas(COP, 3)).toEqual({
      sinCambios: true,
      version: 3,
      generadaEn: '2026-10-02T00:00:00Z',
    });
    const ajena = capturar({ copropiedadId: 'otra', version: 3, sinCambios: true });
    expect(await ajena.cliente.descargarReglas(COP, 3)).toBeNull();
    const sinVersion = capturar({ copropiedadId: COP });
    expect(await sinVersion.cliente.descargarReglas(COP, 3)).toBeNull();
  });

  it('un 409 (versión adelantada) llega como error con su estado', async () => {
    const { cliente } = capturar({}, 409);
    await expect(cliente.descargarReglas(COP, 9)).rejects.toThrow('409');
  });

  it('la sonda pregunta por /ready: ¿puede la nube DECIDIR?, no sólo ¿vive?', async () => {
    const urls: string[] = [];
    const sonda = new SondaHttp('http://nube.invalid', (async (url: string) => {
      urls.push(url);
      return { ok: false } as Response;
    }) as unknown as typeof fetch);
    expect(await sonda.hayEnlace()).toBe(false);
    expect(urls).toEqual(['http://nube.invalid/ready']);
  });
});
