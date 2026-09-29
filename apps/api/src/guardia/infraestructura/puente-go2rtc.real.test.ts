import { afterEach, describe, expect, it } from 'vitest';
import {
  OFERTA_SDP_DE_PRUEBA,
  OMITIDA_SIN_BINARIO,
  arrancarGo2rtc,
  binarioGo2rtc,
  servidorRtspSimulado,
} from '@ncr/providers';
import type { Go2rtcDePruebas, ServidorRtspSimulado } from '@ncr/providers';
import { PuenteGo2rtc } from './puente-go2rtc';
import { PuenteDeVideoFallo } from '../aplicacion/puertos';

/**
 * E2/C1 (15-M) · EL PUENTE CONTRA go2rtc DE VERDAD, si hay binario.
 *
 * El doble HTTP de `puente-go2rtc.test.ts` prueba qué se envía; esto prueba
 * qué contesta el programa real: que el `PATCH` registra sin escribir la
 * credencial en su fichero, que la negociación devuelve SDP contra un equipo
 * simulado, y que el fallo visto en sitio («HTTP 500 · EOF») sale como
 * `PuenteDeVideoFallo` sin la credencial dentro.
 */
const binario = binarioGo2rtc();
const CLAVE = 'clave-que-no-debe-salir';

describe.skipIf(binario === null)(
  `PuenteGo2rtc contra go2rtc real (${binario === null ? OMITIDA_SIN_BINARIO : 'binario de GO2RTC_BIN'})`,
  () => {
    let puente: Go2rtcDePruebas | null = null;
    let camara: ServidorRtspSimulado | null = null;
    afterEach(async () => {
      await puente?.cerrar();
      await camara?.cerrar();
      puente = null;
      camara = null;
    });

    it('PATCH registra en memoria y la negociación devuelve SDP; el YAML no ve la clave', async () => {
      puente = await arrancarGo2rtc(binario ?? '', ['streams: {}']);
      camara = await servidorRtspSimulado({
        usuario: 'servicio',
        clave: CLAVE,
        canales: { '102': 'H264' },
        cerrarSiPideBackchannel: true,
        rechazaReconexionMs: 700,
      });
      const adaptador = new PuenteGo2rtc(puente.url);
      const fuente = `rtsp://servicio:${CLAVE}@127.0.0.1:${String(camara.puerto)}/Streaming/Channels/102#backchannel=0`;
      await adaptador.asegurarFlujo('ncr-prueba', fuente);
      const sdp = await adaptador.negociar('ncr-prueba', OFERTA_SDP_DE_PRUEBA);
      expect(sdp.startsWith('v=0')).toBe(true);
      expect(sdp).not.toContain(CLAVE);
      expect(puente.yaml()).toContain('streams: {}');
      expect(puente.yaml()).not.toContain(CLAVE);
      expect(camara.describesConBackchannel()).toBe(0);
    }, 30_000);

    it('sin #backchannel=0 el fallo es PuenteDeVideoFallo con «HTTP 500 · EOF», sin credencial', async () => {
      puente = await arrancarGo2rtc(binario ?? '');
      camara = await servidorRtspSimulado({
        usuario: 'servicio',
        clave: CLAVE,
        canales: { '102': 'H264' },
        cerrarSiPideBackchannel: true,
        rechazaReconexionMs: 700,
      });
      const adaptador = new PuenteGo2rtc(puente.url);
      const fuente = `rtsp://servicio:${CLAVE}@127.0.0.1:${String(camara.puerto)}/Streaming/Channels/102`;
      await adaptador.asegurarFlujo('ncr-sin', fuente);
      const error = await adaptador
        .negociar('ncr-sin', OFERTA_SDP_DE_PRUEBA)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PuenteDeVideoFallo);
      const mensaje = (error as Error).message;
      expect(mensaje).toMatch(/HTTP 500 · .*EOF/);
      expect(mensaje).not.toContain(CLAVE);
    }, 30_000);
  },
);
