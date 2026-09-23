import { describe, expect, it } from 'vitest';
import { leerVeredictoDeControl } from './veredicto-de-control';
import { leerCtrlMod } from './modo-de-control';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LOS DOCUMENTOS SON LOS DE LA GUÍA, LITERALES
 *
 * Con el espacio de nombres, el orden de elementos y las listas completas. Un
 * documento escrito «como al analizador le conviene» probaría que dos ficheros
 * nuestros se entienden entre sí, que es exactamente lo que no hace falta
 * demostrar.
 */
const ESPACIO = 'http://www.isapi.org/ver20/XMLSchema';

const entranceParam = (opciones: {
  modo?: string;
  etiquetaDeModo?: string;
  operacionDeListaBlanca?: string;
  seguirAlCoche?: boolean;
  vehiculoGrande?: boolean;
  releDeApertura?: string;
}): string => {
  const etiqueta = opciones.etiquetaDeModo ?? 'ctrlMode';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<EntranceParamList version="2.0" xmlns="${ESPACIO}">`,
    '<EntranceParam>',
    '<laneNum>1</laneNum>',
    '<bEnable>true</bEnable>',
    `<${etiqueta}>${opciones.modo ?? '1'}</${etiqueta}>`,
    '<vehInfoManagList>',
    '<vehInfoManag><vehInfoManagNum>0</vehInfoManagNum>',
    '<barrierGateOper>off</barrierGateOper>',
    '<upAlarmEnable>true</upAlarmEnable></vehInfoManag>',
    '<vehInfoManag><vehInfoManagNum>1</vehInfoManagNum>',
    '<barrierGateOper>off</barrierGateOper>',
    '<upAlarmEnable>true</upAlarmEnable></vehInfoManag>',
    '<vehInfoManag><vehInfoManagNum>2</vehInfoManagNum>',
    `<barrierGateOper>${opciones.operacionDeListaBlanca ?? 'off'}</barrierGateOper>`,
    '<upAlarmEnable>true</upAlarmEnable></vehInfoManag>',
    '</vehInfoManagList>',
    '<relayList><relay><relayNum>1</relayNum>',
    `<relayFunction>${opciones.releDeApertura ?? '1'}</relayFunction>`,
    '</relay></relayList>',
    `<notCloseCarFollow>${opciones.seguirAlCoche === true ? 'true' : 'false'}</notCloseCarFollow>`,
    `<bigCarKeepOpen><enabled>${opciones.vehiculoGrande === true ? 'true' : 'false'}</enabled>`,
    '<duration>1</duration></bigCarKeepOpen>',
    '<ParkingDetection><enabled>false</enabled><judgeTime>1</judgeTime></ParkingDetection>',
    '</EntranceParam>',
    '</EntranceParamList>',
  ].join('');
};

describe('[CORREGIR] la etiqueta del modo se llama `ctrlMode`, con «e»', () => {
  /**
   * El lector buscaba sólo `ctrlMod`. Contra el esquema real no casaba nunca,
   * devolvía `null`, y el equipo se rechazaba por «no declaró quién controla la
   * barrera»: una cámara BIEN configurada, rechazada, con el mensaje mandando a
   * revisar justo lo que estaba bien.
   */
  it('lee la grafía del esquema XML', () => {
    expect(leerCtrlMod(entranceParam({ modo: '1' }))).toBe('1');
  });

  it('y sigue leyendo la de la ruta JSON, que el mismo documento usa', () => {
    expect(leerCtrlMod(entranceParam({ modo: '1', etiquetaDeModo: 'ctrlMod' }))).toBe('1');
  });

  it('con un cuerpo de cada forma, el veredicto es el mismo', () => {
    const conE = leerVeredictoDeControl(entranceParam({ modo: '0' }));
    const sinE = leerVeredictoDeControl(entranceParam({ modo: '0', etiquetaDeModo: 'ctrlMod' }));
    expect(conE.admisible).toBe(sinE.admisible);
    expect(conE.modo.modo).toBe(sinE.modo.modo);
  });
});

describe('el veredicto COMPLETO, no sólo el modo de control', () => {
  it('un equipo conforme no tiene bloqueos', () => {
    const veredicto = leerVeredictoDeControl(entranceParam({}));
    expect(veredicto.admisible).toBe(true);
    expect(veredicto.bloqueos).toHaveLength(0);
  });

  it('LA SEGUNDA VÍA · la lista blanca del equipo abre sola y eso BLOQUEA', () => {
    // El modo de control está bien. Lo que decide es la política interna: el
    // equipo lleva su propio motor de reglas y abre para su lista blanca, sin
    // vigencia, sin patrón, sin zona y sin lista negra nuestras.
    const veredicto = leerVeredictoDeControl(entranceParam({ operacionDeListaBlanca: 'on' }));
    expect(veredicto.admisible).toBe(false);
    expect(veredicto.bloqueos[0]?.detalle).toMatch(/lista blanca/i);
  });

  it('una operación de barrera que el catálogo no conoce tampoco se da por buena', () => {
    // No se puede afirmar que no abra, y la dirección segura de este proyecto
    // es la misma en todas partes.
    const veredicto = leerVeredictoDeControl(entranceParam({ operacionDeListaBlanca: 'loQueSea' }));
    expect(veredicto.admisible).toBe(false);
  });

  it('las políticas que NO abren no producen ningún hallazgo', () => {
    const veredicto = leerVeredictoDeControl(entranceParam({ operacionDeListaBlanca: 'stop' }));
    expect(veredicto.admisible).toBe(true);
  });

  it('clasifica cada política por su número: temporal, negra y blanca', () => {
    const veredicto = leerVeredictoDeControl(entranceParam({}));
    expect(veredicto.reglasInternas.map((r) => r.clase)).toEqual([
      'temporal',
      'lista_negra',
      'lista_blanca',
    ]);
  });

  it('lee CUÁL es el relé que abre, en vez de suponerlo', () => {
    // Accionar el relé equivocado enciende otra cosa mientras el brazo sigue
    // abajo, y el sistema informa de que abrió.
    expect(leerVeredictoDeControl(entranceParam({})).releQueAbre).toBe(1);
  });

  it('y si ningún relé declara abrir la barrera, lo AVISA', () => {
    const veredicto = leerVeredictoDeControl(entranceParam({ releDeApertura: '5' }));
    expect(veredicto.releQueAbre).toBeNull();
    expect(veredicto.avisos.some((a) => /relé/i.test(a.campo))).toBe(true);
  });
});

describe('lo que AVISA sin bloquear · abre sin decisión nuestra y sin evento', () => {
  it('no cerrar con vehículos pegados es un aviso, no un bloqueo', () => {
    const veredicto = leerVeredictoDeControl(entranceParam({ seguirAlCoche: true }));
    expect(veredicto.admisible).toBe(true);
    expect(veredicto.avisos.some((a) => /pegados/i.test(a.campo))).toBe(true);
  });

  it('mantener abierto para vehículos grandes, igual', () => {
    const veredicto = leerVeredictoDeControl(entranceParam({ vehiculoGrande: true }));
    expect(veredicto.admisible).toBe(true);
    expect(veredicto.avisos.some((a) => /grandes/i.test(a.campo))).toBe(true);
  });

  it('y el aviso dice POR QUÉ importa: pasan vehículos sin quedar en el histórico', () => {
    const veredicto = leerVeredictoDeControl(entranceParam({ seguirAlCoche: true }));
    expect(veredicto.avisos[0]?.detalle).toMatch(/sin un evento por cada uno|sin evento/i);
  });
});

describe('no poder leerlo NO es que esté bien', () => {
  it('una respuesta vacía no es admisible', () => {
    const veredicto = leerVeredictoDeControl('');
    expect(veredicto.admisible).toBe(false);
    expect(veredicto.leido).toBe(false);
  });

  it('y un error del equipo tampoco', () => {
    const veredicto = leerVeredictoDeControl(
      '<ResponseStatus><statusCode>4</statusCode></ResponseStatus>',
    );
    expect(veredicto.admisible).toBe(false);
  });
});

describe('una política que el documento trae A MEDIAS', () => {
  /**
   * Un firmware puede emitir un bloque de política sin número y sin operación.
   * Ninguna de las dos ausencias se da por inocua: no poder afirmar que esa
   * política no abre el brazo es, aquí, lo mismo que saber que lo abre.
   */
  const documentoConPoliticaIncompleta = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<EntranceParamList version="2.0" xmlns="${ESPACIO}">`,
    '<EntranceParam>',
    '<laneNum>1</laneNum>',
    '<ctrlMode>1</ctrlMode>',
    '<vehInfoManagList>',
    '<vehInfoManag><barrierGateOper>abrirElBrazoSiempre</barrierGateOper></vehInfoManag>',
    '</vehInfoManagList>',
    '<relayList><relay><relayNum>1</relayNum><relayOper>open</relayOper></relay></relayList>',
    '</EntranceParam></EntranceParamList>',
  ].join('');

  it('sin número, la política se nombra igual y NO desaparece del veredicto', () => {
    const veredicto = leerVeredictoDeControl(documentoConPoliticaIncompleta);
    expect(veredicto.bloqueos.some((b) => /política interna \?/.test(b.campo))).toBe(true);
  });

  it('y una operación que el catálogo no conoce BLOQUEA, no se da por inocua', () => {
    const veredicto = leerVeredictoDeControl(documentoConPoliticaIncompleta);
    expect(veredicto.admisible).toBe(false);
    expect(veredicto.bloqueos.some((b) => /no conoce|catalóguela/i.test(b.detalle))).toBe(true);
  });

  it('una política SIN operación ninguna tampoco se aprueba en silencio', () => {
    const sinOperacion = documentoConPoliticaIncompleta.replace(
      '<barrierGateOper>abrirElBrazoSiempre</barrierGateOper>',
      '<upAlarmEnable>true</upAlarmEnable>',
    );
    const veredicto = leerVeredictoDeControl(sinOperacion);
    expect(veredicto.reglasInternas[0]?.operacionDeBarrera).toBeNull();
    expect(veredicto.reglasInternas[0]?.clase).toBe('desconocida');
  });
});
