import { describe, expect, it } from 'vitest';
import { aplicarCorreccion } from './correcciones';
import { conDestino, conReceptorApagado } from './correcciones-de-sitio';

/**
 * C2 y F2 (corrección de la 15-L) · las dos escrituras del día de entrega,
 * contra un equipo guionizado que RECUERDA lo que se le escribe —o que, a
 * propósito, lo acepta y no lo guarda—. RFC 5737: ninguna dirección es de
 * nadie.
 */
const HOST = '203.0.113.50';
const MAC = '198.51.100.23';
const RUTA = '/alarm-server/secreto-de-prueba-que-no-debe-salir-0123456789';
const OK_XML =
  '<?xml version="1.0" encoding="UTF-8"?><ResponseStatus version="2.0">' +
  '<statusCode>1</statusCode><statusString>OK</statusString><subStatusCode>ok</subStatusCode>' +
  '</ResponseStatus>';
const OK_JSON = JSON.stringify({ statusCode: 1, statusString: 'OK', subStatusCode: 'ok' });

const receptorXml = (host: string, puerto: number, url: string, porNombre = false): string =>
  '<?xml version="1.0" encoding="UTF-8"?><HttpHostNotificationList version="2.0">' +
  '<HttpHostNotification><id>1</id>' +
  `<url>${url}</url><protocolType>HTTP</protocolType><parameterFormatType>XML</parameterFormatType>` +
  `<addressingFormatType>${porNombre ? 'hostname' : 'ipaddress'}</addressingFormatType>` +
  (porNombre ? `<hostName>${host}</hostName>` : `<ipAddress>${host}</ipAddress>`) +
  `<portNo>${String(puerto)}</portNo><httpAuthenticationMethod>none</httpAuthenticationMethod>` +
  '<ANPR><detectionUpLoadPicturesType>vehicleDetectionPicture</detectionUpLoadPicturesType></ANPR>' +
  '</HttpHostNotification></HttpHostNotificationList>';

interface Guion {
  receptor: string | null;
  acs: Record<string, unknown> | null;
  /** Acepta la escritura y NO la guarda: la lectura de vuelta lo destapa. */
  olvidaLoEscrito?: boolean;
  rechazaEscritura?: boolean;
  escritos: string[];
}

const equipo = (g: Guion): typeof fetch =>
  (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entrada));
    const metodo = init?.method ?? 'GET';
    const cuerpo = typeof init?.body === 'string' ? init.body : '';
    if (url.pathname === '/ISAPI/Event/notification/httpHosts') {
      if (metodo === 'GET') {
        return g.receptor === null
          ? new Response(
              '<ResponseStatus><subStatusCode>notSupport</subStatusCode></ResponseStatus>',
              { status: 200 },
            )
          : new Response(g.receptor, { status: 200 });
      }
      g.escritos.push(cuerpo);
      if (g.rechazaEscritura === true) {
        return new Response(
          '<ResponseStatus><statusCode>4</statusCode><subStatusCode>badXmlContent</subStatusCode></ResponseStatus>',
          { status: 400 },
        );
      }
      if (g.olvidaLoEscrito !== true) g.receptor = cuerpo;
      return new Response(OK_XML, { status: 200 });
    }
    if (url.pathname === '/ISAPI/AccessControl/AcsCfg') {
      if (metodo === 'GET') {
        return g.acs === null
          ? new Response('{}', { status: 404 })
          : new Response(JSON.stringify({ AcsCfg: g.acs }), { status: 200 });
      }
      g.escritos.push(cuerpo);
      if (g.olvidaLoEscrito !== true) {
        g.acs = (JSON.parse(cuerpo) as { AcsCfg: Record<string, unknown> }).AcsCfg;
      }
      return new Response(OK_JSON, { status: 200 });
    }
    return new Response('', { status: 404 });
  }) as typeof fetch;

