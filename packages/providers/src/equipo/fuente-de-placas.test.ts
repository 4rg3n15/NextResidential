import { describe, expect, it } from 'vitest';
import type { LecturaDePlaca } from '@ncr/domain-core';
import { FuenteDePlacas, lecturaDe } from './fuente-de-placas';
import type { IngestorDePublicaciones, PublicacionDeEquipo } from './fuente-de-placas';
import { desdeAlarmServerXml } from '../hikvision/contratos-de-evento';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL PUERTO QUE ESTABA DECLARADO Y NADIE IMPLEMENTABA
 *
 * Lo que se fija aquí es lo que hacía falta para que dejara de ser un adorno:
 * que los dos transportes converjan, que haya **un solo** ingestor, y que lo
 * histórico no llegue a nadie.
 */

const AHORA = new Date('2026-09-23T12:00:00.000Z');
const DISPOSITIVO = 'disp-camara';

const xml = (extra = ''): string =>
  '<?xml version="1.0" encoding="UTF-8"?><EventNotificationAlert version="2.0">' +
  '<eventType>ANPR</eventType><licensePlate>ABC123</licensePlate>' +
  `<confidenceLevel>92</confidenceLevel><alarmDataType>0</alarmDataType>${extra}` +
  '</EventNotificationAlert>';

const publicacionDe = (
  cuerpo: string,
  transporte: 'escucha' | 'armado' = 'escucha',
): PublicacionDeEquipo => {
  const evento = desdeAlarmServerXml(cuerpo, DISPOSITIVO, AHORA);
  if (evento === null) throw new Error('el XML de prueba no se pudo normalizar');
  return { evento, foto: null, recorte: null, transporte };
};

const ingestorQueCuenta = (): IngestorDePublicaciones & { veces: number } => {
  const espia = {
    veces: 0,
    ingerir: async (): Promise<{ registrado: boolean; motivo: null }> => {
      espia.veces += 1;
      return { registrado: true, motivo: null };
    },
  };
  return espia;
};

describe('los dos transportes convergen en el mismo puerto', () => {
  it('lo que entra por ESCUCHA llega al suscriptor', async () => {
    const fuente = new FuenteDePlacas();
    const recibidas: LecturaDePlaca[] = [];
    await fuente.suscribir(async (l) => {
      recibidas.push(l);
    });
    await fuente.publicar(publicacionDe(xml(), 'escucha'));
    expect(recibidas[0]?.placa).toBe('ABC123');
  });

  it('y lo que entra por ARMADO, también, sin distinguirse en la salida', async () => {
    const fuente = new FuenteDePlacas();
    const recibidas: LecturaDePlaca[] = [];
    await fuente.suscribir(async (l) => {
      recibidas.push(l);
    });
    await fuente.publicar(publicacionDe(xml(), 'armado'));
    expect(recibidas[0]?.placa).toBe('ABC123');
  });
});

describe('UN SOLO ingestor, y la fuente se niega al segundo', () => {
  it('el ingestor recibe la publicación completa, con sus imágenes', async () => {
    const recibidas: PublicacionDeEquipo[] = [];
    const fuente = new FuenteDePlacas({
      ingerir: async (p) => {
        recibidas.push(p);
        return { registrado: true, motivo: null };
      },
    });
    await fuente.publicar(publicacionDe(xml()));
    expect(recibidas[0]?.evento.placa).toBe('ABC123');
    expect(recibidas[0]?.transporte).toBe('escucha');
  });

  it('un segundo ingestor se RECHAZA: dos escribirían dos eventos por lectura', async () => {
    // En una tabla que no admite borrado, y el defecto sólo se vería contando
    // los accesos del día.
    const fuente = new FuenteDePlacas(ingestorQueCuenta());
    expect(() => {
      fuente.fijarIngestor(ingestorQueCuenta());
    }).toThrow(/ya tiene ingestor/i);
  });

  it('sin ingestor fijado, se puede fijar uno', async () => {
    const fuente = new FuenteDePlacas();
    const espia = ingestorQueCuenta();
    fuente.fijarIngestor(espia);
    await fuente.publicar(publicacionDe(xml()));
    expect(espia.veces).toBe(1);
  });
});

