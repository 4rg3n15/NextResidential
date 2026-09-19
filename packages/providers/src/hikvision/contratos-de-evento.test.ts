import { describe, expect, it } from 'vitest';
import {
  desdeAlarmServerXml,
  desdeAlertStreamJson,
  esEventoEnVivo,
  esXmlDeAlarmServer,
  soloEnVivo,
} from './contratos-de-evento';

const AHORA = new Date('2026-09-18T12:00:00.000Z');
const DISPOSITIVO = 'disp-1';

/** Ejemplo con la FORMA del XML del Alarm Server. Valores inventados. */
const xmlAnpr = (extra = '') => `<?xml version="1.0" encoding="UTF-8"?>
<EventNotificationAlert version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <ipAddress>0.0.0.0</ipAddress>
  <channelID>1</channelID>
  <dateTime>2026-09-18T06:59:30-05:00</dateTime>
  <eventType>ANPR</eventType>
  <eventState>active</eventState>
  <eventDescription>ANPR</eventDescription>
  <licensePlate>ABC123</licensePlate>
  <confidenceLevel>92</confidenceLevel>
  ${extra}
</EventNotificationAlert>`;

describe('cámara ANPR · XML que el equipo POSTea al Alarm Server', () => {
  it('reconoce el cuerpo y extrae placa, confianza y momento', () => {
    const evento = desdeAlarmServerXml(xmlAnpr(), DISPOSITIVO, AHORA);
    expect(evento).not.toBeNull();
    expect(evento?.clase).toBe('placa');
    expect(evento?.placa).toBe('ABC123');
    expect(evento?.confianza).toBeCloseTo(0.92);
    expect(evento?.ocurridoEn.toISOString()).toBe('2026-09-18T11:59:30.000Z');
  });

  it('lo que empuja la cámara SIEMPRE es presente', () => {
    // La diferencia con el videoportero, y por eso son dos adaptadores: la
    // cámara solo POSTea cuando pasa algo.
    expect(desdeAlarmServerXml(xmlAnpr(), DISPOSITIVO, AHORA)?.enVivo).toBe(true);
  });

  it('normaliza la confianza venga en porcentaje o en fracción', () => {
    // Un umbral que solo funciona con la mitad de los firmware es un umbral que
    // no funciona. `0.92` y `92` tienen que producir lo mismo.
    const xmlFraccion = xmlAnpr().replace('<confidenceLevel>92<', '<confidenceLevel>0.92<');
    expect(desdeAlarmServerXml(xmlFraccion, DISPOSITIVO, AHORA)?.confianza).toBeCloseTo(0.92);
  });

  it('con una fecha ilegible usa la hora de recepción en vez de perder el evento', () => {
    const xmlMalo = xmlAnpr().replace('2026-09-18T06:59:30-05:00', 'ayer por la tarde');
    const evento = desdeAlarmServerXml(xmlMalo, DISPOSITIVO, AHORA);
    expect(evento?.ocurridoEn).toEqual(AHORA);
    expect(evento?.placa).toBe('ABC123');
  });

  it('un cuerpo que no es del Alarm Server se rechaza, no se adivina', () => {
    expect(esXmlDeAlarmServer('{"eventType":"ANPR"}')).toBe(false);
    expect(desdeAlarmServerXml('{"eventType":"ANPR"}', DISPOSITIVO, AHORA)).toBeNull();
  });

  it('un evento sin placa no se inventa una: queda nula', () => {
    const sinPlaca = xmlAnpr().replace('<licensePlate>ABC123</licensePlate>', '');
    expect(desdeAlarmServerXml(sinPlaca, DISPOSITIVO, AHORA)?.placa).toBeNull();
  });
});

describe('videoportero · JSON del alertStream que ABRE nuestro sistema', () => {
  it('el volcado histórico NO pasa por en vivo', () => {
    /**
     * El hallazgo que motiva todo esto: al conectar, el equipo suelta el
     * historial con `currentEvent: false`. Procesarlo sería avisar a residentes
     * de visitas de hace semanas y escribir eventos falsos en una tabla que no
     * admite borrado.
     */
    const historico = {
      eventType: 'doorbell',
      currentEvent: false,
      dateTime: '2026-09-01T10:00:00Z',
    };
    expect(esEventoEnVivo(historico)).toBe(false);
    expect(desdeAlertStreamJson(historico, DISPOSITIVO, AHORA).enVivo).toBe(false);
  });

  it('un bloque SIN el campo se trata como histórico (dirección segura)', () => {
    // Si un firmware omitiera `currentEvent`, el coste de callar un timbre es
    // menor que el de escribir eventos falsos e irreversibles.
    expect(esEventoEnVivo({ eventType: 'doorbell' })).toBe(false);
  });

  it('el evento en vivo sí pasa, y se clasifica como timbre', () => {
    const vivo = { eventType: 'doorbell', currentEvent: true, channelID: 1 };
    const evento = desdeAlertStreamJson(vivo, DISPOSITIVO, AHORA);
    expect(evento.enVivo).toBe(true);
    expect(evento.clase).toBe('timbre');
    expect(evento.referenciaDelEquipo).toBe('disp-1:1');
  });

  it('cuenta cuántos históricos descartó, que es lo que distingue mudo de inundado', () => {
    const volcado = [
      { eventType: 'doorbell', currentEvent: false },
      { eventType: 'doorbell', currentEvent: false },
      { eventType: 'doorbell', currentEvent: true },
    ];
    const { enVivo, descartados } = soloEnVivo(volcado);
    expect(enVivo).toHaveLength(1);
    expect(descartados).toBe(2);
  });

  it('si el bloque trae placa, es un evento de placa aunque venga por este canal', () => {
    const conPlaca = {
      eventType: 'ANPR',
      currentEvent: true,
      ANPR: { licensePlate: 'XYZ789', confidenceLevel: 88 },
    };
    const evento = desdeAlertStreamJson(conPlaca, DISPOSITIVO, AHORA);
    expect(evento.clase).toBe('placa');
    expect(evento.placa).toBe('XYZ789');
    expect(evento.confianza).toBeCloseTo(0.88);
  });
});

/**
 * Ramas que la medición señalaba sin cubrir (D-86). No son casos de laboratorio:
 * las tres salen de firmware que se comporta distinto entre modelos, que es lo
 * que obliga a normalizar en el adaptador y no en el dominio.
 */
describe('normalización · los bordes que distinguen un firmware de otro', () => {
  it('una etiqueta de confianza VACÍA deja la confianza nula, no cero', () => {
    // Cero sería una lectura pésima que el umbral rechazaría; nulo es «el
    // equipo no la informó». Confundirlos negaría accesos legítimos.
    const xml = xmlAnpr().replace('<confidenceLevel>92<', '<confidenceLevel><');
    expect(desdeAlarmServerXml(xml, DISPOSITIVO, AHORA)?.confianza).toBeNull();
  });

  it('un bloque en vivo que no es timbre ni placa se clasifica «desconocido»', () => {
    const otro = { eventType: 'tamperDetection', currentEvent: true };
    expect(desdeAlertStreamJson(otro, DISPOSITIVO, AHORA).clase).toBe('desconocido');
  });

  it('por el alertStream la confianza también llega en fracción en algunos equipos', () => {
    const conFraccion = {
      eventType: 'ANPR',
      currentEvent: true,
      ANPR: { licensePlate: 'ABC123', confidenceLevel: 0.77 },
    };
    expect(desdeAlertStreamJson(conFraccion, DISPOSITIVO, AHORA).confianza).toBeCloseTo(0.77);
  });
});
