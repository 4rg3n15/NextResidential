import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensayarEquipo } from './ensayo-en-sitio';
import { lineasDelInforme, recuentoDe } from './informe-de-ensayo';
import type { EquipoDeEnsayo, EventosDeLaPlataforma, Interlocutor } from './tipos';
import {
  aperturasFisicasPor,
  equipoSimulado,
  escriturasSinCuerpoPor,
  FlujoEnVivo,
} from '../simulacion/equipo-simulado';
import { personasPor } from '../simulacion/personas-simuladas';
import type { GuionDeEquipo } from '../simulacion/equipo-simulado';
import { servidorRtspSimulado } from '../simulacion/servidor-rtsp';
import type { ServidorRtspSimulado } from '../simulacion/servidor-rtsp';
import { LIMITES_DE_FOTO_POR_OMISION } from '../terminal/foto-del-rostro';
import { jpegConMedidas } from '../simulacion/imagenes-de-prueba';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * J1 (15-L) · EL ENSAYO EN SITIO, CONTRA LOS EQUIPOS SIMULADOS
 *
 * El simulado es el de sitio —Digest con nonce que vence, 400 al cuerpo vacío,
 * «OK» sin accionar—, y la persona que mira la puerta es un doble que contesta
 * lo que el simulado HIZO (`aperturasFisicasPor`), no lo que se espera.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const CLAVE = 'p1';
const AHORA = new Date('2026-09-27T14:00:05Z');
const HORA_BOGOTA = '2026-09-27T09:00:00-05:00';
let rtsp: ServidorRtspSimulado;

beforeAll(async () => {
  rtsp = await servidorRtspSimulado({
    usuario: 'servicio',
    clave: CLAVE,
    canales: { '102': 'H264', '101': 'H265' },
  });
});
afterAll(async () => {
  await rtsp.cerrar();
});

/** Quien mira la puerta: contesta lo que el simulado accionó de verdad. */
const personaQueMira = (destino: string, oyePitido: boolean | null = true) => {
  const dichas: string[] = [];
  let antes = 0;
  const interlocutor: Interlocutor = {
    indicar: async (texto) => {
      dichas.push(texto);
      antes = aperturasFisicasPor.get(destino) ?? 0;
    },
    confirmar: async (pregunta) => {
      dichas.push(pregunta);
      if (/pitido/.test(pregunta)) return oyePitido;
      return (aperturasFisicasPor.get(destino) ?? 0) > antes;
    },
  };
  return { interlocutor, dichas };
};

const equipoDe = (
  familia: EquipoDeEnsayo['familia'],
  guion: Partial<GuionDeEquipo>,
  destino: string,
): EquipoDeEnsayo => ({
  familia,
  host: '127.0.0.1',
  usuario: 'servicio',
  clave: CLAVE,
  puerta: 1,
  canalDeVideo: '102',
  puertoRtsp: rtsp.puerto,
  peticion: equipoSimulado({
    familia,
    usuario: 'servicio',
    clave: CLAVE,
    destino,
    hora: HORA_BOGOTA,
    ...guion,
  }),
});

const ensayar = (
  equipo: EquipoDeEnsayo,
  interlocutor: Interlocutor,
  extra: { soloLectura?: boolean; plataforma?: EventosDeLaPlataforma; foto?: Uint8Array } = {},
) =>
  ensayarEquipo(
    {
      equipo,
      interlocutor,
      soloLectura: extra.soloLectura ?? false,
      ...(extra.plataforma === undefined ? {} : { plataforma: extra.plataforma }),
      ...(extra.foto === undefined ? {} : { foto: extra.foto }),
      esperaDeEventoMs: 2000,
      limitesDeFoto: LIMITES_DE_FOTO_POR_OMISION,
      zona: 'America/Bogota',
      ahora: () => AHORA,
    },
    async () => undefined,
  );

const estados = (pasos: readonly { paso: string; estado: string }[]) =>
  Object.fromEntries(pasos.map((p) => [p.paso, p.estado]));