const corregir = (g: Guion, extra: Record<string, unknown>) =>
  aplicarCorreccion({
    host: HOST,
    puerto: 80,
    protocolo: 'http',
    usuario: 'servicio',
    clave: 'clave-de-prueba',
    confirmadaPor: 'operador-1',
    peticion: equipo(g),
    clase: 'receptor_de_eventos',
    ...extra,
  } as Parameters<typeof aplicarCorreccion>[0]);

describe('C2 · «Enviar eventos a este Mac»', () => {
  const destino = { receptor: { ip: MAC, puerto: 3000, ruta: RUTA } };

  it('cambia IP, puerto y ruta, lo lee de vuelta, y el secreto no sale en el resultado', async () => {
    const g: Guion = {
      receptor: receptorXml('192.0.2.9', 8080, '/viejo'),
      acs: null,
      escritos: [],
    };
    const r = await corregir(g, destino);
    expect(r).toMatchObject({
      clase: 'receptor_de_eventos',
      aplicada: true,
      valorAnterior: '192.0.2.9:8080',
      valorNuevo: `${MAC}:3000`,
    });
    expect(JSON.stringify(r)).not.toContain('secreto-de-prueba');
    expect(g.escritos[0]).toContain(`<ipAddress>${MAC}</ipAddress>`);
    expect(g.escritos[0]).toContain(`<url>${RUTA}</url>`);
    // El resto del receptor, intacto: leer-modificar-escribir.
    expect(g.escritos[0]).toContain('vehicleDetectionPicture');
  });

  it('un receptor por NOMBRE pasa a IP, que es lo que se fija', async () => {
    const g: Guion = {
      receptor: receptorXml('mac.local', 3000, '/x', true),
      acs: null,
      escritos: [],
    };
    const r = await corregir(g, destino);
    expect(r.aplicada).toBe(true);
    expect(g.escritos[0]).not.toContain('<hostName>');
    expect(g.escritos[0]).toContain('<addressingFormatType>ipaddress</addressingFormatType>');
  });

  it('aceptado pero NO guardado: la lectura de vuelta lo destapa y no se da por aplicada', async () => {
    const g: Guion = {
      receptor: receptorXml('192.0.2.9', 8080, '/viejo'),
      acs: null,
      olvidaLoEscrito: true,
      escritos: [],
    };
    const r = await corregir(g, destino);
    expect(r.aplicada).toBe(false);
    expect(r.detalle).toMatch(/al leerlo de vuelta no apunta a este Mac \(192\.0\.2\.9:8080\)/);
  });

  it('el equipo rechaza la escritura: se dice por qué', async () => {
    const g: Guion = {
      receptor: receptorXml('192.0.2.9', 8080, '/viejo'),
      acs: null,
      rechazaEscritura: true,
      escritos: [],
    };
    const r = await corregir(g, destino);
    expect(r.aplicada).toBe(false);
    expect(r.valorAnterior).toBe('192.0.2.9:8080');
  });

  it('sin configuración legible no se escribe a ciegas; sin destino, tampoco', async () => {
    const g: Guion = { receptor: null, acs: null, escritos: [] };
    expect((await corregir(g, destino)).aplicada).toBe(false);
    expect(g.escritos).toEqual([]);
    expect((await corregir(g, {})).detalle).toMatch(/Falta adónde publicar/);
  });

  it('una cámara sin ningún receptor recibe uno completo, sólo con la imagen de detección', async () => {
    const g: Guion = {
      receptor: '<HttpHostNotificationList version="2.0"></HttpHostNotificationList>',
      acs: null,
      escritos: [],
    };
    const r = await corregir(g, destino);
    expect(r).toMatchObject({ aplicada: true, valorAnterior: null });
    expect(g.escritos[0]).toContain('<detectionUpLoadPicturesType>detectionPicture<');
  });

  it('un bloque sin puerto no se toca', () => {
    expect(
      conDestino(
        '<HttpHostNotificationList><HttpHostNotification><url>/x</url><ipAddress>1</ipAddress></HttpHostNotification></HttpHostNotificationList>',
        { ip: MAC, puerto: 3000, ruta: RUTA },
      ),
    ).toBeNull();
    expect(conDestino('<Otro/>', { ip: MAC, puerto: 3000, ruta: RUTA })).toBeNull();
  });
});

