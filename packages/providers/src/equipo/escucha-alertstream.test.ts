import { describe, expect, it, vi } from 'vitest';
import {
  EscuchaDeAlertStream,
  extraerObjetos,
  transporteSegunCapacidades,
} from './escucha-alertstream';
import { capacidadesDeclaradas } from '../nucleo/capacidades';

const bloque = (extra: Record<string, unknown>): string =>
  JSON.stringify({ eventType: 'doorbell', dateTime: '2026-09-22T10:00:00Z', ...extra });

/** Respuesta en flujo que entrega los trozos que se le den, en ese orden. */
const flujoDe = (trozos: readonly string[]): Response => {
  const codificador = new TextEncoder();
  let i = 0;
  return {
    status: 200,
    ok: true,
    headers: new Headers(),
    body: {
      getReader: () => ({
        read: async () =>
          i < trozos.length
            ? { done: false, value: codificador.encode(trozos[i++]) }
            : { done: true, value: undefined },
        cancel: async () => undefined,
      }),
    },
  } as unknown as Response;
};

describe('extraerObjetos', () => {
  it('reensambla un objeto partido entre dos lecturas', () => {
    // Es el caso normal, no el raro: el flujo llega en trozos que no respetan
    // los límites de los bloques.
    const primera = extraerObjetos('{"a":1,"b":');
    expect(primera.objetos).toHaveLength(0);
    const segunda = extraerObjetos(`${primera.resto}2}`);
    expect(segunda.objetos).toEqual(['{"a":1,"b":2}']);
  });

  it('NO se parte con una llave dentro de una cadena', () => {
    // Contar llaves a secas cortaría este objeto por la mitad y lo tiraría.
    const { objetos } = extraerObjetos('{"texto":"tiene { y } dentro"}');
    expect(objetos).toHaveLength(1);
    expect(JSON.parse(objetos[0]!)).toEqual({ texto: 'tiene { y } dentro' });
  });

  it('respeta las comillas escapadas', () => {
    const { objetos } = extraerObjetos('{"t":"comilla \\" y llave {"}');
    expect(objetos).toHaveLength(1);
  });

  it('saca varios objetos seguidos y deja el incompleto', () => {
    const { objetos, resto } = extraerObjetos('{"a":1}{"b":2}{"c":');
    expect(objetos).toHaveLength(2);
    expect(resto).toBe('{"c":');
  });
});

