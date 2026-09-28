import { describe, expect, it } from 'vitest';
import { documentoDelReceptor, receptorEscrito, receptorInicial } from './documentos-del-simulado';
import { equipoSimulado } from './equipo-simulado';
import { ClienteDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';

/**
 * El simulado de la corrección de la 15-L: el receptor de la cámara CON
 * ESTADO (C2) y las situaciones de sitio a petición (C7, F4).
 */
const CRED = { usuario: 'servicio', clave: 'p1' } as const;

describe('C2 · el receptor de la cámara simulada tiene estado', () => {
  it('por omisión, el de siempre; por nombre, si el guion lo pide', () => {
    const base = receptorInicial({ familia: 'camara', ...CRED });
    expect(base).toMatchObject({ url: '/alarm-server', ip: '198.51.100.10', puerto: 3000 });
    const porNombre = receptorInicial({
      familia: 'camara',
      ...CRED,
      receptor: { nombre: 'mac.local' },
    });
    expect(porNombre).toMatchObject({ ip: null, nombre: 'mac.local' });
    expect(documentoDelReceptor(porNombre)).toMatch(
      /<addressingFormatType>hostname<\/addressingFormatType><hostName>mac\.local<\/hostName>/,
    );
  });

  it('lo escrito pisa sólo lo que trae; lo que no es un receptor no se escribe', () => {
    const base = receptorInicial({ familia: 'camara', ...CRED });
    const aNombre = receptorEscrito(
      base,
      '<HttpHostNotification><hostName>mac.local</hostName><portNo>x</portNo></HttpHostNotification>',
    );
    expect(aNombre).toMatchObject({ ip: null, nombre: 'mac.local', puerto: 3000, url: base.url });
    const aIp = receptorEscrito(
      base,
      '<HttpHostNotification><addressingFormatType>ipaddress</addressingFormatType>' +
        '<parameterFormatType>JSON</parameterFormatType></HttpHostNotification>',
    );
    expect(aIp).toMatchObject({ ip: '198.51.100.10', nombre: null, formato: 'JSON' });
    expect(receptorEscrito(base, '<Otra/>')).toBeNull();
  });

  it('también por la ruta con identificador', async () => {
    const cliente = new ClienteDeEquipo({
      host: 'camara.estado.invalid',
      ...CRED,
      peticion: equipoSimulado({ familia: 'camara', ...CRED }),
    });
    const w = rutaPara('apuntar un receptor concreto por su identificador', 'camara');
    await cliente.pedir(w.metodo, w.ruta, {
      tipo: 'application/xml',
      contenido: '<HttpHostNotification><portNo>8443</portNo></HttpHostNotification>',
    });
    const l = rutaPara('leer a qué receptor publica el equipo', 'camara');
    expect((await cliente.pedir(l.metodo, l.ruta)).cuerpo).toMatch(/<portNo>8443<\/portNo>/);
  });
});

describe('C7 · el rostro que otra plataforma borra, con el reloj de verdad', () => {
  it('con plazo cero, la búsqueda posterior al alta ya no lo halla', async () => {
    const cliente = new ClienteDeEquipo({
      host: 'terminal.borra.invalid',
      ...CRED,
      peticion: equipoSimulado({
        familia: 'terminal',
        ...CRED,
        situaciones: { otraPlataformaBorraRostrosTrasMs: 0 },
      }),
    });
    const alta = rutaPara('dar de alta la persona a la que pertenece la plantilla', 'terminal');
    await cliente.pedir(alta.metodo, alta.ruta, {
      tipo: 'application/json',
      contenido: JSON.stringify({
        UserInfo: { employeeNo: 'P1', userType: 'visitor', Valid: { enable: false } },
      }),
    });
    const carga = rutaPara('cargar la plantilla facial', 'terminal');
    const cuerpo = Buffer.from(
      '--s\r\nContent-Disposition: form-data; name="FaceDataRecord"\r\n\r\n' +
        '{"faceLibType":"blackFD","FDID":"1","FPID":"P1"}\r\n' +
        '--s\r\nContent-Disposition: form-data; name="img"; filename="f.jpg"\r\n\r\nx\r\n--s--\r\n',
      'latin1',
    );
    const cargada = await cliente.pedir(carga.metodo, carga.ruta, {
      tipo: 'multipart/form-data; boundary=s',
      contenido: cuerpo,
    });
    expect(cargada.ok).toBe(true);
    const busca = rutaPara('buscar una plantilla en la biblioteca de rostros', 'terminal');
    const r = await cliente.pedir(busca.metodo, busca.ruta, {
      tipo: 'application/json',
      contenido: '{"FPID":"P1"}',
    });
    expect(r.cuerpo).toMatch(/"numOfMatches":0/);
  });
});
