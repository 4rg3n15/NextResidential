import { describe, expect, it } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import type { OrigenDeVideo, ProveedorDeEquipos } from '@ncr/providers';
import { NegociarVistaEnVivo, nombreDeFlujo } from './vista-en-vivo';
import type { PuenteDeVideo } from './puertos';
import { PuenteDeVideoNoConfigurado, SinOrigenDeVideo } from './puertos';

const DISPOSITIVO = 'e0000000-0000-4000-8000-000000000001';
const RTSP = 'rtsp://usuario:clave-secreta@equipo.local:554/Streaming/Channels/102';

const origen: OrigenDeVideo = { rtsp: RTSP, flujo: 'secundario', detalle: 'flujo secundario' };

const banco = (resuelve: () => Promise<OrigenDeVideo | null>, conPuente = true) => {
  const asegurados: { nombre: string; fuente: string }[] = [];
  const negociadas: { nombre: string; oferta: string }[] = [];
  const anotaciones: unknown[] = [];
  const puente: PuenteDeVideo = {
    asegurarFlujo: async (nombre, fuente) => {
      asegurados.push({ nombre, fuente });
    },
    negociar: async (nombre, oferta) => {
      negociadas.push({ nombre, oferta });
      return 'v=0\r\nrespuesta';
    },
  };
  const proveedor = { origenDeVideo: resuelve } as unknown as ProveedorDeEquipos;
  const bitacora = {
    registrar: (_nivel: string, _mensaje: string, datos?: unknown) => {
      anotaciones.push(datos);
    },
  } as unknown as Bitacora;
  let tic = 0;
  const reloj = { ahora: () => new Date(1_700_000_000_000 + 250 * tic++) };
  const caso = new NegociarVistaEnVivo(proveedor, conPuente ? puente : null, bitacora, reloj);
  return { caso, asegurados, negociadas, anotaciones };
};

const solicitud = {
  copropiedadId: 'cop-a',
  dispositivoId: DISPOSITIVO,
  operadorId: 'op-1',
  ofertaSdp: 'v=0\r\noferta',
};

describe('NegociarVistaEnVivo (A5)', () => {
  it('sin puente configurado: PuenteDeVideoNoConfigurado, sin tocar el proveedor', async () => {
    let consultado = false;
    const { caso } = banco(async () => {
      consultado = true;
      return origen;
    }, false);
    await expect(caso.ejecutar(solicitud)).rejects.toBeInstanceOf(PuenteDeVideoNoConfigurado);
    expect(consultado).toBe(false);
  });

  it('origen nulo (el tipo de equipo no emite video): SinOrigenDeVideo y nada en el puente', async () => {
    const { caso, asegurados } = banco(async () => null);
    await expect(caso.ejecutar(solicitud)).rejects.toBeInstanceOf(SinOrigenDeVideo);
    expect(asegurados).toHaveLength(0);
  });

  it('el proveedor no resuelve el equipo: SinOrigenDeVideo con su motivo', async () => {
    const { caso } = banco(async () => {
      throw new Error('el equipo no está en el registro');
    });
    const error = await caso.ejecutar(solicitud).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SinOrigenDeVideo);
    expect((error as Error).message).toContain('no está en el registro');
  });

  it('con origen: asegura el flujo con la fuente, negocia y devuelve la respuesta', async () => {
    const { caso, asegurados, negociadas } = banco(async () => origen);
    const salida = await caso.ejecutar(solicitud);
    expect(asegurados).toEqual([{ nombre: nombreDeFlujo(DISPOSITIVO), fuente: RTSP }]);
    expect(negociadas).toEqual([{ nombre: nombreDeFlujo(DISPOSITIVO), oferta: 'v=0\r\noferta' }]);
    expect(salida.respuestaSdp).toBe('v=0\r\nrespuesta');
    expect(salida.flujo).toBe('secundario');
    expect(salida.latenciaMs).toBe(250);
  });

  it('la bitácora anota equipo, flujo y latencia, y NUNCA la fuente', async () => {
    const { caso, anotaciones } = banco(async () => origen);
    await caso.ejecutar(solicitud);
    const texto = JSON.stringify(anotaciones);
    expect(texto).toContain(DISPOSITIVO);
    expect(texto).toContain('"latenciaMs":250');
    expect(texto).not.toContain('clave-secreta');
    expect(texto).not.toContain('rtsp://');
  });
});