describe('el volcado histórico NO llega al sistema', () => {
  const montar = (trozos: readonly string[]) => {
    const peticion = vi.fn(async () => flujoDe(trozos));
    const escucha = new EscuchaDeAlertStream({
      host: 'equipo.invalid',
      usuario: 'u',
      clave: 'c',
      dispositivoId: 'terminal-1',
      familia: 'terminal',
      peticion: peticion as unknown as typeof fetch,
      esperar: async () => undefined,
      azar: () => 0.5,
    });
    return { escucha, peticion };
  };

  it('descarta lo histórico, lo CUENTA, y emite sólo lo vivo', async () => {
    const { escucha } = montar([
      bloque({ currentEvent: false }),
      bloque({ currentEvent: false }),
      bloque({ currentEvent: true, channelID: 1 }),
    ]);

    const cancelar = new AbortController();
    const vistos = [];
    for await (const evento of escucha.escuchar(cancelar.signal)) {
      vistos.push(evento);
      cancelar.abort();
    }

    expect(vistos).toHaveLength(1);
    expect(vistos[0]?.enVivo).toBe(true);
    // El número es lo único que distingue «el equipo está mudo» de «volcó 412
    // viejos y los tiramos todos».
    expect(escucha.historicosDescartados).toBe(2);
  });

  it('un bloque SIN `currentEvent` cuenta como histórico', async () => {
    // Dirección segura: si un firmware omitiera el campo, el coste de tratarlo
    // como historial es que un timbre no suene; el contrario es escribir
    // eventos falsos en una tabla que no admite borrado.
    const { escucha } = montar([bloque({}), bloque({ currentEvent: true })]);
    const cancelar = new AbortController();
    let vivos = 0;
    for await (const evento of escucha.escuchar(cancelar.signal)) {
      expect(evento.enVivo).toBe(true);
      vivos += 1;
      cancelar.abort();
    }
    expect(vivos).toBe(1);
    expect(escucha.historicosDescartados).toBe(1);
  });

  it('un bloque ilegible se tira sin romper el flujo', async () => {
    const { escucha } = montar(['{esto no es json}', bloque({ currentEvent: true })]);
    const cancelar = new AbortController();
    const vistos = [];
    for await (const evento of escucha.escuchar(cancelar.signal)) {
      vistos.push(evento);
      cancelar.abort();
    }
    expect(vistos).toHaveLength(1);
  });

  it('acepta el bloque envuelto en `EventNotificationAlert`', async () => {
    const envuelto = JSON.stringify({
      EventNotificationAlert: { eventType: 'doorbell', currentEvent: true, channelID: 2 },
    });
    const { escucha } = montar([envuelto]);
    const cancelar = new AbortController();
    const vistos = [];
    for await (const evento of escucha.escuchar(cancelar.signal)) {
      vistos.push(evento);
      cancelar.abort();
    }
    expect(vistos[0]?.clase).toBe('timbre');
  });

  it('reconecta cuando el flujo termina, y con espera creciente', async () => {
    const esperas: number[] = [];
    let vueltas = 0;
    const peticion = vi.fn(async () => {
      vueltas += 1;
      // Las dos primeras conexiones no entregan nada: se cae y reintenta.
      return flujoDe(vueltas < 3 ? [] : [bloque({ currentEvent: true })]);
    });
    const escucha = new EscuchaDeAlertStream({
      host: 'equipo.invalid',
      usuario: 'u',
      clave: 'c',
      dispositivoId: 'terminal-1',
      familia: 'terminal',
      peticion: peticion as unknown as typeof fetch,
      esperar: async (ms) => {
        esperas.push(ms);
      },
      azar: () => 0.5,
    });

    const cancelar = new AbortController();
    for await (const evento of escucha.escuchar(cancelar.signal)) {
      expect(evento.enVivo).toBe(true);
      cancelar.abort();
    }

    expect(esperas.length).toBeGreaterThanOrEqual(2);
    // Creciente: sin esto, un equipo caído se martillea cien veces por segundo.
    expect(esperas[1]).toBeGreaterThan(esperas[0]!);
  });

  it('la espera se TOPA: no crece sin límite aunque el equipo siga caído', async () => {
    // Sin techo, un equipo caído toda la noche acabaría con esperas de horas y
    // el primer timbre después de volver llegaría cuando ya no hay nadie.
    const esperas: number[] = [];
    const cancelar = new AbortController();
    const escucha = new EscuchaDeAlertStream({
      host: 'equipo.invalid',
      usuario: 'u',
      clave: 'c',
      dispositivoId: 't',
      familia: 'terminal',
      esperaMaximaMs: 4000,
      peticion: (async () => flujoDe([])) as unknown as typeof fetch,
      esperar: async (ms) => {
        esperas.push(ms);
        if (esperas.length >= 8) cancelar.abort();
      },
      azar: () => 0.5,
    });

    for await (const evento of escucha.escuchar(cancelar.signal)) {
      expect.unreachable(`no debía emitir nada y emitió ${evento.clase}`);
    }

    expect(Math.max(...esperas)).toBeLessThanOrEqual(4000);
  });

  it('la dispersión evita que veinte equipos vuelvan a la vez', async () => {
    const esperas: number[] = [];
    const peticion = vi.fn(async () => flujoDe([]));
    const cancelar = new AbortController();
    let llamadas = 0;
    const escucha = new EscuchaDeAlertStream({
      host: 'equipo.invalid',
      usuario: 'u',
      clave: 'c',
      dispositivoId: 't',
      familia: 'terminal',
      peticion: peticion as unknown as typeof fetch,
      esperar: async (ms) => {
        esperas.push(ms);
        // La escucha reconecta SOLA y para siempre: sin este corte la prueba
        // gira hasta agotar la memoria del proceso. Se vio.
        if (esperas.length >= 4) cancelar.abort();
      },
      // Un azar en los dos extremos deja ver los bordes del ±25 %.
      azar: () => (llamadas++ % 2 === 0 ? 0 : 1),
    });

    // Nunca entrega nada: el flujo se cierra vacío una y otra vez.
    for await (const evento of escucha.escuchar(cancelar.signal)) {
      expect.unreachable(`no debía emitir nada y emitió ${evento.clase}`);
    }

    expect(esperas).toHaveLength(4);
    // Dos esperas distintas para la misma base: eso es la dispersión.
    expect(esperas[0]).not.toBe(Math.round(esperas[0]! / 0.75));
    expect(new Set(esperas).size).toBeGreaterThan(1);
  });
});

