/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P1 · LA PÁGINA DEL BANCO DE MEDIDA DEL AUDIO
 *
 * Una página sin CSP —es un banco, no la consola— con tres cosas:
 *
 *  · un MICRÓFONO sintético: un oscilador de 1 kHz con la ganancia a cero que
 *    `__marcarIda()` sube 300 ms y apunta el instante. Sustituye a
 *    `getUserMedia` (inyectado como `obtenerMicrofono`, la misma costura que
 *    usan las pruebas de la consola): el código que se mide es el de producción;
 *  · un OÍDO: todo lo que se conecta al destino de un `AudioContext` pasa
 *    también por un analizador, y un vigilante cada 5 ms apunta el instante en
 *    que empieza un tono. Mide hasta la salida del grafo de audio, sin la
 *    latencia del altavoz (igual para las tres opciones);
 *  · las sesiones de las tres opciones: A (WebRTC con go2rtc), B (WebSocket a
 *    la API) y el transporte actual (HTTP por trozos).
 *
 * El reloj es `performance.timeOrigin + performance.now()`: el mismo del
 * proceso de Node que mide en el equipo simulado (misma máquina).
 * ═════════════════════════════════════════════════════════════════════════════
 */
const instrumentacion = `
const ahora = () => performance.timeOrigin + performance.now();
window.__ncr = { vuelta: [] };
const conectar = AudioNode.prototype.connect;
// Un analizador por contexto: cada trama programada se conecta al suyo.
const porContexto = new Map();
const analizadorDe = (contexto) => {
  let a = porContexto.get(contexto);
  if (a === undefined) {
    a = contexto.createAnalyser();
    a.fftSize = 256;
    porContexto.set(contexto, a);
  }
  return a;
};
AudioNode.prototype.connect = function (destino, ...resto) {
  const r = conectar.call(this, destino, ...resto);
  if (destino instanceof AudioDestinationNode) {
    window.__ncr.alDestino = (window.__ncr.alDestino ?? 0) + 1;
    window.__ncr.estadoDelContexto = this.context.state;
    conectar.call(this, analizadorDe(this.context));
  }
  return r;
};
window.__oir = (contexto, nodo) => conectar.call(nodo, analizadorDe(contexto));
const analizadores = { [Symbol.iterator]: () => porContexto.values() };
let armado = true;
let silencios = 0;
const muestras = new Float32Array(256);
setInterval(() => {
  let nivel = 0;
  for (const a of analizadores) {
    a.getFloatTimeDomainData(muestras);
    let suma = 0;
    for (const m of muestras) suma += m * m;
    nivel = Math.max(nivel, Math.sqrt(suma / muestras.length));
  }
  if (nivel > 0.05) {
    silencios = 0;
    if (armado) {
      armado = false;
      window.__ncr.vuelta.push(ahora());
    }
  } else if (++silencios >= 10) armado = true;
}, 5);

let fuente = null;
window.__microfono = async () => {
  if (fuente === null) {
    const contexto = new AudioContext();
    const oscilador = contexto.createOscillator();
    oscilador.frequency.value = 1000;
    const ganancia = contexto.createGain();
    ganancia.gain.value = 0;
    const destino = contexto.createMediaStreamDestination();
    oscilador.connect(ganancia);
    conectar.call(ganancia, destino);
    oscilador.start();
    fuente = { contexto, ganancia, destino };
  }
  return new MediaStream(fuente.destino.stream.getAudioTracks().map((p) => p.clone()));
};
window.__tono = (nivel) => fuente.ganancia.gain.setValueAtTime(nivel, fuente.contexto.currentTime);
window.__marcarIda = () => {
  const t = ahora();
  window.__tono(0.5);
  setTimeout(() => window.__tono(0), 300);
  return t;
};

const iceCompleto = (pc) =>
  new Promise((listo) => {
    if (pc.iceGatheringState === 'complete') return listo();
    const fin = setTimeout(listo, 1500);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(fin); listo(); }
    });
  });

// A · WebRTC «sendrecv» contra go2rtc: audio de ida y de vuelta en la misma sesión.
window.__sesionA = async (url) => {
  const inicio = ahora();
  const pc = new RTCPeerConnection({ iceServers: [] });
  const microfono = await window.__microfono();
  pc.addTransceiver(microfono.getAudioTracks()[0], { direction: 'sendrecv' });
  const contexto = new AudioContext();
  pc.addEventListener('track', (e) => {
    const flujo = e.streams[0] ?? new MediaStream([e.track]);
    const elemento = new Audio();
    elemento.muted = true;
    elemento.srcObject = flujo;
    void elemento.play();
    window.__oir(contexto, contexto.createMediaStreamSource(flujo));
  });
  await pc.setLocalDescription(await pc.createOffer());
  await iceCompleto(pc);
  const r = await fetch(url, { method: 'POST', body: pc.localDescription.sdp });
  if (!r.ok) throw new Error('go2rtc ' + r.status + ' ' + (await r.text()));
  await pc.setRemoteDescription({ type: 'answer', sdp: await r.text() });
  window.__pc = pc;
  for (;;) {
    const informe = await pc.getStats();
    for (const s of informe.values()) {
      if (s.type === 'inbound-rtp' && s.kind === 'audio' && s.packetsReceived > 0) {
        return { inicio, bajadaLista: ahora() };
      }
    }
    await new Promise((listo) => setTimeout(listo, 5));
  }
};
window.__cerrarA = () => window.__pc.close();

// B · WebSocket a la API, con el código de la consola (canal-por-websocket.ts).
window.__sesionB = (url) =>
  new Promise((resolver) => {
    const inicio = ahora();
    let lista = false;
    window.__canal = new NCR.CanalDeAudioPorWebSocket({
      url,
      formato: 'g711u',
      obtenerMicrofono: window.__microfono,
      alEstado: () => undefined,
      crearSocket: (u) => {
        const s = new WebSocket(u);
        s.addEventListener('message', () => {
          if (!lista) { lista = true; resolver({ inicio, bajadaLista: ahora() }); }
        });
        return s;
      },
    });
  });
window.__pulsarB = () => window.__canal.pulsar();
window.__soltarB = () => window.__canal.soltar();
window.__cerrarB = () => window.__canal.cerrar();

// Actual · flujo HTTP de bajada y un POST por trozo de subida (puente.ts).
window.__sesionActual = async (base) => {
  const inicio = ahora();
  let avisar;
  const lista = new Promise((r) => (avisar = r));
  // Un paso intermedio que apunta el primer byte; cancelar el flujo de la
  // consola cancela también la descarga (con un tee() la otra rama la retenía).
  const pedir = async (u, init) => {
    const r = await fetch(u, init);
    let visto = false;
    const marcador = new TransformStream({
      transform(trozo, control) {
        if (!visto) { visto = true; avisar(ahora()); }
        window.__ncr.bytesDeBajada = (window.__ncr.bytesDeBajada ?? 0) + trozo.length;
        control.enqueue(trozo);
      },
    });
    return new Response(r.body.pipeThrough(marcador), { status: r.status, headers: r.headers });
  };
  window.__reproduccion = await NCR.reproducirFlujo(base + '/audio', 'g711u', { pedir });
  return { inicio, bajadaLista: await lista };
};
window.__pulsarActual = async (base) => {
  window.__captura = await NCR.capturarMicrofono(
    'g711u',
    (trozo) => void fetch(base + '/audio', { method: 'POST', body: trozo }),
    { obtenerMicrofono: window.__microfono },
  );
};
window.__soltarActual = () => window.__captura.detener();
window.__cerrarActual = () => { window.__captura?.detener(); window.__reproduccion.detener(); };
`;

export const paginaDeMedida = (bundle) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>Banco de audio</title></head>` +
  `<body><script>${bundle}</script><script>${instrumentacion}</script></body></html>`;
