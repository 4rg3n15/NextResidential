import { soporta } from '../nucleo/capacidades';
import type { CapacidadesDeEquipo } from '../nucleo/capacidades';
import { motivoLegible } from '../nucleo/motivo-legible';
import { IntercomDeEquipo } from '../videoportero/intercom-equipo';
import { resultado } from './tipos';
import type { OpcionesDeEnsayo, ResultadoDePaso } from './tipos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * J1 · PASO 8 · EL AUDIO, CON EL MISMO ADAPTADOR QUE USA LA GUARDIA
 *
 * Se abre la sesión con `IntercomDeEquipo` —el de producción, ADR-01—, se
 * manda UN SEGUNDO DE PITIDO en el formato que el equipo declara y se cierra.
 * La persona delante del videoportero dice si lo oyó: es la mitad «hablar»
 * del audio bidireccional, comprobada por un oído y no por un `200`. La mitad
 * «escuchar» se prueba en la consola de guardia, con el micrófono del operador.
 *
 * La apertura del canal se mide: es un PROXY de KPI-33 (< 2 s extremo a
 * extremo), no el extremo a extremo, y el resultado lo dice con esas palabras.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const UMBRAL_DE_AUDIO_MS = 2000;
const MUESTRAS_POR_SEGUNDO = 8000;

/** G.711 µ-law de una muestra lineal de 16 bits. */
const ulaw = (muestra: number): number => {
  const signo = muestra < 0 ? 0x80 : 0;
  let m = Math.min(Math.abs(muestra), 32635) + 0x84;
  let exponente = 7;
  for (let mascara = 0x4000; (m & mascara) === 0 && exponente > 0; mascara >>= 1) exponente -= 1;
  const mantisa = (m >> (exponente + 3)) & 0x0f;
  m = ~(signo | (exponente << 4) | mantisa);
  return m & 0xff;
};

/** G.711 A-law de una muestra lineal de 16 bits. */
const alaw = (muestra: number): number => {
  const signo = muestra >= 0 ? 0x80 : 0;
  const m = Math.min(Math.abs(muestra), 32767) >> 3;
  let exponente = 0;
  while (exponente < 7 && m >> (exponente + 5) !== 0) exponente += 1;
  const mantisa = exponente === 0 ? (m >> 1) & 0x0f : (m >> exponente) & 0x0f;
  return (signo | (exponente << 4) | mantisa) ^ 0x55;
};

/** Un segundo de 440 Hz en G.711. `null` si el formato no es G.711. */
export const tonoDePrueba = (formato: string | null): Uint8Array | null => {
  const f = (formato ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const codificar = /g711u|ulaw|mulaw|pcmu/.test(f)
    ? ulaw
    : /g711a|alaw|pcma/.test(f)
      ? alaw
      : null;
  if (codificar === null) return null;
  const tono = new Uint8Array(MUESTRAS_POR_SEGUNDO);
  for (let i = 0; i < tono.length; i += 1) {
    tono[i] = codificar(
      Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / MUESTRAS_POR_SEGUNDO)),
    );
  }
  return tono;
};

export const pasoDeAudio = async (
  o: OpcionesDeEnsayo,
  capacidades: CapacidadesDeEquipo | null,
  esperar: (ms: number) => Promise<void> = (ms) => new Promise((listo) => setTimeout(listo, ms)),
): Promise<ResultadoDePaso> => {
  const audio = capacidades?.audioBidireccional ?? null;
  const declara = capacidades !== null && soporta(capacidades, 'audioBidireccional');
  if (o.equipo.familia !== 'videoportero') {
    return resultado(
      'audio',
      'no_aplica',
      declara
        ? 'La guardia virtual habla por el videoportero; el audio de este equipo no se usa'
        : 'Este equipo no declara audio bidireccional',
    );
  }
  if (!declara || audio === null || audio.canal === null) {
    return resultado(
      'audio',
      'fallo',
      audio?.estado === 'no'
        ? 'El videoportero declara el audio bidireccional deshabilitado'
        : 'No se pudo leer el canal de audio del videoportero',
      'En su panel web: Configuración → Audio → Audio bidireccional, habilitado; en la consola, ' +
        '«Probar conexión» en su ficha; y repita el ensayo',
    );
  }
  if (o.soloLectura) {
    return resultado('audio', 'omitido', 'Modo solo lectura: no se abre el canal de audio');
  }
  const intercom = new IntercomDeEquipo({
    ...o.equipo,
    reloj: { ahora: o.ahora },
    canalHabilitado: true,
    canal: audio.canal,
    senalizacion: soporta(capacidades, 'senalizacionDeLlamada'),
  });
  const tono = tonoDePrueba(audio.formato);
  const inicio = performance.now();
  try {
    await intercom.abrirSesion('ensayo-en-sitio', 'ensayo-en-sitio');
    const abrirMs = Math.round(performance.now() - inicio);
    if (tono !== null) {
      await o.interlocutor.indicar('Escuche el videoportero: va a sonar un pitido de un segundo');
      await intercom.enviarAudio(tono);
      await esperar(1200);
    }
    await intercom.cerrarSesion('fin del ensayo');
    const detalle = [
      `canal ${String(audio.canal)} · ${audio.formato ?? 'formato no declarado'}`,
      'apertura del canal: proxy de KPI-33; el extremo a extremo se mide en la consola',
    ];
    if (abrirMs > UMBRAL_DE_AUDIO_MS) {
      return resultado(
        'audio',
        'fallo',
        `El canal tardó ${String(abrirMs)} ms en abrirse (límite 2 s)`,
        'Revise la red entre el Mac y el videoportero',
        detalle,
      );
    }
    if (tono === null) {
      return resultado(
        'audio',
        'ok',
        `Canal abierto en ${String(abrirMs)} ms y cerrado; el formato no es G.711 y no se envió pitido`,
        'Compruebe hablar y escuchar desde la consola de guardia',
        detalle,
      );
    }
    const oyo = await o.interlocutor.confirmar('¿Se oyó el pitido en el videoportero?');
    return oyo === true
      ? resultado(
          'audio',
          'ok',
          `Canal abierto en ${String(abrirMs)} ms y el pitido se oyó`,
          null,
          detalle,
        )
      : resultado(
          'audio',
          'fallo',
          oyo === false
            ? 'El canal se abrió, pero el pitido no se oyó'
            : 'El canal se abrió; nadie confirmó si el pitido se oyó',
          'Suba el volumen del altavoz en el panel web (Audio → volumen de salida) y repita',
          detalle,
        );
  } catch (error) {
    await intercom.cerrarSesion('fallo del ensayo').catch(() => undefined);
    return resultado('audio', 'fallo', motivoLegible(error), 'Repita tras corregir la causa');
  }
};