describe('F2 (e) · «Verificación remota: activar / desactivar»', () => {
  const ACS = { remoteCheckDoorEnabled: true, checkChannelType: 'ISAPI', otroCampo: 7 };

  it('desactivar apaga SÓLO el interruptor, lo lee de vuelta y deja el resto', async () => {
    const g: Guion = { receptor: null, acs: { ...ACS }, escritos: [] };
    const r = await corregir(g, { clase: 'verificacion_remota', activar: false });
    expect(r).toMatchObject({ aplicada: true, valorAnterior: 'true', valorNuevo: 'false' });
    expect(r.detalle).toMatch(/vuelve a decidir sola/);
    expect(g.acs).toMatchObject({ remoteCheckDoorEnabled: false, otroCampo: 7 });
  });

  it('activar escribe canal ISAPI, el plazo y lo de sin plataforma', async () => {
    const g: Guion = { receptor: null, acs: { remoteCheckDoorEnabled: false }, escritos: [] };
    const r = await corregir(g, {
      clase: 'verificacion_remota',
      activar: true,
      plazoDeVerificacionS: 8,
      abrirSinPlataforma: false,
    });
    expect(r).toMatchObject({ aplicada: true, valorAnterior: 'false', valorNuevo: 'true' });
    expect(g.acs).toMatchObject({
      remoteCheckDoorEnabled: true,
      checkChannelType: 'ISAPI',
      remoteCheckTimeout: 8,
      offlineDevCheckOpenDoorEnabled: false,
    });
  });

  it('aceptado pero no guardado: no se da por aplicado', async () => {
    const g: Guion = { receptor: null, acs: { ...ACS }, olvidaLoEscrito: true, escritos: [] };
    const r = await corregir(g, { clase: 'verificacion_remota', activar: false });
    expect(r.aplicada).toBe(false);
    expect(r.detalle).toMatch(/sigue activada/);
  });

  it('sin el campo, o sin documento, no se escribe', async () => {
    const sinCampo: Guion = { receptor: null, acs: { otra: 1 }, escritos: [] };
    expect(
      (await corregir(sinCampo, { clase: 'verificacion_remota', activar: false })).detalle,
    ).toMatch(/no la admite/);
    const sinDoc: Guion = { receptor: null, acs: null, escritos: [] };
    expect((await corregir(sinDoc, { clase: 'verificacion_remota' })).aplicada).toBe(false);
    expect([...sinCampo.escritos, ...sinDoc.escritos]).toEqual([]);
  });
});

/** E4 (15-M) · apagar el receptor huérfano: `enabled=false` si el esquema lo trae; si no, a vacío. */
describe('conReceptorApagado', () => {
  const con = (extra: string): string =>
    '<HttpHostNotificationList><HttpHostNotification><id>1</id>' +
    extra +
    '<url>/alarm-server/abc</url><addressingFormatType>ipaddress</addressingFormatType>' +
    '<ipAddress>192.0.2.140</ipAddress><portNo>8080</portNo>' +
    '</HttpHostNotification></HttpHostNotificationList>';

  it('con `enabled`, lo pone en false y no toca la dirección', () => {
    const r = conReceptorApagado(con('<enabled>true</enabled>'));
    expect(r).toContain('<enabled>false</enabled>');
    expect(r).toContain('<ipAddress>192.0.2.140</ipAddress>');
  });

  it('sin `enabled`, apunta el primer receptor a la dirección vacía', () => {
    const r = conReceptorApagado(con(''));
    expect(r).toContain('<ipAddress>0.0.0.0</ipAddress>');
    expect(r).toContain('<portNo>80</portNo>');
    expect(r).toContain('<url>/</url>');
  });

  it('sin ningún receptor no hay nada que apagar', () => {
    expect(conReceptorApagado('<HttpHostNotificationList/>')).toBeNull();
  });
});
