import { describe, expect, it } from 'vitest';
import {
  TIMEOUT_DE_CANAL_SEGUNDOS,
  canalLibre,
  conVencimientosAplicados,
  esperaDe,
  renovarActividad,
  solicitarCanal,
  soltarCanal,
  titularAbandonado,
} from './canal-exclusivo';
import { esExito, esFallo } from '../compartido/resultado';

/**
 * ADR-01 · el canal de audio del equipo admite UNA conversación a la vez.
 *
 * Lo que estas pruebas persiguen no es el camino feliz: es el estado en el que
 * **dos operadores creen tener la palabra**, o en el que un canal queda tomado
 * por alguien que ya cerró el navegador y nadie puede volver a hablar con esa
 * puerta. Ninguno de los dos da error; los dos dejan una portería muda.
 */

const T = (segundos: number): Date => new Date(Date.UTC(2026, 8, 13, 10, 0, segundos));

describe('un titular, y el segundo espera', () => {
  it('el primero que lo pide tiene la palabra', () => {
    const r = solicitarCanal(canalLibre('disp-1'), 'op-a', T(0));
    expect(r.resultado).toBe('abierta');
    expect(r.porDelante).toBe(0);
    expect(r.estado.titular?.operadorId).toBe('op-a');
  });

  it('el segundo NO se rechaza: se encola con su puesto', () => {
    // Rechazar obligaría a reintentar a ciegas contra un canal que no se sabe
    // cuándo se libera, con un visitante delante.
    const uno = solicitarCanal(canalLibre('disp-1'), 'op-a', T(0));
    const dos = solicitarCanal(uno.estado, 'op-b', T(5));
    expect(dos.resultado).toBe('en_espera');
    expect(dos.porDelante).toBe(1);
    expect(dos.estado.titular?.operadorId).toBe('op-a');
  });

  it('el tercero va detrás del segundo, no delante', () => {
    let e = solicitarCanal(canalLibre('disp-1'), 'op-a', T(0)).estado;
    e = solicitarCanal(e, 'op-b', T(1)).estado;
    const tres = solicitarCanal(e, 'op-c', T(2));
    expect(tres.porDelante).toBe(2);
  });

  it('pedirlo dos veces no encola dos veces ni roba el turno', () => {
    // El doble clic y el reintento del cliente producen esto a diario.
    let e = solicitarCanal(canalLibre('disp-1'), 'op-a', T(0)).estado;
    e = solicitarCanal(e, 'op-b', T(1)).estado;
    const repetido = solicitarCanal(e, 'op-b', T(2));
    expect(repetido.estado.cola).toHaveLength(1);
    expect(repetido.porDelante).toBe(1);

    const titularOtraVez = solicitarCanal(repetido.estado, 'op-a', T(3));
    expect(titularOtraVez.resultado).toBe('abierta');
    expect(titularOtraVez.estado.cola).toHaveLength(1);
  });
});

