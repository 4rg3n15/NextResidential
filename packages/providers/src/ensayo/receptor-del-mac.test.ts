import { describe, expect, it } from 'vitest';
import {
  ACCION_DEL_RECEPTOR,
  compararReceptorDelMac,
  juzgarReceptorDelMac,
  leerReceptoresDelDocumento,
  rutaSinSecreto,
} from './receptor-del-mac';
import { pasoDeEventos } from './paso-de-eventos';
import { lineasDelInforme } from './informe-de-ensayo';
import type { OpcionesDeEnsayo, ReceptorEsperado } from './tipos';
import { ipHaciaElEquipo } from '../red/ip-hacia-el-equipo';
import { equipoSimulado } from '../simulacion/equipo-simulado';
import type { GuionDeEquipo } from '../simulacion/equipo-simulado';
import { ClienteDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';
import { LIMITES_DE_FOTO_POR_OMISION } from '../terminal/foto-del-rostro';

/**
 * C2 (corrección de la 15-L) · ¿publica la cámara en ESTE Mac? La IP del Mac
 * en la red de la cámara, el PORT de la API y un secreto de
 * ALARM_SERVER_EQUIPOS en la ruta. El secreto no sale nunca por pantalla.
 */
const SECRETO = 'secreto-de-prueba-de-la-ruta-0000000001';
const RED = {
  en0: [{ address: '192.0.2.10', netmask: '255.255.255.0', family: 'IPv4', internal: false }],
};
const esperado = (extra: Partial<ReceptorEsperado> = {}): ReceptorEsperado => ({
  direccion: ipHaciaElEquipo('192.0.2.64', RED),
  puerto: 3000,
  secretos: [SECRETO],
  ...extra,
});
const bueno = { host: '192.0.2.10', puerto: 3000, url: `/alarm-server/${SECRETO}` };

describe('leer y juzgar el receptor de la cámara', () => {
  it('lee IP o nombre según la forma de dirección, y un hostName vacío no tapa la IP', () => {
    const doc =
      '<HttpHostNotificationList><HttpHostNotification><url>/alarm-server/x</url>' +
      '<addressingFormatType>ipaddress</addressingFormatType><hostName></hostName>' +
      '<ipAddress>192.0.2.10</ipAddress><portNo>3000</portNo></HttpHostNotification>' +
      '<HttpHostNotification><addressingFormatType>hostname</addressingFormatType>' +
      '<hostName>mac.local</hostName><portNo>80</portNo></HttpHostNotification>' +
      '</HttpHostNotificationList>';
    expect(leerReceptoresDelDocumento(doc)).toEqual([
      { host: '192.0.2.10', puerto: 3000, url: '/alarm-server/x' },
      { host: 'mac.local', puerto: 80, url: null },
    ]);
  });

  it('la ruta se enseña SIN el secreto, sea cual sea', () => {
    expect(rutaSinSecreto(`/alarm-server/${SECRETO}`)).toBe('/alarm-server/••••');
    expect(rutaSinSecreto('/alarm-server/a/b?c=d')).toBe('/alarm-server/••••/••••');
    expect(rutaSinSecreto(null)).toBe('(sin ruta)');
    expect(rutaSinSecreto('/')).toBe('/');
  });

  it('conforme cuando UNO de los receptores es este Mac', () => {
    const j = juzgarReceptorDelMac([{ ...bueno, host: '198.51.100.7' }, bueno], esperado());
    expect(j.conforme).toBe(true);
    expect(j.detalle[0]).toMatch(/este Mac hacia la cámara: 192\.0\.2\.10 \(interfaz en0/);
    expect(j.detalle.join('\n')).not.toContain(SECRETO);
  });

  it('otra IP, otro puerto, otra ruta, otro secreto: cada uno con su porqué', () => {
    const j = juzgarReceptorDelMac(
      [{ host: '198.51.100.7', puerto: 8080, url: '/alarm-server/otro' }],
      esperado(),
    );
    expect(j.conforme).toBe(false);
    expect(j.causa).toMatch(
      /NO publica en este Mac: publica a 198\.51\.100\.7 y este Mac está en 192\.0\.2\.10/,
    );
    expect(j.causa).toMatch(/al puerto 8080 y la API escucha en 3000/);
    expect(j.causa).toMatch(/secreto que no está en ALARM_SERVER_EQUIPOS/);
    expect(juzgarReceptorDelMac([{ ...bueno, url: '/otra' }], esperado()).causa).toMatch(
      /ruta \/otra, que no es la del servidor de alarma/,
    );
    expect(juzgarReceptorDelMac([bueno], esperado({ secretos: [] })).causa).toMatch(
      /ALARM_SERVER_EQUIPOS está vacía/,
    );
    expect(
      juzgarReceptorDelMac([{ host: null, puerto: null, url: null }], esperado()).causa,
    ).toMatch(/no tiene dirección.*al puerto \(ninguno\)/);
  });

  it('sin receptores, o sin saber la IP del Mac: no conforme, y dice por qué', () => {
    expect(juzgarReceptorDelMac([], esperado()).causa).toMatch(/ningún servidor de alarma/);
    const sinRed = juzgarReceptorDelMac(
      [bueno],
      esperado({ direccion: ipHaciaElEquipo('192.0.2.64', {}) }),
    );
    expect(sinRed.conforme).toBe(false);
    expect(sinRed.causa).toMatch(/No se sabe a qué dirección.*no tiene ninguna IP en la red/);
    const anunciada = juzgarReceptorDelMac(
      [bueno],
      esperado({ direccion: ipHaciaElEquipo('192.0.2.64', {}, '192.0.2.10') }),
    );
    expect(anunciada.conforme).toBe(true);
    expect(anunciada.detalle[0]).toMatch(/ALARM_SERVER_IP_ANUNCIADA/);
  });
});

describe('paso 4 de la cámara · el receptor se compara ANTES de pedir el gesto', () => {
  const opciones = (guion: Partial<GuionDeEquipo>, llamadas: string[]): OpcionesDeEnsayo => ({
    equipo: {
      familia: 'camara',
      host: '192.0.2.64',
      usuario: 'servicio',
      clave: 'p1',
      puerta: 1,
      canalDeVideo: '102',
      puertoRtsp: 554,
      peticion: equipoSimulado({ familia: 'camara', usuario: 'servicio', clave: 'p1', ...guion }),
    },
    interlocutor: {
      indicar: async (t) => {
        llamadas.push(t);
      },
      confirmar: async () => true,
    },
    soloLectura: false,
    plataforma: {
      primeroDesde: async () => ({ titulo: 'Placa ABC123', ocurridoEn: new Date() }),
    },
    esperaDeEventoMs: 100,
    limitesDeFoto: LIMITES_DE_FOTO_POR_OMISION,
    zona: 'America/Bogota',
    ahora: () => new Date(),
    receptorEsperado: esperado(),
  });

  it('publica a otro sitio: FALLO en el acto, con «Enviar eventos a este Mac», sin esperar', async () => {
    const llamadas: string[] = [];
    const r = await pasoDeEventos(
      opciones(
        { receptor: { ip: '198.51.100.7', puerto: 3000, url: `/alarm-server/${SECRETO}` } },
        llamadas,
      ),
    );
    expect(r.estado).toBe('fallo');
    expect(r.accion).toBe(ACCION_DEL_RECEPTOR);
    expect(r.accion).toMatch(/pulse «Enviar eventos a este Mac»/);
    expect(llamadas).toEqual([]);
  });

  it('el simulado TIENE ESTADO: lo que se escribe se lee, y entonces llega', async () => {
    const llamadas: string[] = [];
    const o = opciones({ receptor: { ip: '198.51.100.7', puerto: 8080, url: '/viejo' } }, llamadas);
    const ruta = rutaPara('apuntar el equipo a nuestro receptor', 'camara');
    const escrito = await new ClienteDeEquipo(o.equipo).pedir(ruta.metodo, ruta.ruta, {
      tipo: 'application/xml',
      contenido:
        '<HttpHostNotificationList xmlns="http://www.isapi.org/ver20/XMLSchema">' +
        `<HttpHostNotification><id>1</id><url>/alarm-server/${SECRETO}</url>` +
        '<addressingFormatType>ipaddress</addressingFormatType><ipAddress>192.0.2.10</ipAddress>' +
        '<portNo>3000</portNo></HttpHostNotification></HttpHostNotificationList>',
    });
    expect(escrito.ok).toBe(true);
    const r = await pasoDeEventos(o);
    expect(r.estado).toBe('ok');
    expect(llamadas).toHaveLength(1);
    const texto = lineasDelInforme(
      { familia: 'camara', modelo: null, firmware: null, pasos: [r] },
      [],
    ).join('\n');
    expect(texto).toMatch(/receptor 1 de la cámara: 192\.0\.2\.10:3000 \/alarm-server\/••••/);
    expect(texto).not.toContain(SECRETO);
    // Un cuerpo que no es un receptor no se escribe.
    const malo = await new ClienteDeEquipo(o.equipo).pedir(ruta.metodo, ruta.ruta, {
      tipo: 'application/xml',
      contenido: '<Otra/>',
    });
    expect(malo.estado).toBe(400);
  });

  it('una cámara que no dice su receptor: no se compara y se sigue como antes', async () => {
    const llamadas: string[] = [];
    const r = await pasoDeEventos(
      opciones({ sinSoporte: ['leer a qué receptor publica el equipo'] }, llamadas),
    );
    expect(r.estado).toBe('ok');
    expect(r.detalle).toEqual([]);
  });

  it('una cámara que no contesta a esa lectura: tampoco se compara', async () => {
    const o = opciones({}, []);
    const caida: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    expect(await compararReceptorDelMac({ ...o.equipo, peticion: caida }, esperado())).toBeNull();
  });
});
