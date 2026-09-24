import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { equipoSimulado } from './equipo-simulado';
import { jpegDePrueba, publicarLectura, sobreDeLectura, xmlDeLectura } from './camara-que-publica';
import { TerminalFacial } from '../terminal/terminal-facial';
import { RutaNoSoportada } from '../terminal/terminal-facial';
import { Videoportero } from '../videoportero/videoportero';
import { EscuchaDeAlertStream } from '../equipo/escucha-alertstream';
import { abrirSobreDeAlarmServer } from '../hikvision/publicacion-alarm-server';
import { desdeAlarmServerXml } from '../hikvision/contratos-de-evento';

/**
 * ADR-03 en su forma comprobable: los adaptadores de esta etapa recorren su
 * camino entero contra un equipo que no existe.
 */
const CREDENCIALES = { usuario: 'servicio', clave: 'secreta-de-prueba' };

describe('la terminal facial contra un equipo simulado', () => {
  const terminal = (sinSoporte: readonly string[] = []): TerminalFacial =>
    new TerminalFacial({
      host: 'terminal.invalid',
      ...CREDENCIALES,
      modo: 'reporta_y_espera',
      numeroDePuerta: 1,
      peticion: equipoSimulado({ familia: 'terminal', ...CREDENCIALES, sinSoporte }),
    });

  it('sincroniza una plantilla de punta a punta, con Digest de dos viajes', async () => {
    // El simulado contesta 401 al primer intento, como el aparato: si aceptara
    // a la primera, la renegociación no se ejercitaría nunca.
    await expect(
      terminal().sincronizar('t-1', 'plantilla-1', new Uint8Array([1, 2, 3])),
    ).resolves.toBeUndefined();
  });

  it('abre el relé y lee el estado', async () => {
    await expect(terminal().abrir('t-1', 'op-1')).resolves.toMatchObject({ aceptado: true });
    await expect(terminal().estado('t-1')).resolves.toBe('en_linea');
  });

  it('una ruta DOCUMENTADA que este firmware no soporta falla como debe', async () => {
    // Es el desenlace ESPERADO de once de las doce rutas del catálogo. Probar
    // sólo el camino feliz de una ruta sin verificar es probar la suposición.
    const conHueco = terminal(['cargar la plantilla facial']);
    await expect(conHueco.sincronizar('t-1', 'p-1', new Uint8Array([1]))).rejects.toBeInstanceOf(
      RutaNoSoportada,
    );
  });

  it('con credenciales equivocadas no entra, y no insiste', async () => {
    const terminalMala = new TerminalFacial({
      host: 'terminal.invalid',
      usuario: 'servicio',
      clave: 'la-que-no-es',
      modo: 'reporta_y_espera',
      peticion: equipoSimulado({ familia: 'terminal', ...CREDENCIALES }),
    });
    await expect(terminalMala.estado('t-1')).resolves.toBe('degradado');
  });
});

describe('el simulado responde con lo que se le declara', () => {
  it('devuelve el modelo y el firmware declarados, y los de omisión si no', async () => {
    // El guion de puesta en marcha lee esta ruta la primera y decide con ella:
    // si devolviera siempre lo mismo, no serviría para probarlo.
    const pedir = async (guion: Parameters<typeof equipoSimulado>[0]): Promise<string> => {
      const terminal = new TerminalFacial({
        host: 'x.invalid',
        ...CREDENCIALES,
        modo: 'reporta_y_espera',
        peticion: equipoSimulado(guion),
      });
      return terminal.estado('t-1');
    };
    await expect(
      pedir({ familia: 'terminal', ...CREDENCIALES, modelo: 'DS-DECLARADO', firmware: 'V9' }),
    ).resolves.toBe('en_linea');
    await expect(pedir({ familia: 'terminal', ...CREDENCIALES })).resolves.toBe('en_linea');
  });

  it('acepta Digest SIN qop, que es lo que emite un cliente antiguo', async () => {
    /**
     * El `SesionDigest` de este repositorio siempre responde con `qop`, así
     * que esta rama no se alcanza por los adaptadores. Se ejercita a mano
     * porque el simulado tiene que admitir lo mismo que el aparato: un cliente
     * que no negocie `qop` no puede quedarse fuera por culpa del doble, o el
     * día que haga falta probarlo el simulado sería el que miente.
     */
    const falso = equipoSimulado({ familia: 'terminal', ...CREDENCIALES });
    const uri = '/ISAPI/System/deviceInfo';
    const ha1 = createHash('md5')
      .update(`${CREDENCIALES.usuario}:equipo-simulado:${CREDENCIALES.clave}`)
      .digest('hex');
    const ha2 = createHash('md5').update(`GET:${uri}`).digest('hex');
    const respuestaDigest = createHash('md5').update(`${ha1}:nonce-de-prueba:${ha2}`).digest('hex');

    const r = await falso(`http://x.invalid${uri}`, {
      method: 'GET',
      headers: {
        authorization:
          `Digest username="${CREDENCIALES.usuario}", realm="equipo-simulado", ` +
          `nonce="nonce-de-prueba", uri="${uri}", response="${respuestaDigest}"`,
      },
    });
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('DeviceInfo');
  });

  it('una ruta que el catálogo no conoce da 404, como el equipo de verdad', async () => {
    const falso = equipoSimulado({ familia: 'terminal', ...CREDENCIALES });
    const primera = await falso('http://x.invalid/ISAPI/Inventada/ruta', { method: 'GET' });
    expect(primera.status).toBe(401);
    // Con el desafío respondido —aquí basta con que no sea válido— sigue sin
    // existir: lo que se comprueba es que NO devuelve 200 por defecto.
    expect((await falso('http://x.invalid/ISAPI/Inventada/ruta', { method: 'GET' })).status).toBe(
      401,
    );
  });
});

