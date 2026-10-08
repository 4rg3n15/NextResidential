import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  OFERTA_SDP_DE_NAVEGADOR,
  OMITIDA_SIN_BINARIO,
  OMITIDA_SIN_FFMPEG,
  arrancarGo2rtc,
  binarioFfmpeg,
  binarioGo2rtc,
} from '@ncr/providers';
import type { Go2rtcDePruebas, OrigenDeVideo, ProveedorDeEquipos } from '@ncr/providers';
import type { Bitacora } from '@ncr/domain-core';
import { PuenteGo2rtc } from './puente-go2rtc';
import { NegociarVistaEnVivo, videoActivoEnRespuesta } from '../aplicacion/vista-en-vivo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * A1/A3/A6 (15-S2) · H.265 CONTRA go2rtc Y ffmpeg DE VERDAD
 *
 * La «cámara» es un flujo H.265 que el propio go2rtc genera con ffmpeg
 * (libx265) y sirve por su RTSP interno; la API lo registra con una URL CON
 * credencial, como la de un equipo. Se comprueba lo medido en el banco:
 *  · con la oferta de Chrome (sin H.265) la vía es TRANSCODIFICADA y la
 *    respuesta trae video H.264 activo;
 *  · con la de Safari (con H.265) la vía es DIRECTA;
 *  · la credencial NO aparece en los argumentos de ningún proceso (RN-21): la
 *    fuente transcodificada referencia el flujo por su nombre.
 * Sin GO2RTC_BIN o sin ffmpeg, se omite con nombre.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const binario = binarioGo2rtc();
const ffmpeg = binarioFfmpeg();
const CLAVE = 'clave-del-equipo-que-no-debe-salir';
const omitida =
  binario === null ? OMITIDA_SIN_BINARIO : ffmpeg === null ? OMITIDA_SIN_FFMPEG : null;

/** La oferta de Safari: la del navegador con H.265 en la sección de video. */
const OFERTA_CON_H265 = OFERTA_SDP_DE_NAVEGADOR.replace(
  /^(m=video 9 UDP\/TLS\/RTP\/SAVPF [0-9 ]+)$/m,
  '$1 125',
).replace(
  /^(a=mid:0\r\n)/m,
  '$1a=rtpmap:125 H265/90000\r\na=fmtp:125 level-id=93;profile-id=1;tier-flag=0;tx-mode=SRST\r\n',
);

const bitacora: Bitacora = { registrar: () => undefined };
const reloj = { ahora: () => new Date() };

describe.skipIf(omitida !== null)(
  `vista en vivo H.265 contra go2rtc y ffmpeg reales (${omitida ?? 'GO2RTC_BIN y ffmpeg'})`,
  () => {
    let puente: Go2rtcDePruebas | null = null;
    afterEach(async () => {
      await puente?.cerrar();
      puente = null;
    });

    it('Chrome: transcodificado con H.264 activo; Safari: directo; la clave en ningún proceso', async () => {
      puente = await arrancarGo2rtc(
        binario ?? '',
        [
          'streams:',
          `  camara: exec:${ffmpeg ?? 'ffmpeg'} -hide_banner -loglevel error -re -f lavfi -i ` +
            'testsrc2=size=320x240:rate=15 -c:v libx265 -preset ultrafast -tune zerolatency ' +
            '-x265-params keyint=15:log-level=error -an -f rtsp {output}',
        ],
        { rtspInterno: true },
      );
      const origen: OrigenDeVideo = {
        rtsp: `rtsp://servicio:${CLAVE}@127.0.0.1:${String(puente.puertoRtsp)}/camara`,
        flujo: 'principal',
        detalle: 'cámara de prueba en H.265',
        codec: 'H.265',
        canal: '101',
      };
      const proveedor = { origenDeVideo: async () => origen } as unknown as ProveedorDeEquipos;
      const caso = new NegociarVistaEnVivo(
        proveedor,
        new PuenteGo2rtc(puente.url, undefined, 20_000),
        bitacora,
        reloj,
        'auto',
      );
      const solicitud = {
        copropiedadId: 'c-1',
        dispositivoId: 'camara-1',
        operadorId: 'o-1',
      };

      const chrome = await caso.ejecutar({ ...solicitud, ofertaSdp: OFERTA_SDP_DE_NAVEGADOR });
      expect(chrome.via).toBe('transcodificado');
      expect(videoActivoEnRespuesta(chrome.respuestaSdp)).toBe(true);
      expect(chrome.respuestaSdp).toMatch(/a=rtpmap:\d+ H264\/90000/);
      expect(chrome.respuestaSdp).not.toContain(CLAVE);

      const procesos = execFileSync('ps', ['-eo', 'args'], { encoding: 'utf8' }).split('\n');
      expect(procesos.some((l) => l.includes('ncr-camara-1') && /ffmpeg/.test(l))).toBe(true);
      expect(procesos.filter((l) => l.includes(CLAVE))).toEqual([]);

      const safari = await caso.ejecutar({ ...solicitud, ofertaSdp: OFERTA_CON_H265 });
      expect(safari.via).toBe('directo');
      expect(videoActivoEnRespuesta(safari.respuestaSdp)).toBe(true);
      expect(safari.respuestaSdp).toMatch(/a=rtpmap:\d+ H265\/90000/);
    }, 60_000);
  },
);
