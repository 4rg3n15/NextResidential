import { decodificarUlaw, tramaDeTono } from '../simulacion/marcas-de-audio';
import { motivoLegible } from '../nucleo/motivo-legible';
import type { SesionDeAudio } from '../videoportero/sesion-de-audio';
import type { Interlocutor } from './tipos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B1/B6 (15-S2) · EL AUDIO EN SITIO, MEDIDO EN VEZ DE SUPUESTO
 *
 * Lo que la guardia vio el 07/10: el videoportero abre y da `sessionId`; la
 * terminal no oye al operador; el operador no oye al equipo mientras habla.
 * Sin documento del fabricante para estas dos familias en el repositorio, cada
 * pregunta de B1 se contesta con UNA medida, con el adaptador de producción
 * (`IntercomIsapiPersistente`, el del WebSocket):
 *
 *   1. el canal: formato, muestreo, tasa y volúmenes, LEÍDOS (nada se escribe);
 *   2. abrir: si el equipo da `sessionId` y si audioData/close lo aceptan;
 *   3. ESCUCHAR N s: bytes y nivel RMS por segundo — ni un byte se guarda: la
 *      voz es un dato personal (Ley 1581);
 *   4. un tono de 2 s MIENTRAS se escucha: si la bajada sigue, dúplex
 *      completo; si calla, semidúplex; y se pregunta a la persona si lo oyó;
 *   5. cerrar, y los estados HTTP de la sesión.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface CanalDescrito {
  readonly canal: number;
  readonly formato: string | null;
  readonly muestreo: string | null;
  readonly tasa: string | null;
  readonly volumenAltavoz: string | null;
  readonly volumenMicrofono: string | null;
}

const campo = (bloque: string, nombre: string): string | null =>
  new RegExp(`<${nombre}>\\s*([^<]*?)\\s*</${nombre}>`, 'i').exec(bloque)?.[1] ?? null;

/** B1 · el canal pedido de `GET …/TwoWayAudio/channels`, o el primero; `null` si no hay. */
export const describirCanalDeAudio = (xml: string, canal?: number): CanalDescrito | null => {
  const bloques = [...xml.matchAll(/<TwoWayAudioChannel\b[\s\S]*?<\/TwoWayAudioChannel>/gi)].map(
    (m) => m[0],
  );
  const bloque = bloques.find((b) => canal === undefined || campo(b, 'id') === String(canal));
  const id = bloque === undefined ? null : Number(campo(bloque, 'id'));
  if (bloque === undefined || id === null || !Number.isInteger(id)) return null;
  return {
    canal: id,
    formato: campo(bloque, 'audioCompressionType'),
    muestreo: campo(bloque, 'audioSamplingRate'),
    tasa: campo(bloque, 'audioBitRate'),
    // [SUPUESTO] S-15S2-03 · el volumen se lee aquí; si el equipo no lo lista, «no declarado».
    volumenAltavoz: campo(bloque, 'speakerVolume'),
    volumenMicrofono: campo(bloque, 'microphoneVolume'),
  };
};

/** G.711 A-law → PCM16 (ITU-T G.711). */
const decodificarAlaw = (byte: number): number => {
  const a = byte ^ 0x55;
  const exponente = (a >> 4) & 0x07;
  const mantisa = a & 0x0f;
  const pcm = exponente === 0 ? (mantisa << 4) + 8 : ((mantisa << 4) + 0x108) << (exponente - 1);
  return (a & 0x80) !== 0 ? pcm : -pcm;
};

export const esG711 = (formato: string | null): 'ulaw' | 'alaw' | null => {
  const f = (formato ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/g711u|ulaw|mulaw|pcmu/.test(f)) return 'ulaw';
  if (/g711a|alaw|pcma/.test(f)) return 'alaw';
  return null;
};

/** Nivel RMS en dBFS (−∞ … 0) de bytes G.711; `null` si el formato no es G.711. */
export const nivelDbfs = (bytes: Uint8Array, formato: string | null): number | null => {
  const ley = esG711(formato);
  if (ley === null) return null;
  if (bytes.length === 0) return -Infinity;
  const decodificar = ley === 'ulaw' ? decodificarUlaw : decodificarAlaw;
  let suma = 0;
  for (const b of bytes) suma += decodificar(b) ** 2;
  const rms = Math.sqrt(suma / bytes.length) / 32_768;
  return rms === 0 ? -Infinity : Math.round(20 * Math.log10(rms) * 10) / 10;
};

/**
 * B3 · dúplex por la bajada: lo que llega mientras se habla frente a lo de antes.
 * [SUPUESTO] S-15S2-04 · ≥ 50 % completo, < 10 % semidúplex, con 800 B/s de base.
 */
export const juzgarDuplex = (
  bytesPorSegundoAntes: number,
  bytesPorSegundoDurante: number,
): 'completo' | 'semiduplex' | 'indeterminado' => {
  if (bytesPorSegundoAntes < 800) return 'indeterminado';
  const proporcion = bytesPorSegundoDurante / bytesPorSegundoAntes;
  return proporcion >= 0.5 ? 'completo' : proporcion < 0.1 ? 'semiduplex' : 'indeterminado';
};

/** El adaptador de audio que se diagnostica: el de producción, con su sesión. */
export interface AudioDiagnosticable {
  abrirSesion(dispositivoId: string, operadorId: string): Promise<unknown>;
  enviarAudio(trama: Uint8Array): Promise<void>;
  recibirAudio(): AsyncIterable<Uint8Array>;
  cerrarSesion(motivo: string): Promise<void>;
  readonly sesionDeAudio: SesionDeAudio;
}

