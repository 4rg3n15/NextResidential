import { describe, expect, it } from 'vitest';
import { equipoSimulado } from './equipo-simulado';
import { sobreDeLectura, xmlDeLectura } from './camara-que-publica';
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

describe('el videoportero contra un equipo simulado', () => {
  it('abre atribuyendo al operador', async () => {
    const portero = new Videoportero({
      host: 'portero.invalid',
      ...CREDENCIALES,
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
    const evento = desdeAlarmServerXml(abierto.xml, 'camara-1', new Date());

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
});
