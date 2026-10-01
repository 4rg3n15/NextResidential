import { describe, expect, it } from 'vitest';
import {
  PUERTAS_MAXIMAS,
  construirArbolDeSalidas,
  leerBanderas,
  leerOrdenes,
  leerPuertas,
  leerSubmodulos,
  leerUnidadesSeguras,
} from './arbol-de-salidas';
import type { DocumentosDeSalidas } from './arbol-de-salidas';
import { aplanarSalidas } from '../nucleo/salidas';

/**
 * 15-P · P5 · el árbol se LEE de lo que el equipo declara; ninguna capacidad
 * se supone por modelo. Los documentos son los de la familia del manual.
 */
const NADA: DocumentosDeSalidas = {
  capacidades: null,
  ordenRemota: null,
  unidadesSeguras: null,
  submodulos: null,
};
const CERRADURAS =
  '<AccessControl><isSupportOpenDoorParams>true</isSupportOpenDoorParams></AccessControl>';
const DOS_PUERTAS =
  '<RemoteControlDoorCap><doorNo min="1" max="2">1</doorNo><cmd opt="open,close"/></RemoteControlDoorCap>';

describe('lectores de documentos', () => {
  it('banderas en XML y en JSON; ausentes o «false» son false', () => {
    expect(leerBanderas(CERRADURAS).aperturaDeCerraduras).toBe(true);
    expect(leerBanderas('{"isSupportSubModules": true}').submodulos).toBe(true);
    expect(leerBanderas('<x><isSupportSubModules>false</isSupportSubModules></x>').submodulos).toBe(
      false,
    );
    expect(leerBanderas(null)).toEqual({
      aperturaDeCerraduras: false,
      unidadSegura: false,
      estadoDeUnidades: false,
      submodulos: false,
      ascensor: false,
    });
  });

  it('el intervalo de puertas se acota y un intervalo absurdo no se lee', () => {
    expect(leerPuertas(DOS_PUERTAS)).toEqual({ desde: 1, hasta: 2 });
    expect(leerPuertas('<doorNo max="999"/>')).toEqual({ desde: 1, hasta: PUERTAS_MAXIMAS });
    expect(leerPuertas('<doorNo min="3" max="1"/>')).toBeNull();
    expect(leerPuertas('<doorNo min="0" max="2"/>')).toBeNull();
    expect(leerPuertas('<doorNo/>')).toBeNull();
    expect(leerPuertas(null)).toBeNull();
  });

  it('las órdenes admitidas, sin espacios ni vacíos', () => {
    expect(leerOrdenes('<cmd opt=" open, close,,alwaysOpen "/>')).toEqual([
      'open',
      'close',
      'alwaysOpen',
    ]);
    expect(leerOrdenes(null)).toEqual([]);
  });

  it('unidades de puerta segura: en línea, fuera de línea, manipulada y sin estado', () => {
    const doc =
      '<ModuleStatus><securityModuleNo>1</securityModuleNo><onlineStatus>1</onlineStatus></ModuleStatus>' +
      '<ModuleStatus><securityModuleNo>2</securityModuleNo><onlineStatus>0</onlineStatus>' +
      '<desmantelStatus>1</desmantelStatus></ModuleStatus><ModuleStatus></ModuleStatus>';
    expect(leerUnidadesSeguras(doc)).toEqual([
      { numero: '1', enLinea: true, manipulada: false },
      { numero: '2', enLinea: false, manipulada: true },
      { numero: '?', enLinea: null, manipulada: false },
    ]);
  });

  it('submódulos: nombres por tipo, estado, anidado un nivel y JSON roto', () => {
    const plano = JSON.stringify({
      SubModules: [
        { id: 1, moduleType: 'DS-KD-KP', status: 'online' },
        { id: 2, moduleType: 'DS-KD-M', status: 'offline' },
        { id: '3', moduleType: 'otro', status: 'fault' },
        { moduleType: 'sin id' },
      ],
    });
    expect(leerSubmodulos(plano)).toEqual([
      { id: '1', nombre: 'Teclado', estado: 'en_linea' },
      { id: '2', nombre: 'Lector de tarjetas', estado: 'fuera_de_linea' },
      { id: '3', nombre: 'Submódulo', estado: 'averiada' },
    ]);
    const anidado = JSON.stringify({ SubModules: { lista: [{ id: 4, moduleType: 'DS-KD-KK' }] } });
    expect(leerSubmodulos(anidado)).toEqual([
      { id: '4', nombre: 'Placa de nombres', estado: null },
    ]);
    expect(leerSubmodulos('{no es json')).toEqual([]);
    expect(leerSubmodulos(null)).toEqual([]);
  });
});

