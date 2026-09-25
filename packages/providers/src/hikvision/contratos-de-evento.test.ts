import { describe, expect, it } from 'vitest';
import {
  CAMPOS_IGNORADOS_A_PROPOSITO,
  desdeAlarmServerJson,
  desdeAlarmServerXml,
  desdeAlertStreamJson,
  esEventoEnVivo,
  esJsonDeAlarmServer,
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

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * ESTA PRUEBA AFIRMABA LO CONTRARIO, Y AFIRMABA MAL · [CORREGIR · 15-C]
   *
   * Decía que `0.92` y `92` tenían que producir lo mismo, y con esa heurística
   * el campo documentado quedaba roto en su valor más peligroso: el esquema
   * declara `confidenceLevel` en `[0,100]`, así que **1 significa uno por
   * ciento** — y la heurística lo dejaba pasar tal cual, es decir, como certeza
   * total. La lectura más dudosa que el equipo puede emitir entraba como la más
   * segura y abría la barrera.
   *
   * Ahora el campo documentado se divide entre 100 SIEMPRE, y se prueba en los
   * cuatro puntos que importan: 0, 1, 50 y 100.
   */
  it.each([
    ['0', 0],
    ['1', 0.01],
    ['50', 0.5],
    ['100', 1],
  ])('la confianza documentada %s es un porcentaje entero y vale %s', (crudo, esperado) => {
    const xml = xmlAnpr().replace('<confidenceLevel>92<', `<confidenceLevel>${crudo}<`);
    expect(desdeAlarmServerXml(xml, DISPOSITIVO, AHORA)?.confianza).toBeCloseTo(esperado);
  });

  it('EL CASO QUE ESTO EVITA · una confianza de 1 es 1 %, no certeza total', () => {
    const xml = xmlAnpr().replace('<confidenceLevel>92<', '<confidenceLevel>1<');
    const confianza = desdeAlarmServerXml(xml, DISPOSITIVO, AHORA)?.confianza;
    expect(confianza).toBeLessThan(0.5);
  });

  it('el alias NO documentado conserva la heurística: ahí no se sabe la escala', () => {
    // `confidence` no está en el esquema. Suponerle una escala sin base sería
    // repetir el error con otro campo, así que se sigue admitiendo las dos.
    const xml = xmlAnpr().replace(
      '<confidenceLevel>92</confidenceLevel>',
      '<confidence>0.92</confidence>',
    );
    expect(desdeAlarmServerXml(xml, DISPOSITIVO, AHORA)?.confianza).toBeCloseTo(0.92);
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

  it('por el alertStream la confianza es el MISMO campo y la misma escala', () => {
    // Antes esta prueba afirmaba que por aquí llegaba en fracción. Es el mismo
    // campo documentado del mismo esquema: una sola interpretación, o la misma
    // cifra significaría dos cosas según por dónde entrara el evento.
    const bloque = {
      eventType: 'ANPR',
      currentEvent: true,
      ANPR: { licensePlate: 'ABC123', confidenceLevel: 77 },
    };
    expect(desdeAlertStreamJson(bloque, DISPOSITIVO, AHORA).confianza).toBeCloseTo(0.77);
  });

  it('y una hora SIN desplazamiento no se interpreta: se usa la de recepción', () => {
    // Interpretarla en la zona del proceso corre el evento las horas que
    // separen al servidor del conjunto, en silencio y sin posible corrección.
    const bloque = {
      eventType: 'ANPR',
      currentEvent: true,
      dateTime: '2026-09-18T06:59:30',
      ANPR: { licensePlate: 'ABC123', confidenceLevel: 90 },
    };
    const evento = desdeAlertStreamJson(bloque, DISPOSITIVO, AHORA);
    expect(evento.ocurridoEn).toEqual(AHORA);
    expect(evento.horaSinDesplazamiento).toBe(true);
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 6.5 y 6.7a · LAS CLASES NUEVAS Y EL EVENTO EN JSON (ETAPA 15-D)
 *
 * Las claves de `AccessControllerEvent` y `CallInfo` son [SUPUESTO] S-36 hasta
 * capturarlas del equipo; lo que se fija aquí es que el sistema las traduce a
 * su clase neutral y a los dos campos que O4 necesita: quién y si espera.
 */
describe('las clases `rostro` y `llamada` · 6.5', () => {
  const AHORA2 = new Date('2026-09-24T12:00:00.000Z');

  it('un evento de control de acceso con `remoteCheck` es un ROSTRO que ESPERA veredicto', () => {
    const evento = desdeAlertStreamJson(
      {
        eventType: 'AccessControllerEvent',
        currentEvent: true,
        dateTime: '2026-09-24T07:00:00-05:00',
        AccessControllerEvent: { employeeNoString: 'plantilla-77', remoteCheck: true },
      },
      'disp-terminal',
      AHORA2,
    );
    expect(evento.clase).toBe('rostro');
    expect(evento.personaId).toBe('plantilla-77');
    expect(evento.esperaVeredicto).toBe(true);
    expect(evento.placa).toBeNull();
  });

  it('A2 · el evento trae la SERIE con la que la terminal identifica su petición', () => {
    const evento = desdeAlertStreamJson(
      {
        currentEvent: true,
        AccessControllerEvent: { employeeNoString: 'p-1', remoteCheck: true, serialNo: 4711 },
      },
      'disp-terminal',
      AHORA2,
    );
    expect(evento.serieDelEquipo).toBe(4711);
    expect(evento.esResultadoDeVerificacion).toBe(false);
  });

  it('A2 · un remoteCheckResult es un RESULTADO informativo: no espera veredicto', () => {
    // Firmwares de 2024 en adelante avisan del desenlace de una verificación
    // ya contestada. Tratarlo como petición produciría dos eventos por un hecho.
    const evento = desdeAlertStreamJson(
      {
        currentEvent: true,
        eventType: 'AccessControllerEvent',
        AccessControllerEvent: {
          employeeNoString: 'p-1',
          remoteCheck: true,
          remoteCheckResult: 'success',
          serialNo: 4711,
        },
      },
      'disp-terminal',
      AHORA2,
    );
    expect(evento.clase).toBe('rostro');
    expect(evento.esResultadoDeVerificacion).toBe(true);
    expect(evento.esperaVeredicto).toBe(false);
  });

  it('sin `remoteCheck` la terminal decidió sola: rostro que NO espera', () => {
    const evento = desdeAlertStreamJson(
      { currentEvent: true, AccessControllerEvent: { employeeNo: 12 } },
      'disp-terminal',
      AHORA2,
    );
    expect(evento.clase).toBe('rostro');
    expect(evento.personaId).toBe('12');
    expect(evento.esperaVeredicto).toBe(false);
  });

  it('una llamada del videoportero trae su ORIGEN, con lo que el equipo declare', () => {
    const evento = desdeAlertStreamJson(
      {
        eventType: 'videoIntercomEvent',
        currentEvent: true,
        CallInfo: { periodNumber: 1, buildingNumber: 2, unitNumber: 3 },
      },
      'disp-portero',
      AHORA2,
    );
    expect(evento.clase).toBe('llamada');
    expect(evento.origenDeLlamada).toBe('periodo 1 · edificio 2 · unidad 3');
    expect(evento.personaId).toBeNull();
  });

  it('y por la forma `voiceTalkEvent.src` también', () => {
    const evento = desdeAlertStreamJson(
      { currentEvent: true, voiceTalkEvent: { src: { buildingNumber: 5 } } },
      'disp-portero',
      AHORA2,
    );
    expect(evento.clase).toBe('llamada');
    expect(evento.origenDeLlamada).toBe('edificio 5');
  });

  it('un timbre sigue siendo timbre, y una llamada sin origen no inventa uno', () => {
    expect(
      desdeAlertStreamJson({ eventType: 'doorbell', currentEvent: true }, 'd', AHORA2).clase,
    ).toBe('timbre');
    const sinOrigen = desdeAlertStreamJson(
      { eventType: 'callSignal', currentEvent: true, CallInfo: {} },
      'd',
      AHORA2,
    );
    expect(sinOrigen.clase).toBe('llamada');
    expect(sinOrigen.origenDeLlamada).toBeNull();
  });
});

describe('el evento ANPR en JSON · 6.7a · DOCUMENTADO, NO VERIFICADO', () => {
  const AHORA2 = new Date('2026-09-24T12:00:00.000Z');

  it('produce EXACTAMENTE la misma lectura que el XML', () => {
    const json = JSON.stringify({
      eventType: 'ANPR',
      dateTime: '2026-09-24T07:00:00-05:00',
      alarmDataType: 0,
      eventId: 'ev-json-1',
      ANPR: { licensePlate: 'ABC123', confidenceLevel: 92 },
    });
    const evento = desdeAlarmServerJson(json, 'disp-camara', AHORA2);
    expect(evento?.clase).toBe('placa');
    expect(evento?.placa).toBe('ABC123');
    expect(evento?.confianza).toBe(0.92);
    expect(evento?.enVivo).toBe(true);
    expect(evento?.referenciaDelEquipo).toBe('ev-json-1');
    expect(evento?.ocurridoEn.toISOString()).toBe('2026-09-24T12:00:00.000Z');
  });

  it('acepta `alarmDataType` dentro de `ANPR` y el bloque envuelto', () => {
    const json = JSON.stringify({
      EventNotificationAlert: {
        eventType: 'ANPR',
        ANPR: { licensePlate: 'XYZ789', confidenceLevel: 80, alarmDataType: 0 },
      },
    });
    expect(desdeAlarmServerJson(json, 'd', AHORA2)?.enVivo).toBe(true);
  });

  it('sin `alarmDataType` es HISTÓRICO, igual que en XML: la dirección segura', () => {
    const json = JSON.stringify({ eventType: 'ANPR', ANPR: { licensePlate: 'ABC123' } });
    expect(desdeAlarmServerJson(json, 'd', AHORA2)?.enVivo).toBe(false);
  });

  it('lo que no es JSON, o no es un objeto, es `null`', () => {
    expect(desdeAlarmServerJson('<xml/>', 'd', AHORA2)).toBeNull();
    expect(desdeAlarmServerJson('42', 'd', AHORA2)).toBeNull();
    expect(esJsonDeAlarmServer('{"eventType":"ANPR"}')).toBe(true);
    expect(esJsonDeAlarmServer('<EventNotificationAlert/>')).toBe(false);
  });
});
