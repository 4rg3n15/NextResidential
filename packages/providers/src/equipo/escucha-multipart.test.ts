import { describe, expect, it } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import { EscuchaDeAlertStream } from './escucha-alertstream';
import { LectorDeJsonSeguido, LectorMultipart, boundaryDe, lectorPara } from './partes-del-flujo';
import { bloqueDesdeXml, esEventoEnVivo, motivoDeDescarte } from '../hikvision/contratos-de-evento';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-14 · UNA PERSONA PASA POR LA TERMINAL Y SE VE
 *
 * En sitio no quedó ni una línea. Dos defectos, los dos demostrables con la
 * guía de la terminal («Event Uploading» y «Receive Verification Requests»):
 *
 *  1. `currentEvent` viaja DENTRO de `AccessControllerEvent`, y se leía en la
 *     raíz: todo evento de la terminal era «histórico» y se descartaba mudo.
 *  2. El flujo es `multipart` con la FOTO dentro. Los bytes de la foto rompían
 *     el conteo de llaves y se tragaban los eventos siguientes.
 *
 * Los bloques de abajo copian la forma del ejemplo de la guía; los valores
 * son inventados.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const EVENTO_DE_LA_GUIA = {
  ipAddress: '192.0.2.10',
  channelID: 1,
  dateTime: '2026-09-26T13:41:56-05:00',
  eventType: 'AccessControllerEvent',
  eventState: 'active',
  eventDescription: 'Access Controller Event',
  AccessControllerEvent: {
    deviceName: 'Access Controller',
    majorEventType: 5,
    subEventType: 75,
    name: 'visitante',
    employeeNoString: 'plantilla-1',
    serialNo: 1866,
    currentEvent: true,
    frontSerialNo: 1865,
    picturesNumber: 1,
  },
};

/** Una «foto» que contiene justo lo que rompía el analizador anterior. */
const FOTO = new Uint8Array([
  0xff, 0xd8, 0x7b, 0x22, 0x7b, 0x7b, 0x22, 0x0d, 0x0a, 0x2d, 0x2d, 0x7d, 0x00, 0xff, 0xd9,
]);

const codificar = (t: string): Uint8Array => new TextEncoder().encode(t);
const unir = (...partes: Uint8Array[]): Uint8Array => {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const r = new Uint8Array(total);
  let i = 0;
  for (const p of partes) {
    r.set(p, i);
    i += p.length;
  }
  return r;
};

const parte = (tipo: string, cuerpo: Uint8Array, nombre = 'x'): Uint8Array =>
  unir(
    codificar(
      `--frontera\r\nContent-Disposition: form-data; name="${nombre}"\r\n` +
        `Content-Type: ${tipo}\r\nContent-Length: ${String(cuerpo.length)}\r\n\r\n`,
    ),
    cuerpo,
    codificar('\r\n'),
  );

const flujoDeLaTerminal = (): Uint8Array =>
  unir(
    parte(
      'application/xml',
      codificar('<SubscribeEventResponse><id>1</id></SubscribeEventResponse>'),
    ),
    parte(
      'application/json',
      codificar(JSON.stringify(EVENTO_DE_LA_GUIA)),
      'AccessControllerEvent',
    ),
    parte('image/jpeg', FOTO, 'Picture'),
    parte(
      'application/json',
      codificar(JSON.stringify({ eventType: 'heartBeat', dateTime: '2026-09-26T13:42:00-05:00' })),
    ),
    parte(
      'application/json',
      codificar(
        JSON.stringify({
          ...EVENTO_DE_LA_GUIA,
          AccessControllerEvent: {
            ...EVENTO_DE_LA_GUIA.AccessControllerEvent,
            employeeNoString: 'plantilla-2',
          },
        }),
      ),
    ),
  );

const traza = (): Bitacora & {
  lineas: { nivel: string; mensaje: string; c: Record<string, unknown> }[];
} => {
  const lineas: { nivel: string; mensaje: string; c: Record<string, unknown> }[] = [];
  return {
    lineas,
    registrar: (nivel, mensaje, c) => lineas.push({ nivel, mensaje, c: { ...(c ?? {}) } }),
  };
};

/** Un equipo que contesta la suscripción con el flujo dado, troceado. */
const equipoQueEmite = (cuerpo: Uint8Array, tamanoDeTrozo: number): typeof fetch =>
  (async (_e: string | URL, init?: RequestInit) => {
    if (new Headers(init?.headers).get('authorization') === null) {
      return new Response('', {
        status: 401,
        headers: { 'www-authenticate': 'Digest realm="r", nonce="n", qop="auth"' },
      });
    }
    let i = 0;
    return new Response(
      new ReadableStream<Uint8Array>({
        pull(c) {
          if (i >= cuerpo.length) return c.close();
          c.enqueue(cuerpo.slice(i, i + tamanoDeTrozo));
          i += tamanoDeTrozo;
        },
      }),
      { status: 200, headers: { 'content-type': 'multipart/form-data; boundary=frontera' } },
    );
  }) as typeof fetch;

