import { afterEach, describe, expect, it } from 'vitest';
import { pasoDeVideoWebrtc } from './paso-de-video-webrtc';
import { resultado } from './tipos';
import type { OpcionesDeEnsayo } from './tipos';
import {
  OMITIDA_SIN_BINARIO,
  OMITIDA_SIN_FFMPEG,
  arrancarGo2rtc,
  binarioFfmpeg,
  binarioGo2rtc,
} from '../simulacion/go2rtc-de-pruebas';
import type { Go2rtcDePruebas } from '../simulacion/go2rtc-de-pruebas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * A5 (15-S2) · EL PASO 7 CONTRA go2rtc Y ffmpeg REALES, CON UNA CÁMARA H.265
 *
 * La «cámara» la sirve el mismo go2rtc por su RTSP interno, en el camino de un
 * equipo (`Streaming/Channels/101`) y en H.265 (libx265). El paso 7 debe decir
 * «transcodificado» con la SDP y el PRIMER CUADRO en ms, y la vía directa de
 * Safari. Las cifras salen en la consola de la prueba: son las del banco del
 * informe. Sin GO2RTC_BIN o sin ffmpeg, se omite con nombre.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const binario = binarioGo2rtc();
const ffmpeg = binarioFfmpeg();
const omitida =
  binario === null ? OMITIDA_SIN_BINARIO : ffmpeg === null ? OMITIDA_SIN_FFMPEG : null;

describe.skipIf(omitida !== null)(
  `paso 7 con go2rtc y ffmpeg reales (${omitida ?? 'GO2RTC_BIN y ffmpeg'})`,
  () => {
    let puente: Go2rtcDePruebas | null = null;
    afterEach(async () => {
      await puente?.cerrar();
      puente = null;
    });

    it('H.265: transcodificado para Chrome con el primer cuadro en ms, y Safari directo', async () => {
      puente = await arrancarGo2rtc(
        binario ?? '',
        [
          'streams:',
          `  Streaming/Channels/101: exec:${ffmpeg ?? 'ffmpeg'} -hide_banner -loglevel error -re ` +
            '-f lavfi -i testsrc2=size=640x360:rate=15 -c:v libx265 -preset ultrafast ' +
            '-tune zerolatency -x265-params keyint=15:log-level=error -an -f rtsp {output}',
        ],
        { rtspInterno: true },
      );
      const o = {
        equipo: {
          familia: 'camara',
          host: '127.0.0.1',
          puerto: 80,
          usuario: 'servicio',
          clave: 'clave-de-la-camara',
          puerta: 1,
          canalDeVideo: '101',
          puertoRtsp: puente.puertoRtsp,
        },
        puente: { url: puente.url },
      } as unknown as OpcionesDeEnsayo;
      const sonda = resultado('video', 'ok', 'H.265 por RTSP (canal 101)');
      const p = await pasoDeVideoWebrtc(o, sonda, '101', 'H.265');
      console.log(`A5 · banco del paso 7: ${p.detalle.slice(-2).join(' | ')}`);
      expect(p.estado, p.detalle.join('\n')).toBe('ok');
      expect(p.causa).toMatch(/\(transcodificado\), primer cuadro a los \d+ ms de pedirlo/);
      expect(p.detalle.join('\n')).toMatch(/Safari \(oferta con H\.265\) · directo, SDP en \d+ ms/);
      expect(p.detalle.join('\n')).not.toContain('clave-de-la-camara');
    }, 60_000);
  },
);
