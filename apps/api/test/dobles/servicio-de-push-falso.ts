import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { importJWK, jwtVerify } from 'jose';
import { descifrarComoNavegador, navegadorNuevo } from './navegador-con-push';
import type { NavegadorConPush } from './navegador-con-push';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · B6 · UN SERVICIO DE PUSH FALSO, EN 127.0.0.1
 *
 * Hace lo que hacen los de Google, Apple y Mozilla, y además comprueba lo que
 * ellos comprueban: la cabecera VAPID (firma ES256 con la llave pública de la
 * API, audiencia = SU origen, sin caducar), `Content-Encoding: aes128gcm` y
 * `TTL`. Y lo que ellos NO pueden hacer —por eso el cifrado sirve—: como aquí
 * vive también el navegador, DESCIFRA el aviso y lo guarda en claro para que
 * la prueba vea qué recibió cada suscripción.
 *
 * `responder(ruta, estado)` simula un 410 (suscripción caducada) o un 500.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface AvisoRecibido {
  readonly ruta: string;
  readonly contenido: { readonly titulo: string; readonly cuerpo: string; readonly ruta: string };
  readonly ttl: string | undefined;
  readonly urgencia: string | undefined;
}

export interface ServicioDePushFalso {
  readonly origen: string;
  readonly recibidos: AvisoRecibido[];
  readonly rechazos: string[];
  /** Un navegador nuevo, con su endpoint en este servicio. */
  suscribir(nombre: string): {
    readonly navegador: NavegadorConPush;
    readonly cuerpo: { endpoint: string; keys: { p256dh: string; auth: string } };
  };
  responder(ruta: string, estado: number): void;
  cerrar(): Promise<void>;
}

export const servicioDePushFalso = async (vapidPublica: string): Promise<ServicioDePushFalso> => {
  const navegadores = new Map<string, NavegadorConPush>();
  const estados = new Map<string, number>();
  const recibidos: AvisoRecibido[] = [];
  const rechazos: string[] = [];
  const pub = Buffer.from(vapidPublica, 'base64url');
  const llave = await importJWK(
    {
      kty: 'EC',
      crv: 'P-256',
      x: pub.subarray(1, 33).toString('base64url'),
      y: pub.subarray(33).toString('base64url'),
    },
    'ES256',
  );
  let origen = '';

  const atender = async (ruta: string, cabeceras: Record<string, unknown>, cuerpo: Buffer) => {
    const auth = String(cabeceras.authorization ?? '');
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(auth);
    if (m === null || m[2] !== vapidPublica) return 401;
    try {
      await jwtVerify(m[1] ?? '', llave, { audience: origen });
    } catch {
      return 403;
    }
    if (cabeceras['content-encoding'] !== 'aes128gcm' || cabeceras.ttl === undefined) return 400;
    const forzado = estados.get(ruta);
    if (forzado !== undefined) return forzado;
    const navegador = navegadores.get(ruta);
    if (navegador === undefined) return 404;
    const claro = descifrarComoNavegador(navegador, cuerpo);
    recibidos.push({
      ruta,
      contenido: JSON.parse(claro.toString()) as AvisoRecibido['contenido'],
      ttl: typeof cabeceras.ttl === 'string' ? cabeceras.ttl : undefined,
      urgencia: typeof cabeceras.urgency === 'string' ? cabeceras.urgency : undefined,
    });
    return 201;
  };

  const servidor: Server = createServer((peticion, respuesta) => {
    const partes: Buffer[] = [];
    peticion.on('data', (p: Buffer) => partes.push(p));
    peticion.on('end', () => {
      const ruta = peticion.url ?? '';
      void atender(ruta, peticion.headers, Buffer.concat(partes))
        .catch(() => 500)
        .then((estado) => {
          if (estado >= 400 && estado !== 404 && estado !== 410)
            rechazos.push(`${ruta} ${String(estado)}`);
          respuesta.writeHead(estado).end();
        });
    });
  });
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  origen = `http://127.0.0.1:${String((servidor.address() as AddressInfo).port)}`;

  return {
    origen,
    recibidos,
    rechazos,
    suscribir(nombre) {
      const navegador = navegadorNuevo();
      const ruta = `/push/${nombre}`;
      navegadores.set(ruta, navegador);
      return {
        navegador,
        cuerpo: {
          endpoint: `${origen}${ruta}`,
          keys: { p256dh: navegador.p256dh, auth: navegador.authB64 },
        },
      };
    },
    responder(ruta, estado) {
      estados.set(ruta, estado);
    },
    cerrar: () => new Promise<void>((listo) => servidor.close(() => listo())),
  };
};