describe('6.5 · el tercer transporte: suscripción, elegido por CAPACIDAD', () => {
  it('con `suscripcionDeEventos = si` se elige subscribeEvent; si no, alertStream', () => {
    expect(transporteSegunCapacidades(capacidadesDeclaradas({ suscripcionDeEventos: 'si' }))).toBe(
      'subscribeEvent',
    );
    expect(transporteSegunCapacidades(capacidadesDeclaradas({ suscripcionDeEventos: 'no' }))).toBe(
      'alertStream',
    );
    // DESCONOCIDA no es sí: se queda en el transporte que no exige capacidad.
    expect(transporteSegunCapacidades(capacidadesDeclaradas({}))).toBe('alertStream');
  });

  it('la suscripción abre el flujo con POST y un cuerpo, y filtra lo histórico igual', async () => {
    const llamadas: { url: string; metodo: string; cuerpo: unknown }[] = [];
    const peticion = vi.fn(async (url: string, opciones: RequestInit) => {
      llamadas.push({ url, metodo: opciones.method ?? 'GET', cuerpo: opciones.body });
      return flujoDe([bloque({ currentEvent: false }), bloque({ currentEvent: true })]);
    });
    const escucha = new EscuchaDeAlertStream({
      host: 'equipo.invalid',
      usuario: 'u',
      clave: 'c',
      dispositivoId: 'portero-1',
      familia: 'videoportero',
      transporte: 'subscribeEvent',
      peticion: peticion as unknown as typeof fetch,
      esperar: async () => undefined,
      azar: () => 0.5,
    });
    const cancelar = new AbortController();
    const vistos = [];
    for await (const evento of escucha.escuchar(cancelar.signal)) {
      vistos.push(evento);
      cancelar.abort();
    }
    expect(escucha.transporte).toBe('subscribeEvent');
    expect(llamadas[0]?.url).toMatch(/subscribeEvent$/);
    expect(llamadas[0]?.metodo).toBe('POST');
    expect(String(llamadas[0]?.cuerpo)).toContain('SubscribeEvent');
    expect(vistos).toHaveLength(1);
    expect(escucha.historicosDescartados).toBe(1);
  });
});

describe('A4 · detener durante la espera entre reintentos', () => {
  it('termina en el acto: no queda un temporizador de medio minuto colgando', async () => {
    let esperasPedidas = 0;
    const escucha = new EscuchaDeAlertStream({
      host: 'equipo.invalid',
      usuario: 'u',
      clave: 'c',
      dispositivoId: 'd-1',
      familia: 'videoportero',
      // El flujo termina en el acto: la escucha entra en espera de reconexión.
      peticion: (async () => new Response('', { status: 200 })) as unknown as typeof fetch,
      // Una espera que NUNCA resuelve por sí sola: sólo la cancelación la corta.
      esperar: async () => {
        esperasPedidas += 1;
        await new Promise<void>(() => undefined);
      },
    });
    const control = new AbortController();
    const recorrido = (async () => {
      for await (const evento of escucha.escuchar(control.signal)) void evento;
    })();
    // Se deja llegar a la espera y se cancela.
    await new Promise((listo) => setTimeout(listo, 5));
    expect(esperasPedidas).toBeGreaterThan(0);
    control.abort();
    await expect(
      Promise.race([
        recorrido,
        new Promise((_, no) => setTimeout(() => no(new Error('colgado')), 500)),
      ]),
    ).resolves.toBeUndefined();
  });
});
