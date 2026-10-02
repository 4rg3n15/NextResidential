import type { INestApplication } from '@nestjs/common';
import { DetectorDeMarcas, jpegConMedidas, tramaDeSilencio, tramaDeTono } from '@ncr/providers';
import { direccionDe } from '../utilidades';
import { OPERADOR, SUFIJO, api, como, dod, hasta, token } from './montaje-del-dod';

/**
 * 15-Q2 · DoD · lo que varias pruebas hacen igual desde la consola: una vivienda
 * con titular y placa, una visita con foto, y la medida de audio de ida y vuelta.
 */

/** Una vivienda con titular (RN-05) y una placa suya. Devuelve la placa. */
export const viviendaConPlaca = async (): Promise<string> => {
  const admin = await como('administrador');
  const casa = await admin.post(`/copropiedades/${dod.cop}/padron/viviendas`, {
    identificador: '1',
  });
  dod.vivienda = casa.body.id as string;
  const titular = await admin.post(`/copropiedades/${dod.cop}/padron/personas`, {
    tipoDocumento: 'cedula',
    numeroDocumento: `6${String(Date.now()).slice(-9)}`,
    nombreCompleto: `Titular ${SUFIJO}`,
  });
  await admin.post(`/copropiedades/${dod.cop}/padron/residentes`, {
    viviendaId: dod.vivienda,
    personaId: titular.body.id,
    esTitular: true,
  });
  const placa = `PN${SUFIJO.slice(0, 4)}`;
  await admin.post(`/copropiedades/${dod.cop}/padron/vehiculos`, {
    viviendaId: dod.vivienda,
    placa,
  });
  return placa;
};

/** Una visita autoaprobada con foto y la casilla de consentimiento marcada. */
export const visitaConFoto = async () =>
  (await como('administrador')).post(`/copropiedades/${dod.cop}/visitas`, {
    nombre: `Visitante ${SUFIJO}`,
    tipoDocumento: 'cedula',
    documento: `8${String(Date.now()).slice(-9)}`,
    viviendaId: dod.vivienda,
    inicio: new Date(Date.now() - 300_000).toISOString(),
    duracionMinutos: 60,
    foto: {
      contenidoBase64: Buffer.from(jpegConMedidas(320, 240, 64)).toString('base64'),
      tipoMime: 'image/jpeg',
      medidas: { rostrosDetectados: 1, nitidez: 0.9, iluminacion: 0.6, proporcionRostro: 0.4 },
    },
    casillaMarcada: true,
  });

/**
 * E1 · el operador abre el intercom, recibe su billete y habla por el WebSocket.
 * Vuelta: una marca que el videoportero emite, hasta oírla en el navegador.
 * Ida: un tono que el navegador manda, hasta que el videoportero lo detecta.
 */
export const medirAudio = async (): Promise<{ ida: number; vuelta: number; abierta: unknown }> => {
  const op = await token('operador_central', {
    copropiedadId: null,
    copropiedades: [dod.cop],
    usuarioId: OPERADOR,
  });
  const abrir = await api()
    .post(`/copropiedades/${dod.cop}/guardia/intercom/abrir`)
    .set('Authorization', `Bearer ${op}`)
    .send({ dispositivoId: dod.equipo.portero });
  const b = await api()
    .post(`/copropiedades/${dod.cop}/guardia/intercom/${dod.equipo.portero}/billete`)
    .set('Authorization', `Bearer ${op}`);
  const base = direccionDe(dod.app as INestApplication).replace(/^http/, 'ws');
  const ws = new WebSocket(
    `${base}/guardia/audio?billete=${encodeURIComponent(String(b.body.billete))}`,
  );
  ws.binaryType = 'arraybuffer';
  let recibidas = 0;
  const oidas: number[] = [];
  const oido = new DetectorDeMarcas((t) => oidas.push(t));
  ws.addEventListener('message', (e) => {
    if (!(e.data instanceof ArrayBuffer)) return;
    recibidas += 1;
    oido.alimentar(new Uint8Array(e.data));
  });
  await new Promise<void>((listo) => ws.addEventListener('open', () => listo()));
  await hasta(() => recibidas > 0);

  await dod.hijo?.marcarAudio();
  await hasta(() => oidas.length > 0);
  const emitidas = (await dod.hijo?.estado())?.marcasEmitidas ?? [];
  const vuelta = (oidas[0] ?? 0) - (emitidas.at(-1) ?? 0);

  ws.send(JSON.stringify({ tipo: 'pulsar' }));
  for (let i = 0; i < 3; i += 1) ws.send(tramaDeSilencio());
  const enviado = Date.now();
  ws.send(tramaDeTono(1));
  await hasta(async () => ((await dod.hijo?.estado())?.marcasRecibidas.length ?? 0) > 0);
  const ida = ((await dod.hijo?.estado())?.marcasRecibidas[0] ?? 0) - enviado;
  ws.send(JSON.stringify({ tipo: 'soltar' }));
  ws.close(1000, 'El operador colgó');
  return { ida, vuelta, abierta: abrir.body };
};
