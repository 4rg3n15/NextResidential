import { describe, expect, it } from 'vitest';
import {
  CAMPOS_IGNORADOS_A_PROPOSITO,
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
  <alarmDataType>0</alarmDataType>
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

  describe('`alarmDataType` · el volcado histórico, también por este canal', () => {
    /**
     * Lo que este bloque sustituye decía «lo que empuja la cámara SIEMPRE es
     * presente», y razonaba que la cámara sólo POSTea cuando pasa algo. La
     * documentación del fabricante lo desmiente: el equipo reenvía su
     * historial por este mismo canal marcándolo con `alarmDataType: 1`, y sin
     * filtrarlo la portería mostraría accesos de hace días como si estuvieran
     * ocurriendo, en una tabla que no se puede limpiar.
     */
    it('`0` es tiempo real', () => {
      expect(desdeAlarmServerXml(xmlAnpr(), DISPOSITIVO, AHORA)?.enVivo).toBe(true);
    });

    it('`1` es HISTÓRICO y no se trata como presente', () => {
      const historico = xmlAnpr().replace('<alarmDataType>0<', '<alarmDataType>1<');
      expect(desdeAlarmServerXml(historico, DISPOSITIVO, AHORA)?.enVivo).toBe(false);
    });

    it('SIN el campo se trata como histórico, que es la dirección segura', () => {
      // Cuesta lo que cuesta y hay que saberlo: con un firmware que no lo
      // emita, la cámara parece muda y la talanquera no abre. Eso se descubre
      // en la primera prueba; eventos falsos en un histórico append-only, no.
      const sinCampo = xmlAnpr().replace('<alarmDataType>0</alarmDataType>', '');
      expect(desdeAlarmServerXml(sinCampo, DISPOSITIVO, AHORA)?.enVivo).toBe(false);
    });
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

  it('`noPlate` NO es una placa: es la ausencia de lectura', () => {
    // Tratarlo como tal produciría un vehículo llamado «noPlate» en el padrón
    // y un evento que afirma una lectura que no existió.
    const sinLectura = xmlAnpr().replace('<licensePlate>ABC123<', '<licensePlate>noPlate<');
    expect(desdeAlarmServerXml(sinLectura, DISPOSITIVO, AHORA)?.placa).toBeNull();
  });

  describe('`openGateType` · la declaración del equipo sobre QUIÉN abrió', () => {
    /**
     * Es evidencia de auditoría, no un adorno. Sólo existe cuando el control de
     * barrera del equipo está habilitado, y entonces dice si abrió él o
     * nosotros. `white` y `abnormal` significan que la cámara está decidiendo.
     */
    const con = (valor: string) =>
      desdeAlarmServerXml(xmlAnpr(`<openGateType>${valor}</openGateType>`), DISPOSITIVO, AHORA);

    it('`white` es la lista interna de la CÁMARA', () => {
      expect(con('white')?.quienAbrio).toBe('lista');
    });

    it('`manual` es la PLATAFORMA, que es lo único admisible', () => {
      expect(con('manual')?.quienAbrio).toBe('manual');
    });

    it('`abnormal` es una excepción de la cámara', () => {
      expect(con('abnormal')?.quienAbrio).toBe('anomalo');
    });

    it('un valor que el fabricante no documenta NO se traduce a «manual»', () => {
      // Eso afirmaría que abrimos nosotros sin saberlo, y es justo lo que la
      // auditoría no puede permitirse dar por hecho.
      expect(con('loQueSea')?.quienAbrio).toBe('anomalo');
    });

    it('sin el campo es `null`: el equipo NO tiene el control de barrera activo', () => {
      expect(desdeAlarmServerXml(xmlAnpr(), DISPOSITIVO, AHORA)?.quienAbrio).toBeNull();
    });
  });

  it('normaliza los campos que el motor y la auditoría necesitan', () => {
    const completo = xmlAnpr(
      '<plateType>civil</plateType><plateColor>yellow</plateColor>' +
        '<country>210</country><line>2</line><direction>forward</direction>' +
        '<vehicleType>smallCar</vehicleType><detectType>ANPR</detectType>' +
        '<plateStandardStatus>true</plateStandardStatus>' +
        '<X>10</X><Y>20</Y><width>120</width><height>40</height>',
    );
    const evento = desdeAlarmServerXml(completo, DISPOSITIVO, AHORA);
    expect(evento?.tipoDePlaca).toBe('civil');
    expect(evento?.colorDePlaca).toBe('yellow');
    // 210 es Colombia. Se guarda el código tal cual: traducirlo aquí sería
    // meter una tabla de países en un adaptador de transporte.
    expect(evento?.pais).toBe(210);
    expect(evento?.carril).toBe(2);
    expect(evento?.sentido).toBe('forward');
    expect(evento?.tipoDeVehiculo).toBe('smallCar');
    expect(evento?.tipoDeDeteccion).toBe('ANPR');
    expect(evento?.placaEstandar).toBe(true);
    expect(evento?.recuadro).toEqual({ x: 10, y: 20, ancho: 120, alto: 40 });
  });

  it('un recuadro INCOMPLETO es nulo, no un recuadro con ceros', () => {
    // Un recuadro a medias pintaría una caja en un sitio que no es.
    const parcial = xmlAnpr('<X>10</X><Y>20</Y>');
    expect(desdeAlarmServerXml(parcial, DISPOSITIVO, AHORA)?.recuadro).toBeNull();
  });

  it('los campos de fiscalización y conducta se ignoran A PROPÓSITO, y está escrito', () => {
    /**
     * No basta con no leerlos: la lista existe para que quien añada un campo
     * mañana vea que la omisión fue una decisión. Registrarlos sería tratar
     * datos que nadie pidió (Ley 1581 art. 4, principio de finalidad).
     */
    expect(CAMPOS_IGNORADOS_A_PROPOSITO).toContain('illegalInfo');
    expect(CAMPOS_IGNORADOS_A_PROPOSITO).toContain('speedLimit');
    expect(CAMPOS_IGNORADOS_A_PROPOSITO).toContain('belt');
    expect(CAMPOS_IGNORADOS_A_PROPOSITO).toContain('frontChild');

    // Y ninguno aparece en el evento normalizado.
    const conBasura = xmlAnpr(
      '<illegalInfo>algo</illegalInfo><speedLimit>60</speedLimit><belt>true</belt>',
    );
    const evento = desdeAlarmServerXml(conBasura, DISPOSITIVO, AHORA);
    const texto = JSON.stringify(evento);
    for (const campo of CAMPOS_IGNORADOS_A_PROPOSITO) {
      expect(texto, campo).not.toContain(campo);
    }
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