const escuchar = async (peticion: typeof fetch, t: Bitacora): Promise<string[]> => {
  const control = new AbortController();
  const escucha = new EscuchaDeAlertStream({
    host: 'terminal.invalid',
    usuario: 'u',
    clave: 'c',
    peticion,
    traza: t,
    dispositivoId: 'terminal-1',
    familia: 'terminal',
    transporte: 'subscribeEvent',
    esperar: async () => control.abort(),
    azar: () => 0.5,
  });
  const personas: string[] = [];
  for await (const e of escucha.escuchar(control.signal)) personas.push(e.personaId ?? '?');
  return personas;
};

describe('H-SITIO-14 · el evento de la terminal, como lo da la guía, es EN VIVO', () => {
  it('`currentEvent` dentro de AccessControllerEvent cuenta', () => {
    expect(esEventoEnVivo(EVENTO_DE_LA_GUIA)).toBe(true);
    expect(motivoDeDescarte(EVENTO_DE_LA_GUIA)).toBeNull();
  });

  it('sin currentEvent en ningún sitio sigue siendo histórico, y se DICE por qué', () => {
    const sin = { eventType: 'AccessControllerEvent', AccessControllerEvent: {} };
    expect(esEventoEnVivo(sin)).toBe(false);
    expect(motivoDeDescarte(sin)).toMatch(/sin currentEvent/);
    expect(motivoDeDescarte({ eventType: 'heartBeat' })).toBe('latido del equipo');
  });
});

