import { describe, expect, it } from 'vitest';
import { construirClaveIdempotencia } from '@ncr/domain-core';
import {
  bloqueDesdeXml,
  desdeAlarmServerJson,
  desdeAlertStreamJson,
  esEventoEnVivo,
} from './contratos-de-evento';
import type { BloqueDeAlertStream } from './contratos-de-evento';
import { referenciaDelEvento } from './referencia-del-evento';
import {
  FlujoEnVivo,
  VerificacionRemotaSimulada,
  desenlacesDeVerificacionPor,
} from '../simulacion/verificacion-remota-simulada';
import { equipoSimulado } from '../simulacion/equipo-simulado';
import { aplicarCorreccion } from '../diagnostico/correcciones';
import { ClienteDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';
import { TerminalFacial } from '../terminal/terminal-facial';

/**
 * ETAPA 15-L · Bloque A · R2, R3 y R4, cada uno con el caso que lo rompía.
 *
 * Los bloques son los de la guía de la serie («Receive Verification Requests
 * from Device», `VoiceTalkEvent`), con valores inventados: nada aquí es una
 * captura de los equipos de sitio.
 */
const AHORA = new Date('2026-09-27T15:00:00.000Z');
const TERMINAL = '90000000-0000-4000-8000-000000000002';
const COPROPIEDAD = '10000000-0000-4000-8000-000000000001';

/** El evento de la guía, con la serie y la hora que se le pidan. */
const rostro = (serie: number, hora = '2026-09-27T10:00:00-05:00'): BloqueDeAlertStream => ({
  eventType: 'AccessControllerEvent',
  dateTime: hora,
  channelID: 1,
  AccessControllerEvent: {
    majorEventType: 5,
    subEventType: 75,
    employeeNoString: 'abc123',
    serialNo: serie,
    currentEvent: true,
    remoteCheck: true,
  },
});

const clave = (referencia: string | null): string => {
  const r = construirClaveIdempotencia({
    copropiedadId: COPROPIEDAD,
    dispositivoId: TERMINAL,
    origen: 'facial',
    referenciaExterna: referencia ?? 'sin-referencia',
  });
  if (!r.ok) throw new Error(r.error.detalle);
  return r.valor;
};

describe('R2 · la referencia del evento lleva su serie y su hora, nunca sólo el canal', () => {
  it('dos rostros seguidos por el mismo canal dan DOS claves de idempotencia', () => {
    const primero = desdeAlertStreamJson(rostro(1866), TERMINAL, AHORA);
    const segundo = desdeAlertStreamJson(rostro(1867), TERMINAL, AHORA);
    expect(primero.referenciaDelEquipo).not.toBeNull();
    expect(clave(primero.referenciaDelEquipo)).not.toBe(clave(segundo.referenciaDelEquipo));
    // Y los dos esperan veredicto, cada uno con SU serie.
    expect([primero.serieDelEquipo, segundo.serieDelEquipo]).toEqual([1866, 1867]);
  });

  it('el MISMO evento reenviado por el equipo da la MISMA clave: se descarta el duplicado', () => {
    const una = desdeAlertStreamJson(rostro(1866), TERMINAL, AHORA);
    const otra = desdeAlertStreamJson(rostro(1866), TERMINAL, new Date(AHORA.getTime() + 9000));
    expect(clave(una.referenciaDelEquipo)).toBe(clave(otra.referenciaDelEquipo));
  });

  it('tras un reinicio la serie vuelve a empezar: la hora del equipo las separa', () => {
    const antes = desdeAlertStreamJson(rostro(1, '2026-09-27T08:00:00-05:00'), TERMINAL, AHORA);
    const despues = desdeAlertStreamJson(rostro(1, '2026-09-27T11:00:00-05:00'), TERMINAL, AHORA);
    expect(antes.referenciaDelEquipo).not.toBe(despues.referenciaDelEquipo);
  });

  it('la referencia es admisible en la clave aunque el equipo mande de todo', () => {
    const r = referenciaDelEvento({
      canal: '1/2',
      serie: '18:66+',
      fecha: '2026-09-27T10:00:00+08:00',
      uid: `${'x'.repeat(80)}-é/`,
      orden: 'request',
    });
    expect(r).toMatch(/^[A-Za-z0-9.]{1,128}$/);
    expect(() => clave(r)).not.toThrow();
  });

  it('sin serie, sin uid y sin hora no hay referencia: sólo el canal no identifica nada', () => {
    expect(referenciaDelEvento({ canal: 1 })).toBeNull();
  });

  it('la llamada y su cancelación comparten serie y se distinguen por la orden', () => {
    const llamada = (cmdType: string): BloqueDeAlertStream => ({
      eventType: 'voiceTalkEvent',
      dateTime: '2026-09-27T10:00:00-05:00',
      VoiceTalkEvent: { cmdType, serialNo: 77, currentEvent: true },
    });
    const pide = desdeAlertStreamJson(llamada('request'), TERMINAL, AHORA);
    const cancela = desdeAlertStreamJson(llamada('cancel'), TERMINAL, AHORA);
    expect(pide.referenciaDelEquipo).not.toBe(cancela.referenciaDelEquipo);
  });
});

describe('R3 · el XML del flujo trae la pregunta de la terminal', () => {
  const XML =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<EventNotificationAlert version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">' +
    '<ipAddress>198.51.100.7</ipAddress><channelID>1</channelID>' +
    '<dateTime>2026-09-27T10:00:00-05:00</dateTime>' +
    '<eventType>AccessControllerEvent</eventType><eventState>active</eventState>' +
    '<AccessControllerEvent><majorEventType>5</majorEventType><subEventType>75</subEventType>' +
    '<employeeNoString>abc123</employeeNoString><serialNo>1866</serialNo>' +
    '<currentEvent>true</currentEvent><remoteCheck>true</remoteCheck>' +
    '<time>2026-09-27T10:00:00-05:00</time></AccessControllerEvent>' +
    '</EventNotificationAlert>';

  it('remoteCheck, serialNo y el tipo del evento llegan al evento normalizado', () => {
    const bloque = bloqueDesdeXml(XML);
    if (bloque === null || bloque === 'respuesta_de_suscripcion') throw new Error('sin bloque');
    expect(bloque.AccessControllerEvent).toMatchObject({
      majorEventType: 5,
      subEventType: 75,
      serialNo: 1866,
      remoteCheck: true,
    });
    const evento = desdeAlertStreamJson(bloque, TERMINAL, AHORA);
    expect(evento.enVivo).toBe(true);
    expect(evento.esperaVeredicto).toBe(true);
    expect(evento.serieDelEquipo).toBe(1866);
    expect(evento.personaId).not.toBeNull();
    expect(evento.referenciaDelEquipo).toContain('s1866');
  });

  it('el currentEvent de DENTRO no se toma por uno de la raíz', () => {
    const bloque = bloqueDesdeXml(XML);
    if (bloque === null || bloque === 'respuesta_de_suscripcion') throw new Error('sin bloque');
    expect(bloque.currentEvent).toBeUndefined();
    expect(esEventoEnVivo(bloque)).toBe(true);
  });

  it('la llamada del videoportero en XML: orden, serie y origen', () => {
    const bloque = bloqueDesdeXml(
      '<EventNotificationAlert><eventType>voiceTalkEvent</eventType>' +
        '<dateTime>2026-09-27T10:00:00-05:00</dateTime>' +
        '<VoiceTalkEvent><cmdType>request</cmdType><serialNo>12</serialNo>' +
        '<currentEvent>true</currentEvent><src><buildingNumber>2</buildingNumber>' +
        '<unitNumber>305</unitNumber></src></VoiceTalkEvent></EventNotificationAlert>',
    );
    if (bloque === null || bloque === 'respuesta_de_suscripcion') throw new Error('sin bloque');
    const evento = desdeAlertStreamJson(bloque, TERMINAL, AHORA);
    expect(evento.clase).toBe('llamada');
    expect(evento.enVivo).toBe(true);
    expect(evento.unidadDeLlamada).toBe('305');
    expect(evento.edificioDeLlamada).toBe('2');
  });
});

describe('R4 · por el Alarm Server, en vivo lo dice currentEvent cuando no hay alarmDataType', () => {
  const sobre = (extra: Record<string, unknown>): string =>
    JSON.stringify({ ...rostro(1866), ...extra });

  it('la terminal no emite alarmDataType: su currentEvent de dentro basta', () => {
    const evento = desdeAlarmServerJson(sobre({}), TERMINAL, AHORA);
    expect(evento?.enVivo).toBe(true);
    expect(evento?.esperaVeredicto).toBe(true);
  });

  it('alarmDataType, si viene, MANDA: 1 es histórico aunque diga currentEvent', () => {
    expect(desdeAlarmServerJson(sobre({ alarmDataType: 1 }), TERMINAL, AHORA)?.enVivo).toBe(false);
  });

  it('sin ninguno de los dos, histórico: la dirección segura', () => {
    const sinNada = JSON.stringify({
      eventType: 'AccessControllerEvent',
      AccessControllerEvent: { serialNo: 3 },
    });
    expect(desdeAlarmServerJson(sinNada, TERMINAL, AHORA)?.enVivo).toBe(false);
  });
});

describe('la terminal simulada ACTÚA sobre el veredicto (modo armado)', () => {
  const montar = (plazoMs = 5000) => {
    let t = 0;
    const v = new VerificacionRemotaSimulada(undefined, plazoMs, () => t);
    return { v, avanzar: (ms: number) => (t += ms) };
  };
  const veredicto = (serie: number, resultado: 'success' | 'failed'): string =>
    JSON.stringify({ RemoteCheck: { serialNo: serie, checkResult: resultado } });

  it('success con su serie y a tiempo: abre', () => {
    const { v, avanzar } = montar();
    v.alEmitir(rostro(1866) as Record<string, unknown>);
    avanzar(300);
    expect(v.contestar(veredicto(1866, 'success'))).toBe('abrio');
  });

  it('failed: niega', () => {
    const { v } = montar();
    v.alEmitir(rostro(1866) as Record<string, unknown>);
    expect(v.contestar(veredicto(1866, 'failed'))).toBe('nego');
  });

  it('fuera de plazo: ya negó sola, el success llega tarde', () => {
    const { v, avanzar } = montar(5000);
    v.alEmitir(rostro(1866) as Record<string, unknown>);
    avanzar(5001);
    expect(v.contestar(veredicto(1866, 'success'))).toBe('vencida');
  });

  it('una serie que no preguntó (la de siempre, R2): no abre', () => {
    const { v } = montar();
    v.alEmitir(rostro(1867) as Record<string, unknown>);
    expect(v.contestar(veredicto(1866, 'success'))).toBe('serie_desconocida');
  });

  it('cada petición se contesta UNA vez', () => {
    const { v } = montar();
    v.alEmitir(rostro(1866) as Record<string, unknown>);
    expect(v.contestar(veredicto(1866, 'success'))).toBe('abrio');
    expect(v.contestar(veredicto(1866, 'success'))).toBe('serie_desconocida');
  });
});

/**
 * Decisiones 5 y 6 del cliente · la corrección «verificación remota» deja la
 * terminal en modo ARMADO (`checkChannelType "ISAPI"`) y escribe la apertura
 * sin plataforma que diga el `.env` (por omisión, NO).
 */
describe('la corrección deja la terminal en modo armado, y sólo entonces abre', () => {
  const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;
  const HOST = '203.0.113.41';
  const conexion = (peticion: typeof fetch) =>
    ({ host: HOST, puerto: 80, protocolo: 'http', ...CREDENCIAL, peticion }) as const;

  const leerAcs = async (peticion: typeof fetch): Promise<Record<string, unknown>> => {
    const ruta = rutaPara('leer si la terminal espera el veredicto de la plataforma', 'terminal');
    const r = await new ClienteDeEquipo(conexion(peticion)).pedir(ruta.metodo, ruta.ruta);
    return (JSON.parse(r.cuerpo) as { AcsCfg: Record<string, unknown> }).AcsCfg;
  };

  /** La terminal emite por su flujo, la plataforma contesta: ¿qué hizo? */
  const pasaAlguien = async (
    peticion: typeof fetch,
    flujo: FlujoEnVivo,
    serie: number,
  ): Promise<string | undefined> => {
    const ruta = rutaPara('escuchar los eventos que el equipo emite', 'terminal');
    const control = new AbortController();
    const abierto = await new ClienteDeEquipo(conexion(peticion)).abrirFlujoDeEventos(
      ruta.ruta,
      control.signal,
    );
    flujo.emitir(rostro(serie) as Record<string, unknown>);
    await abierto.trozos[Symbol.asyncIterator]().next();
    control.abort();
    await new TerminalFacial({
      ...conexion(peticion),
      modo: 'reporta_y_espera',
    }).responderVerificacion(TERMINAL, { serie, permitido: true, motivo: 'acceso permitido' });
    return desenlacesDeVerificacionPor.get(HOST)?.at(-1)?.desenlace;
  };

  it('en ISAPIListen la pregunta no llega por el flujo: el success no abre nada', async () => {
    const flujo = new FlujoEnVivo();
    const peticion = equipoSimulado({
      familia: 'terminal',
      ...CREDENCIAL,
      destino: HOST,
      enVivo: flujo,
      canalDeVerificacion: 'ISAPIListen',
    });
    expect(await pasaAlguien(peticion, flujo, 10)).toBe('serie_desconocida');

    const r = await aplicarCorreccion({
      ...conexion(peticion),
      clase: 'verificacion_remota',
      confirmadaPor: 'operador-1',
    });
    expect(r.aplicada).toBe(true);
    const acs = await leerAcs(peticion);
    expect(acs['checkChannelType']).toBe('ISAPI');
    expect(acs['offlineDevCheckOpenDoorEnabled']).toBe(false);
    expect(acs['remoteCheckTimeout']).toBe(5);

    expect(await pasaAlguien(peticion, flujo, 11)).toBe('abrio');
  });

  it('la apertura sin plataforma y el plazo salen de la configuración, no del código', async () => {
    const peticion = equipoSimulado({
      familia: 'terminal',
      ...CREDENCIAL,
      verificacionRemota: false,
    });
    const r = await aplicarCorreccion({
      ...conexion(peticion),
      clase: 'verificacion_remota',
      confirmadaPor: 'operador-1',
      abrirSinPlataforma: true,
      plazoDeVerificacionS: 8,
    });
    expect(r.aplicada).toBe(true);
    const acs = await leerAcs(peticion);
    expect(acs).toMatchObject({
      remoteCheckDoorEnabled: true,
      checkChannelType: 'ISAPI',
      offlineDevCheckOpenDoorEnabled: true,
      remoteCheckTimeout: 8,
    });
  });
});
