import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { diagnosticarEquipo } from './diagnostico-de-equipo';
import { fichaDe } from './ficha';
import type { HallazgoDelEquipo } from './ficha';
import { equipoSimulado } from '../simulacion/equipo-simulado';
import { servidorRtspSimulado } from '../simulacion/servidor-rtsp';
import type { ServidorRtspSimulado } from '../simulacion/servidor-rtsp';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * CORRECCIÓN 15-S1 · C.3 · LA FICHA AVISA DEL CANAL GUARDADO QUE EL EQUIPO NO TIENE
 *
 * 06/10: la ficha de la DS-TCG405-E guardaba el 102 y el equipo declara sólo
 * el 101 (H.265). La ficha lo decía de pasada, pegado al hallazgo del códec —y
 * con H.264 ese hallazgo es «conforme»—. Ahora es un hallazgo PROPIO: qué canal
 * tiene la ficha, que el equipo NO lo declara y cuál se usará.
 *
 * Y si la lista no se pudo leer —la causa [Probable] del 06/10: el `curl` se
 * hizo con admin, la API usa el usuario de servicio— se dice que el canal de la
 * ficha va SIN contrastar, con el motivo: nunca un silencio que parezca conforme.
 * El equipo que dice «no listo mis canales» es NO APLICA: sin hallazgo propio.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;
const CAMPO = 'canal de video de la ficha';

const LISTA_101_H265 = `<?xml version="1.0" encoding="UTF-8"?>
<StreamingChannelList version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<StreamingChannel version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<id>101</id>
<enabled>true</enabled>
<Transport><Unicast><enabled>true</enabled></Unicast><Multicast><enabled>false</enabled></Multicast></Transport>
<Video><enabled>true</enabled><videoCodecType>H.265</videoCodecType></Video>
</StreamingChannel>
</StreamingChannelList>`;

/** Lo que un usuario sin permiso de lectura de flujos recibe [Probable]. */
const SIN_PRIVILEGIO = `<?xml version="1.0" encoding="UTF-8"?>
<ResponseStatus version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<requestURL>/ISAPI/Streaming/channels</requestURL>
<statusCode>4</statusCode>
<statusString>Invalid Operation</statusString>
<subStatusCode>lowPrivilege</subStatusCode>
</ResponseStatus>`;

let rtsp: ServidorRtspSimulado;
beforeAll(async () => {
  rtsp = await servidorRtspSimulado({
    ...CREDENCIAL,
    canales: { '101': 'H265' },
    estadoSinCanal: '412 Precondition Failed',
  });
});
afterAll(async () => {
  await rtsp.cerrar();
});

/** La cámara simulada; `lista` sustituye su respuesta a la lista de flujos. */
const camara = (lista?: { readonly estado: number; readonly cuerpo: string }): typeof fetch => {
  const base = equipoSimulado({ familia: 'camara', ...CREDENCIAL });
  return async (entrada, opciones) => {
    const url = new URL(typeof entrada === 'string' ? entrada : String(entrada));
    return lista !== undefined && /\/ISAPI\/Streaming\/channels$/i.test(url.pathname)
      ? new Response(lista.cuerpo, { status: lista.estado })
      : base(entrada, opciones);
  };
};

const ficha = async (canal: string | null, lista?: { estado: number; cuerpo: string }) => {
  const d = await diagnosticarEquipo({
    host: '127.0.0.1',
    puerto: 80,
    protocolo: 'http',
    ...CREDENCIAL,
    familia: 'camara',
    peticion: camara(lista),
    video: { puerto: rtsp.puerto, canal },
  });
  return { d, hallazgo: fichaDe(d).hallazgos.find((h: HallazgoDelEquipo) => h.campo === CAMPO) };
};

describe('15-S1 · C.3 · la ficha y el canal de video guardado', () => {
  it('la ficha tiene el 102 y el equipo sólo declara el 101: AVISO propio, con el que se usará', async () => {
    const { hallazgo } = await ficha('102', { estado: 200, cuerpo: LISTA_101_H265 });
    expect(hallazgo).toMatchObject({ estado: 'aviso', valorLeido: '102', valorCorrecto: '101' });
    expect(hallazgo?.detalle).toMatch(
      /La ficha tiene el canal 102, que el equipo NO declara \(declara: 101 · H\.265\)\. Se usará el 101/,
    );
  });

  it('la lista no se pudo leer (403 · lowPrivilege): el 102 va SIN contrastar, con el motivo', async () => {
    const { hallazgo } = await ficha('102', { estado: 403, cuerpo: SIN_PRIVILEGIO });
    expect(hallazgo).toMatchObject({ estado: 'no_comprobado', valorLeido: '102' });
    expect(hallazgo?.detalle).toMatch(/HTTP 403 \(lowPrivilege\)/);
    expect(hallazgo?.detalle).toMatch(/se usará el 102 de la ficha sin contrastarlo/);
    expect(hallazgo?.detalle).toMatch(/usuario de servicio/);
  });

  it('un 403 sin cuerpo tumba el descubrimiento entero: también se dice, con el motivo', async () => {
    const { d, hallazgo } = await ficha('102', { estado: 403, cuerpo: '' });
    expect(d.capacidadesDelEquipo).toBeNull();
    expect(hallazgo).toMatchObject({ estado: 'no_comprobado', valorLeido: '102' });
    expect(hallazgo?.detalle).toMatch(/no se pudo leer lo que el equipo declara/);
  });

  it('el equipo contesta sin ningún canal habilitado: el de la ficha, sin contrastar', async () => {
    const vacia = LISTA_101_H265.replace(
      '<enabled>true</enabled>\n<Transport>',
      '<enabled>false</enabled>\n<Transport>',
    );
    const { hallazgo } = await ficha('102', { estado: 200, cuerpo: vacia });
    expect(hallazgo).toMatchObject({ estado: 'no_comprobado', valorLeido: '102' });
    expect(hallazgo?.detalle).toMatch(/sin ningún canal habilitado/);
  });

  it('sin canal en la ficha y sin lista legible: el 101 por omisión, sin contrastar', async () => {
    const { hallazgo } = await ficha(null, { estado: 403, cuerpo: SIN_PRIVILEGIO });
    expect(hallazgo).toMatchObject({ estado: 'no_comprobado', valorLeido: null });
    expect(hallazgo?.detalle).toMatch(/se usará el 101 por omisión sin contrastarlo/);
  });

  it('el 101 de la ficha está declarado: ningún hallazgo propio (sin ruido)', async () => {
    expect((await ficha('101', { estado: 200, cuerpo: LISTA_101_H265 })).hallazgo).toBeUndefined();
  });

  it('el equipo dice «no listo mis canales» (NO APLICA): ningún hallazgo propio', async () => {
    expect((await ficha('102')).hallazgo).toBeUndefined();
  });
});