describe('H-SITIO-14 · el flujo multipart con foto', () => {
  it.each([1, 7, 64, 100_000])(
    'troceado de %i en %i bytes, entrega las DOS personas y ninguna foto',
    async (tamano) => {
      const t = traza();
      const personas = await escuchar(equipoQueEmite(flujoDeLaTerminal(), tamano), t);
      expect(personas).toEqual(['plantilla-1', 'plantilla-2']);
    },
  );

  it('cada paso deja su línea: apertura, confirmación, bloques, latido, imagen y cierre', async () => {
    const t = traza();
    await escuchar(equipoQueEmite(flujoDeLaTerminal(), 13), t);
    const mensajes = t.lineas.map((l) => l.mensaje);
    expect(mensajes).toContain('escucha: conexión abierta');
    expect(mensajes).toContain('escucha: el equipo confirmó la suscripción');
    expect(mensajes.filter((m) => m === 'escucha: bloque recibido')).toHaveLength(2);
    expect(mensajes).toContain('escucha: latido del equipo');
    expect(mensajes).toContain('escucha: imagen del evento, no se procesa');
    expect(mensajes).toContain('escucha: el equipo cerró el flujo');
    const recibido = t.lineas.find((l) => l.mensaje === 'escucha: bloque recibido');
    expect(recibido?.c['eventType']).toBe('AccessControllerEvent');
    expect(recibido?.c['dispositivoId']).toBe('terminal-1');
  });

  it('un 401 que no se resuelve se registra con su estado y no pasa por evento', async () => {
    const t = traza();
    const rechaza = (async () =>
      new Response('<userCheck><statusValue>401</statusValue></userCheck>', {
        status: 401,
        headers: { 'www-authenticate': 'Digest realm="r", nonce="n", qop="auth"' },
      })) as typeof fetch;
    expect(await escuchar(rechaza, t)).toEqual([]);
    const rechazo = t.lineas.find((l) => l.mensaje === 'escucha: el equipo rechazó la conexión');
    expect(rechazo?.c['estadoHttp']).toBe(401);
    // A5 (15-L) · y la escucha SE DETIENE: reconectar con la clave rechazada
    // es sumar inicios de sesión fallidos hasta que el equipo bloquee la IP.
    expect(t.lineas.some((l) => /credencial rechazada — se DETIENE/.test(l.mensaje))).toBe(true);
    expect(t.lineas.some((l) => l.mensaje === 'escucha: se reconecta')).toBe(false);
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ANEXO 15-K (4) · ¿EXPLICA EL JPEG DENTRO DEL FLUJO H-SITIO-14?
 *
 * Un JPEG de verdad —el gris sintético de 64×64 de la carga de prueba del
 * guion, sin rostro— lleva UNA comilla (0x22) suelta entre sus bytes. El
 * lector de antes (texto y llaves, que sigue siendo el de un flujo no
 * multipart) la toma por el comienzo de una cadena que no se cierra: todo lo
 * que viene después de la foto deja de ser JSON para él, y se pierde sin una
 * línea. La «foto» de arriba no lo demostraba: sus comillas van a pares y el
 * lector anterior se recuperaba.
 *
 * Respuesta: SOLO, no. El primer evento de cada conexión llega ANTES de la
 * foto y el lector anterior lo leía; lo perdía el otro defecto (`currentEvent`
 * en la raíz). Juntos sí explican «ni una línea»: el primero, por
 * `currentEvent`; todos los siguientes, por la foto. Corregido sólo el primero,
 * la visita habría visto UN paso y ninguno más.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const JPEG_REAL = Uint8Array.from(
  Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCABAAEADASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/9k=',
    'base64',
  ),
);

describe('anexo 15-K (4) · un JPEG real dentro del flujo, y H-SITIO-14', () => {
  const eventoDe = (persona: string): Uint8Array =>
    codificar(
      JSON.stringify({
        ...EVENTO_DE_LA_GUIA,
        AccessControllerEvent: {
          ...EVENTO_DE_LA_GUIA.AccessControllerEvent,
          employeeNoString: persona,
        },
      }),
    );
  const flujo = (): Uint8Array =>
    unir(
      parte('application/json', eventoDe('p1'), 'AccessControllerEvent'),
      parte('image/jpeg', JPEG_REAL, 'Picture'),
      parte('application/json', eventoDe('p2'), 'AccessControllerEvent'),
      parte('application/json', eventoDe('p3'), 'AccessControllerEvent'),
    );
  const personas = (partes: { bytes: Uint8Array }[]): string[] =>
    partes.flatMap((p) => {
      try {
        const o = JSON.parse(new TextDecoder().decode(p.bytes)) as {
          AccessControllerEvent?: { employeeNoString?: string };
        };
        return o.AccessControllerEvent?.employeeNoString ?? [];
      } catch {
        return [];
      }
    });

  it('el JPEG real es un JPEG y lleva un número IMPAR de comillas: basta una', () => {
    expect([JPEG_REAL[0], JPEG_REAL[1]]).toEqual([0xff, 0xd8]);
    expect(JPEG_REAL.filter((b) => b === 0x22).length % 2).toBe(1);
  });

  it('el lector de antes (texto y llaves) lee el evento previo a la foto y PIERDE todos los siguientes', () => {
    expect(personas(new LectorDeJsonSeguido().alimentar(flujo()))).toEqual(['p1']);
  });

  it('el lector multipart los lee los tres, con la foto en medio', () => {
    expect(personas(new LectorMultipart('frontera').alimentar(flujo()))).toEqual([
      'p1',
      'p2',
      'p3',
    ]);
  });

  it('y el primero, que sí llegaba, lo descartaba el OTRO defecto: currentEvent se buscaba en la raíz', () => {
    const enLaRaizNo = Object.fromEntries(
      Object.entries(EVENTO_DE_LA_GUIA.AccessControllerEvent).filter(([k]) => k !== 'currentEvent'),
    );
    // Es lo que veía el código anterior: sin `currentEvent` en la raíz, «histórico».
    expect('currentEvent' in EVENTO_DE_LA_GUIA).toBe(false);
    expect(esEventoEnVivo({ ...EVENTO_DE_LA_GUIA, AccessControllerEvent: enLaRaizNo })).toBe(false);
    expect(esEventoEnVivo(EVENTO_DE_LA_GUIA)).toBe(true);
  });
});

describe('el lector de partes', () => {
  it('lee el boundary de la cabecera, con y sin comillas', () => {
    expect(boundaryDe('multipart/form-data; boundary=AaB03x')).toBe('AaB03x');
    expect(boundaryDe('multipart/mixed; boundary="frontera"')).toBe('frontera');
    expect(boundaryDe('application/json')).toBeNull();
    expect(boundaryDe(null)).toBeNull();
  });

  it('sin Content-Length corta en el siguiente delimitador', () => {
    const lector = new LectorMultipart('b');
    const partes = lector.alimentar(
      codificar(
        '--b\r\nContent-Type: application/json\r\n\r\n{"a":1}\r\n--b\r\nContent-Type: application/json\r\n\r\n{"a":2}\r\n--b--',
      ),
    );
    expect(partes.map((p) => new TextDecoder().decode(p.bytes))).toEqual(['{"a":1}', '{"a":2}']);
  });

  it('un flujo que no es multipart cae al JSON seguido de antes', () => {
    const lector = lectorPara('application/json');
    const partes = lector.alimentar(codificar('{"eventType":"a"}{"eventType":"b"}'));
    expect(partes).toHaveLength(2);
  });

  it('una parte XML de evento se lee; la respuesta de suscripción se reconoce', () => {
    expect(bloqueDesdeXml('<SubscribeEventResponse/>')).toBe('respuesta_de_suscripcion');
    const b = bloqueDesdeXml(
      '<EventNotificationAlert><eventType>AccessControllerEvent</eventType>' +
        '<employeeNoString>p9</employeeNoString><currentEvent>true</currentEvent></EventNotificationAlert>',
    );
    expect(b !== null && b !== 'respuesta_de_suscripcion' && esEventoEnVivo(b)).toBe(true);
    expect(bloqueDesdeXml('<Otra/>')).toBeNull();
  });
});
