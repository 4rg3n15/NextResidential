import { describe, expect, it } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import type { OrigenDeVideo, ProveedorDeEquipos } from '@ncr/providers';
import { NegociarVistaEnVivo, nombreDeFlujo, videoActivoEnRespuesta } from './vista-en-vivo';
import type { PuenteDeVideo } from './puertos';
import { PuenteDeVideoFallo, PuenteDeVideoNoConfigurado, SinOrigenDeVideo } from './puertos';

const DISPOSITIVO = 'e0000000-0000-4000-8000-000000000001';
const RTSP = 'rtsp://usuario:clave-secreta@equipo.local:554/Streaming/Channels/102';

const origen: OrigenDeVideo = { rtsp: RTSP, flujo: 'secundario', detalle: 'flujo secundario' };
const RESPUESTA_CON_VIDEO =
  'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 108\r\na=rtpmap:108 H264/90000\r\na=sendonly\r\n';

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
      // V5 (15-N) · una respuesta con su sección de video, como la de go2rtc.
      return RESPUESTA_CON_VIDEO;
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
    expect(salida.respuestaSdp).toBe(RESPUESTA_CON_VIDEO);
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

describe('V5 (15-N) · por qué no hay video, en palabras', () => {
  const conPuenteQue = (
    negociar: PuenteDeVideo['negociar'],
    sondearVideo?: ProveedorDeEquipos['sondearVideo'],
  ) => {
    const sondeos: string[] = [];
    const proveedor = {
      origenDeVideo: async () => origen,
      ...(sondearVideo === undefined
        ? {}
        : {
            sondearVideo: async (id: string) => {
              sondeos.push(id);
              return sondearVideo(id);
            },
          }),
    } as unknown as ProveedorDeEquipos;
    const puente: PuenteDeVideo = { asegurarFlujo: async () => undefined, negociar };
    const bitacora = { registrar: () => undefined } as unknown as Bitacora;
    const caso = new NegociarVistaEnVivo(proveedor, puente, bitacora, { ahora: () => new Date(0) });
    return { caso, sondeos };
  };
  const falla = (motivo: string) => async () => {
    throw new PuenteDeVideoFallo(motivo);
  };

  it('«wrong response on DESCRIBE»: se le pregunta al equipo y manda su respuesta', async () => {
    const { caso, sondeos } = conPuenteQue(
      falla('negociación WebRTC con el puente: HTTP 500 · streams: wrong response on DESCRIBE'),
      async () => ({
        canal: '102',
        causa: 'sin_canal',
        codec: null,
        frase: 'el equipo no tiene el canal 102 (RTSP 412): elija uno de los que declara',
      }),
    );
    const error = await caso.ejecutar(solicitud).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PuenteDeVideoFallo);
    expect((error as Error).message).toMatch(/no tiene el canal 102 \(RTSP 412\)/);
    expect(sondeos).toEqual([DISPOSITIVO]);
  });

  it('sin sonda en el proveedor: la frase del puente, no el texto técnico a secas', async () => {
    const { caso } = conPuenteQue(falla('HTTP 500 · streams: wrong response on DESCRIBE'));
    const error = await caso.ejecutar(solicitud).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/Probar conexión/);
  });

  it('«wrong user/pass»: credencial RTSP en palabras', async () => {
    const { caso } = conPuenteQue(falla('HTTP 500 · streams: wrong user/pass'));
    const error = await caso.ejecutar(solicitud).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/rechazó la credencial por RTSP/);
  });

  it('el puente no alcanzable NO dispara la sonda: es el puente, no el equipo', async () => {
    const { caso, sondeos } = conPuenteQue(falla('fetch failed · ECONNREFUSED'), async () => ({
      canal: '101',
      causa: 'ninguna',
      codec: 'H.264',
      frase: '',
    }));
    const error = await caso.ejecutar(solicitud).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/go2rtc no está en marcha/);
    expect(sondeos).toEqual([]);
  });

  it('respuesta con el video «inactive» (equipo en H.265): códec no soportado, no un negro', async () => {
    const { caso } = conPuenteQue(
      async () => 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 108\r\na=inactive\r\n',
      async () => ({
        canal: '101',
        causa: 'codec',
        codec: 'H.265',
        frase: 'el equipo entrega H.265 en el canal 101 y el navegador sólo reproduce H.264',
      }),
    );
    const error = await caso.ejecutar(solicitud).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/H\.265 en el canal 101/);
  });

  it('videoActivoEnRespuesta: sin sección de video, puerto 0 o inactive → no', () => {
    expect(videoActivoEnRespuesta(RESPUESTA_CON_VIDEO)).toBe(true);
    expect(videoActivoEnRespuesta('v=0\r\nm=audio 9 X 0\r\n')).toBe(false);
    expect(videoActivoEnRespuesta('v=0\r\nm=video 0 X 96\r\n')).toBe(false);
    expect(videoActivoEnRespuesta('v=0\r\nm=video 9 X 96\r\na=inactive\r\nm=audio 9 X 0\r\n')).toBe(
      false,
    );
  });
});