export interface OpcionesDelDiagnostico {
  readonly audio: AudioDiagnosticable;
  readonly canal: CanalDescrito;
  readonly nombre: string;
  readonly escucharMs: number;
  readonly interlocutor: Interlocutor;
  readonly ahora?: () => number;
}

export interface DiagnosticoDeAudio {
  readonly lineas: readonly string[];
  readonly duplex: 'completo' | 'semiduplex' | 'indeterminado';
  readonly oyoElTono: boolean | null;
  readonly fallo: boolean;
}

const dormir = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

const TONO_MS = 2000;
/** Lo que ya venía en camino cuando empezó el tono no dice nada del dúplex. */
const ARRANQUE_MS = 300;

export const diagnosticarAudio = async (o: OpcionesDelDiagnostico): Promise<DiagnosticoDeAudio> => {
  const ahora = o.ahora ?? Date.now;
  const { canal } = o;
  const lineas = [
    `canal ${String(canal.canal)} · formato ${canal.formato ?? 'no declarado'} · muestreo ` +
      `${canal.muestreo ?? 'no declarado'} · tasa ${canal.tasa ?? 'no declarada'}`,
    `volumen del altavoz ${canal.volumenAltavoz ?? 'no declarado'} · del micrófono ` +
      `${canal.volumenMicrofono ?? 'no declarado'} (sólo lectura)`,
  ];
  if (esG711(canal.formato) === null) {
    lineas.push(
      `⚠ ${canal.formato ?? 'sin formato'} NO es G.711: la consola sólo habla G.711; ` +
        'el tono no se envía (B4: pasar el canal a G.711 sólo con autorización y respaldo)',
    );
  }
  const muestras: { t: number; bytes: Uint8Array }[] = [];
  const inicio = ahora();
  try {
    await o.audio.abrirSesion('diagnostico-de-audio', 'diagnostico-de-audio');
  } catch (error) {
    lineas.push(`✗ el canal no se abrió: ${motivoLegible(error)}`);
    return { lineas, duplex: 'indeterminado', oyoElTono: null, fallo: true };
  }
  let escuchando = true;
  const bajada = o.audio.recibirAudio()[Symbol.asyncIterator]();
  const lector = (async () => {
    while (escuchando) {
      const { done, value } = await bajada.next();
      if (done === true) return;
      muestras.push({ t: ahora() - inicio, bytes: value });
    }
  })().catch(() => undefined);
  await dormir(o.escucharMs);
  const finDeEscucha = ahora() - inicio;
  let oyo: boolean | null = null;
  const tonoDesde = ahora() - inicio;
  let tonoEnviado = false;
  if (esG711(canal.formato) === 'ulaw') {
    await o.interlocutor.indicar(`Escuche ${o.nombre}: va a sonar un tono de 2 s`);
    for (let i = 0; i < TONO_MS / 20; i += 1) {
      await o.audio.enviarAudio(tramaDeTono(i));
      await dormir(20);
    }
    tonoEnviado = true;
  } else if (esG711(canal.formato) === 'alaw') {
    lineas.push(
      '· formato A-law: el tono de prueba es µ-law y no se envía; pruebe desde la consola',
    );
  }
  const tonoHasta = ahora() - inicio;
  await dormir(500);
  escuchando = false;
  await o.audio.cerrarSesion('fin del diagnóstico de audio').catch(() => undefined);
  await lector;
  if (tonoEnviado) oyo = await o.interlocutor.confirmar(`¿Se oyó el tono en ${o.nombre}?`);

  const entre = (desde: number, hasta: number) =>
    muestras.filter((m) => m.t >= desde && m.t < hasta).reduce((n, m) => n + m.bytes.length, 0);
  const antes = (entre(0, finDeEscucha) * 1000) / Math.max(1, finDeEscucha);
  const durante = tonoEnviado
    ? (entre(tonoDesde + ARRANQUE_MS, tonoHasta) * 1000) /
      Math.max(1, tonoHasta - tonoDesde - ARRANQUE_MS)
    : antes;
  const todo = new Uint8Array(muestras.reduce((n, m) => n + m.bytes.length, 0));
  muestras.reduce((i, m) => (todo.set(m.bytes, i), i + m.bytes.length), 0);
  const nivel = nivelDbfs(todo, canal.formato);
  const resumen = o.audio.sesionDeAudio.resumen(canal.formato);
  const duplex = tonoEnviado ? juzgarDuplex(antes, durante) : 'indeterminado';
  lineas.push(
    `bajada (del equipo): ${String(Math.round(antes))} B/s escuchando · ` +
      `${String(Math.round(durante))} B/s mientras sonaba el tono · nivel ` +
      `${nivel === null ? 'no medible (no G.711)' : `${String(nivel)} dBFS`} · primer byte ` +
      `${String(resumen['primerByteBajadaMs'] ?? 'nunca')} ms`,
    `subida (al equipo): ${String(resumen['bytesSubidos'])} B · primer byte ` +
      `${String(resumen['primerByteSubidaMs'] ?? 'nunca')} ms · ¿se oyó? ` +
      `${oyo === null ? 'sin respuesta' : oyo ? 'sí' : 'NO'}`,
    `dúplex: ${duplex}${duplex === 'semiduplex' ? ' (el equipo calla mientras recibe: la consola muestra el turno)' : ''}`,
    `sessionId: ${String(resumen['sessionId'])} · estados HTTP: ${(resumen['estadosHttp'] as string[]).join(', ')}`,
  );
  const fallo = antes === 0 || oyo === false;
  return { lineas, duplex, oyoElTono: oyo, fallo };
};