describe('pnpm sitio:ensayo · los nueve pasos, equipo por equipo (J1)', () => {
  it('terminal: todo OK, con el evento en vivo por su propia suscripción', async () => {
    const destino = 'terminal-ensayo-1';
    const flujo = new FlujoEnVivo();
    const equipo = equipoDe('terminal', { enVivo: flujo }, destino);
    const { interlocutor, dichas } = personaQueMira(destino);
    const emitirAlPedirlo: Interlocutor = {
      ...interlocutor,
      indicar: async (t) => {
        await interlocutor.indicar(t);
        if (/rostro a la terminal/.test(t)) {
          flujo.emitir({
            eventType: 'AccessControllerEvent',
            dateTime: HORA_BOGOTA,
            AccessControllerEvent: { majorEventType: 5, subEventType: 75, currentEvent: true },
          });
        }
      },
    };
    const informe = await ensayar(equipo, emitirAlPedirlo);
    expect(estados(informe.pasos)).toEqual({
      conexion: 'ok',
      hora: 'ok',
      configuracion: 'ok',
      eventos: 'ok',
      apertura: 'ok',
      rostro: 'ok',
      video: 'ok',
      audio: 'no_aplica',
      // F2 · sin la base de la plataforma, los tiempos no se leen: se dice.
      verificacion: 'omitido',
    });
    expect(informe.pasos.map((p) => p.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(dichas).toContain('Acerque el rostro a la terminal. Se espera hasta 2 s');
    expect(aperturasFisicasPor.get(destino)).toBe(1);
    // La persona de prueba no se queda en el equipo.
    expect(personasPor.get(destino)?.size).toBe(0);
    // Ninguna escritura salió sin cuerpo (el 400 de la terminal, H-SITIO-15).
    expect(escriturasSinCuerpoPor.get(destino) ?? 0).toBe(0);
    // Lo leído de capacidades (decisión 8) se enseña.
    const config = informe.pasos.find((p) => p.paso === 'configuracion');
    expect(config?.detalle.join('\n')).toMatch(/personas: hasta 3000/);
    expect(config?.detalle.join('\n')).toMatch(/≤ 200 KB/);
  });

  it('videoportero: el timbre por la plataforma, la puerta y el pitido', async () => {
    const destino = 'videoportero-ensayo-1';
    const equipo = equipoDe(
      'videoportero',
      { aperturaRemota: true, canalesDeAudio: [{ id: 1, habilitado: true, codec: 'G.711ulaw' }] },
      destino,
    );
    const vistos: string[] = [];
    const plataforma: EventosDeLaPlataforma = {
      primeroDesde: async (host, desde, plazo) => {
        vistos.push(`${host}·${desde.toISOString()}·${String(plazo)}`);
        return { titulo: 'Llamada del videoportero', ocurridoEn: new Date('2026-09-27T14:00:09Z') };
      },
    };
    const { interlocutor, dichas } = personaQueMira(destino);
    const informe = await ensayar(equipo, interlocutor, { plataforma });
    expect(estados(informe.pasos)).toMatchObject({
      conexion: 'ok',
      eventos: 'ok',
      apertura: 'ok',
      rostro: 'no_aplica',
      video: 'ok',
      audio: 'ok',
    });
    expect(vistos).toEqual([`127.0.0.1·${AHORA.toISOString()}·2000`]);
    expect(dichas).toContain('Pulse el timbre del videoportero. Se espera hasta 2 s');
    expect(dichas).toContain('¿Se oyó el pitido en el videoportero?');
    const eventos = informe.pasos.find((p) => p.paso === 'eventos');
    expect(eventos?.causa).toBe('La plataforma registró «Llamada del videoportero» a las 09:00:09');
  });

  it('cámara: la talanquera se levanta y el vehículo llega a la plataforma', async () => {
    const destino = 'camara-ensayo-1';
    const equipo = equipoDe('camara', {}, destino);
    const { interlocutor } = personaQueMira(destino);
    const plataforma: EventosDeLaPlataforma = {
      primeroDesde: async () => ({ titulo: 'Placa ABC123', ocurridoEn: AHORA }),
    };
    const informe = await ensayar(equipo, interlocutor, { plataforma });
    expect(estados(informe.pasos)).toMatchObject({
      conexion: 'ok',
      hora: 'ok',
      eventos: 'ok',
      apertura: 'ok',
      rostro: 'no_aplica',
      video: 'ok',
      audio: 'no_aplica',
    });
    expect(aperturasFisicasPor.get(destino)).toBe(1);
  });

  it('solo lectura: ni puerta, ni rostro, ni audio; nada escrito en el equipo', async () => {
    const destino = 'terminal-ensayo-lectura';
    const equipo = equipoDe('terminal', {}, destino);
    const { interlocutor } = personaQueMira(destino);
    const informe = await ensayar(equipo, interlocutor, {
      soloLectura: true,
      plataforma: { primeroDesde: async () => null },
    });
    expect(estados(informe.pasos)).toMatchObject({
      apertura: 'omitido',
      rostro: 'omitido',
      eventos: 'fallo',
    });
    expect(aperturasFisicasPor.get(destino) ?? 0).toBe(0);
    expect(personasPor.get(destino)?.size ?? 0).toBe(0);
  });

  it('credencial rechazada: el paso 1 lo dice y NO se sigue presentando', async () => {
    const destino = 'terminal-ensayo-clave';
    let peticiones = 0;
    const base = equipoSimulado({
      familia: 'terminal',
      usuario: 'servicio',
      clave: 'otra',
      destino,
    });
    const equipo: EquipoDeEnsayo = {
      ...equipoDe('terminal', {}, destino),
      peticion: (async (u: string | URL, o?: RequestInit) => {
        peticiones += 1;
        return base(u, o);
      }) as typeof fetch,
    };
    const { interlocutor, dichas } = personaQueMira(destino);
    const informe = await ensayar(equipo, interlocutor);
    expect(informe.pasos[0]?.estado).toBe('fallo');
    expect(informe.pasos[0]?.accion).toMatch(/NO repita.*TERMINAL_USUARIO y TERMINAL_CLAVE/);
    expect(informe.pasos.slice(1).every((p) => p.estado === 'omitido')).toBe(true);
    expect(dichas).toEqual([]);
    // Activación sin credencial, desafío, UN intento autenticado: nada más.
    expect(peticiones).toBeLessThanOrEqual(3);
  });

  it('el informe imprime OK/FALLO con causa y acción, sin la clave', async () => {
    const destino = 'terminal-ensayo-informe';
    const equipo = equipoDe('terminal', { zonaHoraria: 'America/Bogota' }, destino);
    const { interlocutor } = personaQueMira(destino);
    const informe = await ensayar(equipo, interlocutor, {
      plataforma: { primeroDesde: async () => null },
      foto: jpegConMedidas(2000, 1500),
    });
    const texto = lineasDelInforme(informe, [CLAVE, 'servicio']).join('\n');
    expect(texto).toMatch(/4\. Suscripción de eventos\.+ FALLO — En 2 s no llegó ningún evento/);
    expect(texto).toMatch(/→ Mire la bitácora de la API/);
    expect(texto).toMatch(
      /6\. Alta y baja de un rostro de prueba\.+ FALLO — La foto de --foto no sirve/,
    );
    expect(texto).not.toMatch(/servicio/);
    expect(recuentoDe([informe]).fallo).toBe(2);
  });
});
