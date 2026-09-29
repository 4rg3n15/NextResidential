import { describe, expect, it } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import type { OrigenDeVideo, ProveedorDeEquipos } from '@ncr/providers';
import { NegociarVistaEnVivo, nombreDeFlujo } from './vista-en-vivo';
import type { PuenteDeVideo } from './puertos';
import { PuenteDeVideoFallo, PuenteDeVideoNoConfigurado, SinOrigenDeVideo } from './puertos';

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

describe('D2 (15-L) · un video que el navegador no reproduce se dice antes de negociar', () => {
  it('el H.265 del proveedor llega como «sin video» con su frase, y el puente no se toca', async () => {
    const { caso, asegurados } = banco(async () => {
      // La frase de `VideoNoReproducible` (probada en el paquete de proveedores):
      // la capa de aplicación no importa valores de él (frontera O2).
      throw new Error(
        'Este equipo entrega H.265 en el canal 101 y el navegador no lo reproduce: ' +
          'cámbielo a H.264 en el equipo o elija otro canal en su ficha',
      );
    });
    const error = await caso.ejecutar(solicitud).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SinOrigenDeVideo);
    expect((error as Error).message).toMatch(/entrega H\.265 en el canal 101 .* cámbielo a H\.264/);
    expect(asegurados).toEqual([]);
  });
});

describe('E2/C1 (15-M) · un fallo del puente sale en palabras, con remedio y sin la fuente', () => {
  const conPuenteQueFalla = (motivo: string, enRegistro = false) => {
    const puente: PuenteDeVideo = {
      asegurarFlujo: async () => {
        if (enRegistro) throw new PuenteDeVideoFallo(motivo);
      },
      negociar: async () => {
        throw new PuenteDeVideoFallo(motivo);
      },
    };
    const proveedor = { origenDeVideo: async () => origen } as unknown as ProveedorDeEquipos;
    const bitacora = { registrar: () => undefined } as unknown as Bitacora;
    return new NegociarVistaEnVivo(proveedor, puente, bitacora, { ahora: () => new Date(0) });
  };

  it('«HTTP 500 · EOF» se explica como cierre del equipo (backchannel) y conserva el dato técnico', async () => {
    const error = await conPuenteQueFalla('negociación WebRTC con el puente: HTTP 500 · EOF')
      .ejecutar(solicitud)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PuenteDeVideoFallo);
    const mensaje = (error as Error).message;
    expect(mensaje).toMatch(/cerró la conexión de video \(backchannel/);
    expect(mensaje).toContain('HTTP 500 · EOF');
    expect(mensaje).not.toContain('clave-secreta');
  });

  it('un puente apagado manda a `pnpm sitio:video`; un `streams:` sobrante, a regenerar', async () => {
    const apagado = await conPuenteQueFalla('registro del flujo en el puente: fetch failed', true)
      .ejecutar(solicitud)
      .catch((e: unknown) => (e as Error).message);
    expect(apagado).toMatch(/go2rtc no está en marcha.*pnpm sitio:video/);
    const yaml = await conPuenteQueFalla(
      'registro del flujo en el puente: HTTP 400 · yaml: line 9: did not find expected key',
      true,
    )
      .ejecutar(solicitud)
      .catch((e: unknown) => (e as Error).message);
    expect(yaml).toMatch(/streams:.*pnpm sitio:video/);
  });

  it('un canal que el equipo no tiene manda a la ficha; lo desconocido pasa tal cual', async () => {
    const canal = await conPuenteQueFalla(
      'negociación WebRTC con el puente: HTTP 500 · 412 Precondition Failed',
    )
      .ejecutar(solicitud)
      .catch((e: unknown) => (e as Error).message);
    expect(canal).toMatch(/no tiene ese canal de video: elija otro canal en la ficha/);
    const raro = await conPuenteQueFalla(
      'negociación WebRTC con el puente: HTTP 500 · algo inédito',
    )
      .ejecutar(solicitud)
      .catch((e: unknown) => (e as Error).message);
    expect(raro).toContain('algo inédito');
  });
});
