/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P1 · EL SERVIDOR DEL BANCO: LA PÁGINA Y LOS TRES CAMINOS, EN UN ORIGEN
 *
 * Todo cuelga del mismo origen, como en la consola —donde todo pasa por su
 * propio servidor—, así que no hay CORS de por medio:
 *
 *  · `/`              la página de medida;
 *  · `/go2rtc/…`      señalización de A reenviada a go2rtc (el medio va por
 *                      WebRTC directo, como con el WHEP de la API);
 *  · `/ws`            B: el relevo hace lo que hará la API —abrir la sesión con
 *                      el adaptador persistente, reenviar la bajada, subir sólo
 *                      lo que llegue con «pulsar»—, sin la autenticación;
 *  · `/audio`         el transporte actual: GET de bajada y un POST por trozo.
 *
 * Los adaptadores son los de producción (`@ncr/providers/operacion`); sólo la
 * capa de la API se sustituye por este relevo, y eso se dice en el informe.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { createServer } from 'node:http';

const depurar = (...m) => {
  if (process.env.NCR_DEPURAR === '1') console.log('   relevo:', ...m);
};

const leerCuerpo = async (peticion) => {
  const trozos = [];
  for await (const t of peticion) trozos.push(t);
  return Buffer.concat(trozos);
};

export const servidorDelBanco = async ({ WebSocketServer, pagina }) => {
  const fase = { go2rtc: null, crearIntercom: null, intercomActual: null };
  const conexiones = new Set();

  const servidor = createServer(async (peticion, respuesta) => {
    const ruta = peticion.url ?? '/';
    try {
      if (ruta === '/') {
        respuesta.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        respuesta.end(pagina);
      } else if (ruta.startsWith('/go2rtc/')) {
        const r = await fetch(`${fase.go2rtc}/${ruta.slice('/go2rtc/'.length)}`, {
          method: peticion.method,
          body: peticion.method === 'POST' ? await leerCuerpo(peticion) : undefined,
        });
        respuesta.writeHead(r.status, { 'content-type': 'application/sdp' });
        respuesta.end(Buffer.from(await r.arrayBuffer()));
      } else if (ruta === '/audio' && peticion.method === 'GET') {
        const intercom = fase.crearIntercom();
        fase.intercomActual = intercom;
        await intercom.abrirSesion('videoportero-del-banco', 'operador-del-banco');
        respuesta.writeHead(200, { 'content-type': 'application/octet-stream' });
        respuesta.flushHeaders();
        let cerrado = false;
        respuesta.on('close', () => {
          depurar('GET /audio cerrado por el navegador');
          cerrado = true;
          const desde = Date.now();
          void intercom
            .cerrarSesion('banco: fin de la escucha')
            .then(() => depurar(`cerrarSesion terminó en ${String(Date.now() - desde)} ms`))
            .catch((e) => depurar(`cerrarSesion falló: ${String(e)}`));
        });
        for await (const trozo of intercom.recibirAudio()) {
          if (cerrado) break;
          respuesta.write(trozo);
        }
        respuesta.end();
      } else if (ruta === '/audio' && peticion.method === 'POST') {
        const cuerpo = await leerCuerpo(peticion);
        fase.posts = (fase.posts ?? 0) + 1;
        depurar(`POST /audio n.º ${String(fase.posts)} (${String(cuerpo.length)} B)`);
        await fase.intercomActual?.enviarAudio(new Uint8Array(cuerpo)).catch(() => undefined);
        depurar(`POST /audio n.º ${String(fase.posts)} atendido`);
        respuesta.writeHead(204);
        respuesta.end();
      } else {
        respuesta.writeHead(404);
        respuesta.end();
      }
    } catch (error) {
      if (!respuesta.headersSent) respuesta.writeHead(500);
      const causa =
        error instanceof Error && error.cause !== undefined ? ` (${String(error.cause)})` : '';
      respuesta.end(`${String(error)}${causa}`);
    }
  });
  servidor.on('connection', (s) => {
    conexiones.add(s);
    s.on('close', () => conexiones.delete(s));
  });

  const ws = new WebSocketServer({ server: servidor, path: '/ws' });
  ws.on('connection', (socket) => {
    const intercom = fase.crearIntercom();
    let pulsado = false;
    // Las tramas se suben EN ORDEN: una cadena de promesas, como en la API.
    let cadena = Promise.resolve();
    const abierta = intercom.abrirSesion('videoportero-del-banco', 'operador-del-banco');
    socket.on('message', (datos, binario) => {
      if (!binario) {
        pulsado = JSON.parse(String(datos)).tipo === 'pulsar';
        return;
      }
      if (!pulsado) return;
      const trama = new Uint8Array(datos);
      cadena = cadena
        .then(() => abierta)
        .then(() => intercom.enviarAudio(trama))
        .catch(() => undefined);
    });
    socket.on(
      'close',
      () => void abierta.then(() => intercom.cerrarSesion('banco: socket cerrado')),
    );
    void (async () => {
      await abierta;
      for await (const trozo of intercom.recibirAudio()) {
        if (socket.readyState !== 1) break;
        socket.send(trozo);
      }
    })().catch(() => socket.close(4010, 'El equipo cerró el canal de audio'));
  });

  await new Promise((listo) => servidor.listen(0, '127.0.0.1', listo));
  return {
    url: `http://127.0.0.1:${String(servidor.address().port)}`,
    usar: (cambios) => Object.assign(fase, cambios),
    cerrar: () =>
      new Promise((listo) => {
        ws.close();
        for (const s of conexiones) s.destroy();
        servidor.close(() => listo());
      }),
  };
};
