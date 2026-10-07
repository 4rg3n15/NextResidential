import { describe, expect, it } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import { descubrirCapacidades } from './capacidades-hikvision';
import { HikvisionProvider } from './hikvision-provider';
import { RegistroEnMemoria } from './registro-de-equipos';
import { ClienteDeEquipo } from '../equipo/cliente';
import { equipoSimulado } from '../simulacion/equipo-simulado';
import { capacidadesDesdeJson } from '../nucleo/capacidades';
import { VideoNoReproducible } from '../nucleo/errores';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * CORRECCIÓN 15-S1 · C · LA CÁMARA LPR DEL 06/10 PIDIÓ EL CANAL 102, QUE NO TIENE
 *
 * DS-TCG405-E (V5.4.0): `GET /ISAPI/Streaming/channels` lista UN canal, el 101,
 * habilitado y en H.265; la ficha guardaba el 102 desde el 29/09. Se reproduce
 * la cadena entera con el XML de la forma real —`StreamingChannel` con
 * `version`/`xmlns` y `<enabled>` anidados en Unicast/Multicast/Security—:
 * descubrimiento → JSON (lo que guarda la base) → `capacidadesDesdeJson` →
 * proveedor. C.1: el 101 sale «propuesto» y se dice. C.2: como el 101 DECLARA
 * H.265, el video se niega ANTES de llamar al puente, con el motivo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const LISTA_REAL = `<?xml version="1.0" encoding="UTF-8"?>
<StreamingChannelList version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<StreamingChannel version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<id>101</id>
<channelName>Camera 01</channelName>
<enabled>true</enabled>
<Transport>
<maxPacketSize>1000</maxPacketSize>
<ControlProtocolList><ControlProtocol><streamingTransport>RTSP</streamingTransport></ControlProtocol></ControlProtocolList>
<Unicast><enabled>true</enabled><rtpTransportType>RTP/TCP</rtpTransportType></Unicast>
<Multicast><enabled>false</enabled><destIPAddress>0.0.0.0</destIPAddress></Multicast>
<Security><enabled>true</enabled><certificateType>digest</certificateType></Security>
</Transport>
<Video>
<enabled>true</enabled>
<videoInputChannelID>1</videoInputChannelID>
<videoCodecType>H.265</videoCodecType>
</Video>
</StreamingChannel>
</StreamingChannelList>`;
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;

const camaraReal = (lista: string): typeof fetch => {
  const base = equipoSimulado({ familia: 'camara', ...CREDENCIAL });
  return async (entrada, opciones) => {
    const url = new URL(typeof entrada === 'string' ? entrada : String(entrada));
    return /\/ISAPI\/Streaming\/channels$/i.test(url.pathname)
      ? new Response(lista, { status: 200 })
      : base(entrada, opciones);
  };
};

/** Lo que la base guarda tras «Probar conexión» y el registro devuelve. */
const guardadas = async (peticion: typeof fetch) => {
  const descubiertas = await descubrirCapacidades({
    cliente: new ClienteDeEquipo({
      host: '127.0.0.1',
      puerto: 80,
      protocolo: 'http',
      ...CREDENCIAL,
      peticion,
    }),
    familia: 'camara',
  });
  return capacidadesDesdeJson(JSON.parse(JSON.stringify(descubiertas)));
};

const proveedor = async (lista: string) => {
  const avisos: { mensaje: string; datos: unknown }[] = [];
  const traza: Bitacora = {
    registrar: (_nivel, mensaje, datos) => {
      avisos.push({ mensaje, datos });
    },
  };
  const peticion = camaraReal(lista);
  const p = new HikvisionProvider({
    registro: new RegistroEnMemoria([
      {
        dispositivoId: 'camara-1',
        tipo: 'camara_lpr',
        host: '127.0.0.1',
        puerto: 80,
        protocolo: 'http',
        ...CREDENCIAL,
        canalDeVideo: '102',
        capacidades: await guardadas(peticion),
      },
    ]),
    reloj: { ahora: () => new Date(0) },
    puertoRtsp: 554,
    peticion,
    traza,
  });
  return { p, avisos };
};

describe('15-S1 · C · el canal de la cámara LPR del 06/10', () => {
  it('C.1 · la lista real sobrevive al JSON: el 101 (H.265), y nunca el 102', async () => {
    const c = await guardadas(camaraReal(LISTA_REAL));
    expect(c.video.canales).toEqual([{ id: '101', codec: 'H.265' }]);
  });

  it('C.1 · el 102 de la ficha se sustituye por el 101 declarado, y se dice', async () => {
    const { p, avisos } = await proveedor(LISTA_REAL.replace('H.265', 'H.264'));
    expect((await p.origenDeVideo('camara-1'))?.rtsp).toMatch(/\/Streaming\/Channels\/101#/);
    expect(avisos).toContainEqual({
      mensaje: 'canal de video de la ficha sustituido',
      datos: expect.objectContaining({ canal: '101' }),
    });
  });

  it('C.2 · el 101 DECLARA H.265: se niega ANTES del puente, con el canal y la autorización', async () => {
    const { p } = await proveedor(LISTA_REAL);
    const error = await p.origenDeVideo('camara-1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VideoNoReproducible);
    expect(error).toMatchObject({ codec: 'H.265', canal: '101' });
    expect((error as Error).message).toMatch(
      /el equipo entrega H\.265 en el canal 101; el navegador no lo reproduce por WebRTC: cambie ese flujo a H\.264 en el equipo \(requiere autorización del cliente\)/i,
    );
  });
});