describe('lo HISTÓRICO no llega a nadie', () => {
  it('ni al ingestor ni a los suscriptores', async () => {
    // Sin este corte, la portería mostraría accesos de hace días como si
    // ocurrieran ahora, en una tabla que no se puede limpiar.
    const espia = ingestorQueCuenta();
    const fuente = new FuenteDePlacas(espia);
    let avisos = 0;
    await fuente.suscribir(async () => {
      avisos += 1;
    });

    const historico = xml().replace('<alarmDataType>0<', '<alarmDataType>1<');
    const resultado = await fuente.publicar(publicacionDe(historico));

    expect(resultado.desenlace).toBe('historica');
    expect(espia.veces).toBe(0);
    expect(avisos).toBe(0);
  });

  it('una publicación SIN placa tampoco se ingiere', async () => {
    const espia = ingestorQueCuenta();
    const fuente = new FuenteDePlacas(espia);
    const sinPlaca = xml().replace('<licensePlate>ABC123</licensePlate>', '');
    expect((await fuente.publicar(publicacionDe(sinPlaca))).desenlace).toBe('sin_placa');
    expect(espia.veces).toBe(0);
  });
});

describe('cuando la ingesta falla', () => {
  it('el desenlace lo dice, y no se disfraza de «sin placa»', async () => {
    // Confundirlos escondería un fallo de la base detrás de un sobre malo.
    const fuente = new FuenteDePlacas({
      ingerir: async () => ({ registrado: false, motivo: 'la base rechazó el hecho' }),
    });
    const resultado = await fuente.publicar(publicacionDe(xml()));
    expect(resultado.desenlace).toBe('no_registrada');
    expect(resultado.motivo).toBe('la base rechazó el hecho');
  });

  it('y los observadores se avisan IGUAL: la placa se leyó', async () => {
    const fuente = new FuenteDePlacas({
      ingerir: async () => ({ registrado: false, motivo: 'la base rechazó el hecho' }),
    });
    let avisos = 0;
    await fuente.suscribir(async () => {
      avisos += 1;
    });
    await fuente.publicar(publicacionDe(xml()));
    expect(avisos).toBe(1);
  });
});

describe('la lectura que sale del evento', () => {
  it('sin confianza declarada entrega 0 y NO 1', () => {
    // Suponer certeza donde el equipo no la afirma es decidir por él, y el
    // umbral de lectura dudosa dejaría de poder actuar (CU-01, excepción 3a).
    const sinConfianza = xml().replace('<confidenceLevel>92</confidenceLevel>', '');
    const evento = desdeAlarmServerXml(sinConfianza, DISPOSITIVO, AHORA);
    expect(lecturaDe(evento!)?.confianza).toBe(0);
  });

  it('un evento que no es de placa no produce lectura', () => {
    const otro = desdeAlarmServerXml(
      '<EventNotificationAlert><eventType>tamperDetection</eventType></EventNotificationAlert>',
      DISPOSITIVO,
      AHORA,
    );
    expect(lecturaDe(otro!)).toBeNull();
  });
});

/**
 * A2 (ETAPA 15-E) · un rostro no es una placa: va al ingestor, que sabe qué
 * hacer, y no a los observadores del puerto del dominio, cuya forma es una
 * lectura de placa. El puerto queda intacto.
 */
describe('A2 · rostro y llamada van al ingestor, no a los suscriptores del puerto', () => {
  const rostro = (): PublicacionDeEquipo => ({
    evento: {
      ...publicacionDe(xml()).evento,
      clase: 'rostro',
      placa: null,
      confianza: null,
      personaId: 'plantilla-1',
      esperaVeredicto: true,
      serieDelEquipo: 3,
    },
    foto: null,
    recorte: null,
    transporte: 'escucha',
  });

  it('el ingestor lo recibe y el desenlace es `ingerida`', async () => {
    const ingestor = ingestorQueCuenta();
    const fuente = new FuenteDePlacas(ingestor);
    let observadas = 0;
    await fuente.suscribir(async () => {
      observadas += 1;
    });
    const r = await fuente.publicar(rostro());
    expect(r.desenlace).toBe('ingerida');
    expect(ingestor.veces).toBe(1);
    expect(observadas).toBe(0);
  });

  it('si el ingestor no lo registra, el desenlace lo dice', async () => {
    const fuente = new FuenteDePlacas({
      ingerir: async () => ({ registrado: false, motivo: 'sin copropiedad' }),
    });
    const r = await fuente.publicar(rostro());
    expect(r.desenlace).toBe('no_registrada');
    expect(r.motivo).toBe('sin copropiedad');
  });
});
