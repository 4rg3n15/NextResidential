import { describe, expect, it } from 'vitest';
import { AlmacenEvidenciaFirmado, NotificadorPushRegistrado } from './evidencia-y-push';
import { bitacoraDePrueba } from '../aplicacion/dobles';

const SECRETO = 'secreto-de-pruebas-con-mas-de-32-caracteres';
const T0 = 1_770_000_000_000;

const almacen = (ahora = T0): AlmacenEvidenciaFirmado =>
  new AlmacenEvidenciaFirmado(SECRETO, 'https://evidencia.local/objeto', () => ahora);

const partes = (url: string): { clave: string; expira: number; firma: string } => {
  const u = new URL(url);
  return {
    clave: decodeURIComponent(u.pathname.split('/').pop() ?? ''),
    expira: Number(u.searchParams.get('expira')),
    firma: u.searchParams.get('firma') ?? '',
  };
};

describe('AlmacenEvidenciaFirmado · RN-21', () => {
  it('la URL lleva caducidad y firma', () => {
    const a = almacen();
    return a.urlFirmada('ev-1', 120).then((url) => {
      const p = partes(url);
      expect(p.clave).toBe('ev-1');
      expect(p.expira).toBe(Math.floor(T0 / 1000) + 120);
      expect(p.firma).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  it('la firma se verifica', async () => {
    const a = almacen();
    const p = partes(await a.urlFirmada('ev-1', 120));
    expect(a.verificar(p.clave, p.expira, p.firma)).toBe(true);
  });

  it('una firma ajena a la clave NO vale: no se puede reapuntar el enlace', async () => {
    const a = almacen();
    const p = partes(await a.urlFirmada('ev-1', 120));
    expect(a.verificar('ev-2', p.expira, p.firma)).toBe(false);
  });

  it('mover la caducidad invalida la firma', async () => {
    const a = almacen();
    const p = partes(await a.urlFirmada('ev-1', 120));
    expect(a.verificar(p.clave, p.expira + 3600, p.firma)).toBe(false);
  });

  it('una URL caducada se rechaza', async () => {
    const emisor = almacen(T0);
    const p = partes(await emisor.urlFirmada('ev-1', 60));
    // El mismo secreto, más tarde: el enlace que quedó en un correo ya no sirve.
    const despues = almacen(T0 + 61_000);
    expect(despues.verificar(p.clave, p.expira, p.firma)).toBe(false);
  });

  it('una firma de longitud distinta se rechaza sin comparar', async () => {
    const a = almacen();
    const p = partes(await a.urlFirmada('ev-1', 120));
    expect(a.verificar(p.clave, p.expira, 'ab')).toBe(false);
  });

  it('un secreto distinto produce otra firma', async () => {
    const otro = new AlmacenEvidenciaFirmado(
      'otro-secreto-de-mas-de-32-caracteres!!',
      undefined,
      () => T0,
    );
    const p = partes(await almacen().urlFirmada('ev-1', 120));
    expect(otro.verificar(p.clave, p.expira, p.firma)).toBe(false);
  });

  it('guardar devuelve la clave con la que se recupera', async () => {
    const a = almacen();
    expect(await a.guardar('ev-9', new Uint8Array([1, 2, 3]), 'image/jpeg')).toBe('ev-9');
  });

  it('una clave con caracteres especiales viaja codificada', async () => {
    const url = await almacen().urlFirmada('carpeta/ev 1', 60);
    expect(url).toContain('carpeta%2Fev%201');
  });
});

describe('NotificadorPushRegistrado · HU-34', () => {
  it('deja constancia del aviso', async () => {
    const bitacora = bitacoraDePrueba();
    const push = new NotificadorPushRegistrado(bitacora);
    expect(await push.aVivienda('cop-1', 'viv-1', 'Acceso registrado', 'cuerpo')).toBe(1);
    expect(push.pendientes).toEqual([
      { copropiedadId: 'cop-1', viviendaId: 'viv-1', titulo: 'Acceso registrado' },
    ]);
  });

  it('NO registra el cuerpo del aviso en la bitácora (§2.7.8)', async () => {
    // El cuerpo puede nombrar a una persona y a una vivienda, y la bitácora se
    // envía a un tercero.
    const bitacora = bitacoraDePrueba();
    await new NotificadorPushRegistrado(bitacora).aVivienda(
      'cop-1',
      'viv-1',
      'Acceso denegado',
      'Intento de Juan Pérez en la puerta 3',
    );
    const linea = bitacora.lineas[0];
    expect(JSON.stringify(linea)).not.toContain('Juan');
    expect(linea?.contexto?.['longitudCuerpo']).toBe('Intento de Juan Pérez en la puerta 3'.length);
  });
});