describe('construirArbolDeSalidas', () => {
  it('videoportero de dos cerraduras: «Cerradura 1» y «Cerradura 2», sin periféricos', () => {
    const arbol = construirArbolDeSalidas(
      'KD',
      { ...NADA, capacidades: CERRADURAS, ordenRemota: DOS_PUERTAS },
      1,
    );
    expect(arbol.tipo).toBe('equipo');
    expect(aplanarSalidas(arbol).map((s) => [s.nombre, s.numeroDePuerta, s.ruta])).toEqual([
      ['Cerradura 1', 1, 'equipo/propio/puerta-1'],
      ['Cerradura 2', 2, 'equipo/propio/puerta-2'],
    ]);
    expect(arbol.hijos).toHaveLength(1);
  });

  it('sin la bandera de cerraduras, o con más de dos puertas, se llaman «Puerta N»', () => {
    const tres = '<x><doorNo min="1" max="3"/><cmd opt="open"/></x>';
    const nombres = (docs: DocumentosDeSalidas) =>
      aplanarSalidas(construirArbolDeSalidas('E', docs, null)).map((s) => s.nombre);
    expect(nombres({ ...NADA, ordenRemota: DOS_PUERTAS })).toEqual(['Puerta 1', 'Puerta 2']);
    expect(nombres({ ...NADA, capacidades: CERRADURAS, ordenRemota: tres })).toEqual([
      'Puerta 1',
      'Puerta 2',
      'Puerta 3',
    ]);
  });

  it('el equipo no dice cuántas puertas: se usa la de su ficha y se avisa', () => {
    const arbol = construirArbolDeSalidas('E', NADA, 1);
    expect(aplanarSalidas(arbol).map((s) => s.numeroDePuerta)).toEqual([1]);
    expect(arbol.hijos[0]?.nota).toMatch(/se usa la de su ficha/);
  });

  it('ni declara puertas ni hay ficha: ninguna salida, y lo dice', () => {
    const arbol = construirArbolDeSalidas('E', NADA, null);
    expect(aplanarSalidas(arbol)).toEqual([]);
    expect(arbol.hijos[0]?.nota).toMatch(/no declara puertas/);
  });

  it('declara puertas pero no la orden «open»: ninguna salida que abrir', () => {
    const arbol = construirArbolDeSalidas(
      'E',
      { ...NADA, ordenRemota: '<doorNo max="2"/><cmd opt="close"/>' },
      1,
    );
    expect(aplanarSalidas(arbol)).toEqual([]);
    expect(arbol.hijos[0]?.nota).toMatch(/no admite la orden de abrir/);
  });

  it('admite libre/bloqueada: se avisa como PENDIENTE DE DEFINICIÓN y sólo se abre', () => {
    const doc = '<doorNo max="1"/><cmd opt="open,close,alwaysOpen,alwaysClose"/>';
    const arbol = construirArbolDeSalidas('E', { ...NADA, ordenRemota: doc }, null);
    expect(arbol.hijos[0]?.nota).toMatch(/PENDIENTE DE DEFINICIÓN/);
    expect(aplanarSalidas(arbol)).toHaveLength(1);
  });

  it('unidad de puerta segura, submódulos y ascensor: módulos SIN salida propia', () => {
    const capacidades =
      '<x><isSupportDoorSecurityModulePairParams>true</isSupportDoorSecurityModulePairParams>' +
      '<isSupportSubModules>true</isSupportSubModules><isSupportElevatorControlCfg>true</isSupportElevatorControlCfg></x>';
    const arbol = construirArbolDeSalidas(
      'E',
      {
        capacidades,
        ordenRemota: DOS_PUERTAS,
        unidadesSeguras:
          '<ModuleStatus><securityModuleNo>1</securityModuleNo><onlineStatus>1</onlineStatus>' +
          '<desmantelStatus>1</desmantelStatus></ModuleStatus>',
        submodulos: JSON.stringify({
          SubModules: [{ id: 7, moduleType: 'DS-KD-KP', status: 'online' }],
        }),
      },
      null,
    );
    expect(arbol.hijos.map((h) => [h.clave, h.estado])).toEqual([
      ['propio', null],
      ['unidad-segura-1', 'manipulada'],
      ['submodulo-7', 'en_linea'],
      ['ascensor', null],
    ]);
    expect(arbol.hijos.find((h) => h.clave === 'ascensor')?.nota).toMatch(
      /PENDIENTE DE DEFINICIÓN/,
    );
    expect(aplanarSalidas(arbol)).toHaveLength(2);
  });

  it('unidad segura declarada sin estado: aparece y lo dice', () => {
    const capacidades =
      '<x><isSupportDoorSecurityModuleSwitchParams>true</isSupportDoorSecurityModuleSwitchParams></x>';
    const arbol = construirArbolDeSalidas('E', { ...NADA, capacidades }, 1);
    expect(arbol.hijos.map((h) => h.clave)).toEqual(['propio', 'unidad-segura']);
  });
});