describe('liberación por inactividad, decidida por el reloj', () => {
  it('el canal sigue siendo suyo mientras dé señales de vida', () => {
    let e = solicitarCanal(canalLibre('disp-1'), 'op-a', T(0)).estado;
    const renovado = renovarActividad(e, 'op-a', T(80));
    expect(esExito(renovado)).toBe(true);
    if (esExito(renovado)) e = renovado.valor;
    // 80 s de la primera apertura, pero sólo 20 desde la última señal.
    expect(titularAbandonado(e, T(100))).toBe(false);
  });

  it('sin señales durante el margen, se considera abandonado', () => {
    const e = solicitarCanal(canalLibre('disp-1'), 'op-a', T(0)).estado;
    expect(titularAbandonado(e, T(TIMEOUT_DE_CANAL_SEGUNDOS - 1))).toBe(false);
    expect(titularAbandonado(e, T(TIMEOUT_DE_CANAL_SEGUNDOS))).toBe(true);
  });

  it('al vencer, el canal pasa SOLO al primero de la cola', () => {
    // Sin esto, un operador que cierra el navegador deja la puerta muda para
    // siempre: no hay quien dispare la liberación.
    let e = solicitarCanal(canalLibre('disp-1'), 'op-a', T(0)).estado;
    e = solicitarCanal(e, 'op-b', T(1)).estado;
    const vigente = conVencimientosAplicados(e, T(200));
    expect(vigente.titular?.operadorId).toBe('op-b');
    expect(vigente.cola).toHaveLength(0);
  });

  it('al vencer sin cola, el canal queda libre', () => {
    const e = solicitarCanal(canalLibre('disp-1'), 'op-a', T(0)).estado;
    expect(conVencimientosAplicados(e, T(200)).titular).toBeNull();
  });

  it('quien perdió el canal por inactividad NO puede seguir hablando', () => {
    // Es la mitad que impide que dos operadores crean tener la palabra.
    const e = solicitarCanal(canalLibre('disp-1'), 'op-a', T(0)).estado;
    const conB = solicitarCanal(e, 'op-b', T(1)).estado;
    const tarde = renovarActividad(conB, 'op-a', T(200));
    expect(esFallo(tarde)).toBe(true);
  });

  it('el vencimiento se aplica al PEDIR, no sólo al mirar', () => {
    const e = solicitarCanal(canalLibre('disp-1'), 'op-a', T(0)).estado;
    const b = solicitarCanal(e, 'op-b', T(200));
    expect(b.resultado).toBe('abierta');
  });
});

describe('soltar el canal', () => {
  it('cede la palabra al primero de la cola en el mismo acto', () => {
    // Dejarlo libre y esperar a que alguien lo pida abre una ventana en la que
    // un tercero se cuela por delante de quien llevaba esperando.
    let e = solicitarCanal(canalLibre('disp-1'), 'op-a', T(0)).estado;
    e = solicitarCanal(e, 'op-b', T(1)).estado;
    const cierre = soltarCanal(e, 'op-a', T(10));
    expect(cierre.nuevoTitular).toBe('op-b');
    expect(cierre.estado.titular?.operadorId).toBe('op-b');
    expect(cierre.estado.cola).toHaveLength(0);
  });

  it('sin cola, queda libre', () => {
    const e = solicitarCanal(canalLibre('disp-1'), 'op-a', T(0)).estado;
    const cierre = soltarCanal(e, 'op-a', T(10));
    expect(cierre.estado.titular).toBeNull();
    expect(cierre.nuevoTitular).toBeNull();
  });

  it('quien espera puede salirse de la cola con la misma operación', () => {
    let e = solicitarCanal(canalLibre('disp-1'), 'op-a', T(0)).estado;
    e = solicitarCanal(e, 'op-b', T(1)).estado;
    const salida = soltarCanal(e, 'op-b', T(5));
    expect(salida.estado.cola).toHaveLength(0);
    expect(salida.estado.titular?.operadorId).toBe('op-a');
    expect(salida.nuevoTitular).toBeNull();
  });

  it('soltar un canal que no es tuyo no se lo quita a nadie', () => {
    const e = solicitarCanal(canalLibre('disp-1'), 'op-a', T(0)).estado;
    expect(soltarCanal(e, 'op-z', T(5)).estado.titular?.operadorId).toBe('op-a');
  });
});

describe('espera visible', () => {
  it('dice cuántos segundos lleva esperando, para poder pintarlo', () => {
    let e = solicitarCanal(canalLibre('disp-1'), 'op-a', T(0)).estado;
    e = solicitarCanal(e, 'op-b', T(10)).estado;
    expect(esperaDe(e, 'op-b', T(45))).toBe(35);
  });

  it('quien no espera no tiene espera', () => {
    const e = solicitarCanal(canalLibre('disp-1'), 'op-a', T(0)).estado;
    expect(esperaDe(e, 'op-a', T(45))).toBeNull();
  });
});
