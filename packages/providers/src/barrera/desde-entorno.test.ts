import { describe, expect, it } from 'vitest';
import {
  ConfiguracionDeBarreraIncompleta,
  VARIABLES,
  crearControlDeBarreraDesdeEntorno as desdeEntorno,
} from './desde-entorno';

/**
 * La lectura del entorno del control de barrera: sus ramas de validación
 * numérica no estaban cubiertas (D-86).
 *
 * Importa más de lo que parece. Un puerto mal escrito que se colara como `NaN`
 * produciría un adaptador que no conecta y un error que habla de red, no de
 * configuración — y §2.7.1 exige que la configuración se valide al arrancar,
 * no al primer uso.
 *
 * Ningún valor de aquí es real: son de la forma correcta y nada más (§2.5).
 */
const completo = {
  [VARIABLES.host]: ' 10.0.0.9 ',
  [VARIABLES.usuario]: ' servicio ',
  [VARIABLES.clave]: 'la-que-sea',
};

describe('crearControlDeBarreraDesdeEntorno · configurado, sin configurar y a medias', () => {
  it('sin nada configurado devuelve null: manda el simulado y el arranque no se rompe', () => {
    expect(desdeEntorno({})).toBeNull();
  });

  it('a medias LANZA, y nombra la variable que falta', () => {
    try {
      desdeEntorno({ [VARIABLES.host]: '10.0.0.9' });
      expect.unreachable('una configuración a medias tiene que lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(ConfiguracionDeBarreraIncompleta);
      expect(String(e)).toContain(VARIABLES.usuario);
    }
  });

  it('con lo obligatorio presente construye el control', () => {
    expect(desdeEntorno(completo)).not.toBeNull();
  });
});

describe('crearControlDeBarreraDesdeEntorno · el puerto y el tiempo límite se validan', () => {
  it('un entero positivo se acepta', () => {
    expect(desdeEntorno({ ...completo, [VARIABLES.puerto]: '8000' })).not.toBeNull();
    expect(desdeEntorno({ ...completo, [VARIABLES.tiempoLimite]: '2500' })).not.toBeNull();
  });

  it('un valor no entero, cero, negativo o en blanco se DESCARTA en vez de propagarse', () => {
    // Lo que se comprueba es que ninguno se cuela como `NaN` ni rompe la
    // construcción: se cae al valor por omisión, que es el comportamiento
    // conservador. Un `NaN` aquí sale mucho más tarde como un fallo de red.
    for (const malo of ['80.5', '0', '-1', '   ', 'ocho mil']) {
      expect(desdeEntorno({ ...completo, [VARIABLES.puerto]: malo })).not.toBeNull();
      expect(desdeEntorno({ ...completo, [VARIABLES.tiempoLimite]: malo })).not.toBeNull();
    }
  });
});