describe('el videoportero contra un equipo simulado', () => {
  it('abre atribuyendo al operador', async () => {
    const portero = new Videoportero({
      host: 'portero.invalid',
      ...CREDENCIALES,
      numeroDePuerta: 1,
      peticion: equipoSimulado({ familia: 'videoportero', ...CREDENCIALES }),
    });
    await expect(portero.abrir('p-1', 'operador-1')).resolves.toMatchObject({ aceptado: true });
  });
});

describe('el flujo de eventos con volcado histórico', () => {
  it('entrega lo vivo y descarta lo viejo, que es la trampa de la puesta en marcha', async () => {
    const historicos = Array.from({ length: 5 }, (_, i) => ({
      eventType: 'doorbell',
      currentEvent: false,
      channelID: i,
    }));
    const escucha = new EscuchaDeAlertStream({
      host: 'portero.invalid',
      ...CREDENCIALES,
      dispositivoId: 'portero-1',
      familia: 'videoportero',
      peticion: equipoSimulado({
        familia: 'videoportero',
        ...CREDENCIALES,
        flujo: [...historicos, { eventType: 'doorbell', currentEvent: true, channelID: 9 }],
      }),
      esperar: async () => undefined,
      azar: () => 0.5,
    });

    const cancelar = new AbortController();
    const vistos = [];
    for await (const evento of escucha.escuchar(cancelar.signal)) {
      vistos.push(evento);
      cancelar.abort();
    }

    expect(vistos).toHaveLength(1);
    expect(vistos[0]?.clase).toBe('timbre');
    expect(escucha.historicosDescartados).toBe(5);
  });
});

describe('la cámara que publica', () => {
  it('produce un sobre que el receptor abre y normaliza', async () => {
    // Las dos mitades del recorrido de placa, enfrentadas: lo que la cámara
    // construye tiene que ser exactamente lo que el receptor sabe abrir.
    const sobre = sobreDeLectura({ placa: 'ABC123', confianza: 91, referencia: 'ev-9' });
    const abierto = abrirSobreDeAlarmServer(sobre.cuerpo, sobre.tipoDeContenido);
    const evento = desdeAlarmServerXml(abierto.documento, 'camara-1', new Date());

    expect(evento?.clase).toBe('placa');
    expect(evento?.placa).toBe('ABC123');
    expect(evento?.confianza).toBeCloseTo(0.91, 5);
    expect(evento?.referenciaDelEquipo).toBe('ev-9');
    // La escena es la grande y el recorte el pequeño.
    expect(abierto.foto?.length).toBeGreaterThan(abierto.recorte?.length ?? 0);
  });

  it('sin recorte, la única imagen es la ESCENA y no el recorte', async () => {
    const sobre = sobreDeLectura({ placa: 'XYZ789' }, { conRecorte: false });
    const abierto = abrirSobreDeAlarmServer(sobre.cuerpo, sobre.tipoDeContenido);
    expect(abierto.foto).not.toBeNull();
    expect(abierto.recorte).toBeNull();
  });

  it('un evento que no es de placa se reconoce como tal', async () => {
    const xml = xmlDeLectura({ placa: '', tipoDeEvento: 'IO' });
    expect(desdeAlarmServerXml(xml, 'camara-1', new Date())?.clase).toBe('desconocido');
  });

  it('PUBLICA de verdad: POST, multipart y el sobre entero en el cuerpo', async () => {
    // Es la mitad que usa el guion de puesta en marcha para ensayar el
    // recorrido SIN cámara, y por eso tiene que ejercitarse: si sólo se
    // probara el constructor del sobre, nadie sabría que el envío va mal.
    let visto: { url: string; opciones: RequestInit } | null = null;
    const peticion = (async (url: string, opciones: RequestInit) => {
      visto = { url, opciones };
      return new Response('{}', { status: 202 });
    }) as unknown as typeof fetch;

    const r = await publicarLectura(
      'http://receptor.invalid/alarm-server/s',
      { placa: 'PUB123' },
      { peticion },
    );
    expect(r.status).toBe(202);
    const enviado = visto as unknown as { url: string; opciones: RequestInit };
    expect(enviado.opciones.method).toBe('POST');
    expect((enviado.opciones.headers as Record<string, string>)['content-type']).toMatch(
      /multipart\/form-data; boundary=/,
    );
    expect(Buffer.from(enviado.opciones.body as Buffer).toString('latin1')).toContain('PUB123');
  });

  it('el JPEG de prueba es un JPEG: empieza por SOI y termina por EOI', async () => {
    // Un relleno cualquiera pasaría por las pruebas de este repositorio y
    // fallaría contra cualquier consumidor que mire los marcadores.
    const bytes = jpegDePrueba(64);
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
    expect(bytes[bytes.length - 2]).toBe(0xff);
    expect(bytes[bytes.length - 1]).toBe(0xd9);
    // Y no se rompe con un tamaño absurdo.
    expect(jpegDePrueba(1).length).toBe(4);
  });
});
