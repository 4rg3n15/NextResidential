import { describe, expect, it } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import { ServiceUnavailableException } from '@nestjs/common';
import type { Bitacora } from '@ncr/domain-core';
import { EdgeDesconectado, HechoYaResueltoEnElEdge, OrdenVencida } from '@ncr/providers';
import type { ReporteDeErrores } from '../../observabilidad';
import { CODIGO_EDGE_NO_DISPONIBLE, motivoDelTunel } from './error-del-tunel';
import { FiltroGlobalDeExcepciones, SEGUNDOS_ANTES_DE_REINTENTAR } from './filtro-global';

/**
 * 15-Q2 · C3 · el Edge del conjunto no está conectado, o no contestó a tiempo:
 * no es un 500 ni un 4xx, es una dependencia que falta. 503 con el código que
 * la consola reconoce, el motivo y `Retry-After`. Se reconoce por NOMBRE.
 */
const conNombre = (nombre: string, mensaje: string): Error =>
  Object.assign(new Error(mensaje), { name: nombre });

describe('motivoDelTunel (15-Q2, C3)', () => {
  it('EdgeDesconectado: código EDGE_NO_DISPONIBLE y su motivo', () => {
    expect(motivoDelTunel(new EdgeDesconectado())).toEqual({
      codigo: CODIGO_EDGE_NO_DISPONIBLE,
      message: 'el Edge del conjunto no está conectado',
    });
    expect(CODIGO_EDGE_NO_DISPONIBLE).toBe('EDGE_NO_DISPONIBLE');
  });

  it('OrdenVencida: el mismo código, con un texto FIJO que no nombra el pedido interno', () => {
    const error = new OrdenVencida('credencial.guardar', 15_000);
    expect(motivoDelTunel(error)).toEqual({
      codigo: 'EDGE_NO_DISPONIBLE',
      message: 'el Edge del conjunto no contestó a tiempo',
    });
    expect(JSON.stringify(motivoDelTunel(error))).not.toContain('credencial.guardar');
  });

  it('por NOMBRE, no por clase; y el motivo de cierre del otro lado no se repite', () => {
    expect(motivoDelTunel(conNombre('EdgeDesconectado', 'cerrado por: <lo que sea>'))).toEqual({
      codigo: 'EDGE_NO_DISPONIBLE',
      message: 'el Edge del conjunto no está conectado',
    });
  });

  it.each([
    ['un Error cualquiera', new Error('x')],
    ['otro error del túnel', new HechoYaResueltoEnElEdge('hecho-1')],
    ['un objeto con ese nombre que no es Error', { name: 'EdgeDesconectado', message: 'x' }],
    ['un texto', 'EdgeDesconectado'],
    ['null', null],
  ])('%s: null', (_caso, error) => {
    expect(motivoDelTunel(error)).toBeNull();
  });
});

const atender = (excepcion: unknown) => {
  const cabeceras: Record<string, string> = {};
  const salida: { estado: number; cuerpo: unknown } = { estado: 0, cuerpo: undefined };
  const respuesta = {
    setHeader: (nombre: string, valor: string) => void (cabeceras[nombre] = valor),
    status: (estado: number) => {
      salida.estado = estado;
      return respuesta;
    },
    json: (cuerpo: unknown) => {
      salida.cuerpo = cuerpo;
      return respuesta;
    },
  };
  const peticion = { headers: { 'x-request-id': 'corr-1' }, method: 'POST', url: '/x' };
  const host = {
    switchToHttp: () => ({ getResponse: () => respuesta, getRequest: () => peticion }),
  } as unknown as ArgumentsHost;
  const niveles: string[] = [];
  const bitacora: Bitacora = { registrar: (nivel) => void niveles.push(nivel) };
  const capturados: unknown[] = [];
  const reporte: ReporteDeErrores = { capturar: (e) => void capturados.push(e) };
  new FiltroGlobalDeExcepciones(bitacora, reporte).catch(excepcion, host);
  return { ...salida, cabeceras, niveles, capturados };
};

describe('FiltroGlobalDeExcepciones con errores del túnel (15-Q2, C3)', () => {
  it('EdgeDesconectado: 503, Retry-After y { codigo, message } en el cuerpo', () => {
    const r = atender(new EdgeDesconectado());
    expect(r.estado).toBe(503);
    expect(r.cabeceras).toEqual({ 'Retry-After': String(SEGUNDOS_ANTES_DE_REINTENTAR) });
    expect(r.cuerpo).toEqual({
      estado: 503,
      correlacion: 'corr-1',
      mensaje: { codigo: 'EDGE_NO_DISPONIBLE', message: 'el Edge del conjunto no está conectado' },
    });
    expect(r.niveles).toEqual(['error']);
    expect(r.capturados).toHaveLength(1);
  });

  it('OrdenVencida: también 503 con Retry-After', () => {
    const r = atender(new OrdenVencida('video.whep', 15_000));
    expect(r.estado).toBe(503);
    expect(r.cabeceras['Retry-After']).toBe('5');
    expect(r.cuerpo).toMatchObject({ mensaje: { codigo: 'EDGE_NO_DISPONIBLE' } });
  });

  it('un error cualquiera sigue siendo 500 «Error interno», sin Retry-After', () => {
    const r = atender(new Error('detalle interno que no sale'));
    expect(r.estado).toBe(500);
    expect(r.cabeceras).toEqual({});
    expect(r.cuerpo).toEqual({ estado: 500, correlacion: 'corr-1', mensaje: 'Error interno' });
  });

  it('una HttpException manda: no se reinterpreta como del túnel', () => {
    const r = atender(new ServiceUnavailableException('mantenimiento'));
    expect(r.estado).toBe(503);
    expect(r.cabeceras).toEqual({});
    expect(r.cuerpo).toMatchObject({
      mensaje: expect.objectContaining({ message: 'mantenimiento' }),
    });
  });
});
