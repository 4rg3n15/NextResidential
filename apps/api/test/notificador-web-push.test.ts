import { describe, expect, it } from 'vitest';
import { createECDH } from 'node:crypto';
import type { Bitacora } from '@ncr/domain-core';
import { NotificadorWebPush } from '../src/eventos/infraestructura/web-push/notificador-web-push';
import { NotificadorPushSinLlaves } from '../src/eventos/infraestructura/web-push/notificador-sin-llaves';
import { FirmaVapid } from '../src/eventos/infraestructura/web-push/vapid';
import type {
  SuscripcionWebPush,
  SuscripcionesWebPush,
} from '../src/eventos/infraestructura/web-push/suscripciones-pg';
import { descifrarComoNavegador, navegadorNuevo } from './dobles/navegador-con-push';
import type { NavegadorConPush } from './dobles/navegador-con-push';

/**
 * 15-R · B1 · lo que el emisor cuenta y lo que hace con cada respuesta del
 * servicio de push. El extremo a extremo con la base está en
 * `web-push-pg.e2e.test.ts`; aquí, las ramas que un servicio real no deja
 * provocar a voluntad.
 */
const par = createECDH('prime256v1');
par.generateKeys();
const firma = new FirmaVapid({
  publica: par.getPublicKey('base64url'),
  privada: par.getPrivateKey('base64url'),
  sujeto: 'mailto:pruebas@grupocontrol.co',
});

interface Registro {
  readonly nivel: string;
  readonly mensaje: string;
  readonly contexto: unknown;
}

const montar = (
  aparatos: readonly (SuscripcionWebPush & { navegador: NavegadorConPush })[],
  responder: (url: string) => Promise<number>,
) => {
  const retiradas: string[] = [];
  const registros: Registro[] = [];
  const llegados: { url: string; claro: string }[] = [];
  const bitacora: Bitacora = {
    registrar: (nivel, mensaje, contexto) => {
      registros.push({ nivel, mensaje, contexto });
    },
  };
  const suscripciones: SuscripcionesWebPush = {
    deVivienda: async () => aparatos,
    retirar: async (_cop, id) => {
      retiradas.push(id);
    },
  };
  const notificador = new NotificadorWebPush(suscripciones, firma, {
    permitido: (e) => e.startsWith('https://fcm.googleapis.com/'),
    enviar: async (url, init) => {
      const aparato = aparatos.find((a) => a.endpoint === String(url));
      if (aparato !== undefined && init?.body instanceof Buffer) {
        llegados.push({
          url: String(url),
          claro: descifrarComoNavegador(aparato.navegador, init.body).toString(),
        });
      }
      return new Response(null, { status: await responder(String(url)) });
    },
    reloj: { ahora: () => new Date() },
    bitacora,
    ttlSegundos: 900,
    plazoMs: 1000,
  });
  return { notificador, retiradas, registros, llegados };
};

const aparato = (id: string, endpoint: string) => {
  const navegador = navegadorNuevo();
  return { id, endpoint, p256dh: navegador.p256dh, auth: navegador.authB64, navegador };
};

describe('NotificadorWebPush', () => {
  it('cuenta enviados, fallidos y retirados de verdad; nunca toca un endpoint fuera de la lista', async () => {
    const lista = [
      aparato('ok', 'https://fcm.googleapis.com/ok'),
      aparato('muerto', 'https://fcm.googleapis.com/muerto'),
      aparato('caido', 'https://fcm.googleapis.com/caido'),
      aparato('desconocido', 'https://fcm.googleapis.com/404'),
      aparato('ajeno', 'https://metadata.google.internal/x'),
      aparato('red', 'https://fcm.googleapis.com/red'),
    ];
    const tocados: string[] = [];
    const { notificador, retiradas, registros } = montar(lista, async (url) => {
      tocados.push(url);
      if (url.endsWith('/red')) throw new TypeError('fetch failed');
      if (url.endsWith('/muerto')) return 410;
      if (url.endsWith('/404')) return 404;
      if (url.endsWith('/caido')) return 500;
      return 201;
    });
    const enviados = await notificador.aVivienda('cop', 'viv', 'Título', 'Cuerpo', 'historial');
    expect(enviados).toBe(1);
    expect(retiradas.sort()).toEqual(['desconocido', 'muerto']);
    expect(tocados).not.toContain('https://metadata.google.internal/x');
    const resumen = registros.find((r) => r.mensaje === 'aviso al residente por Web Push');
    expect(resumen?.contexto).toMatchObject({
      suscritos: 6,
      enviados: 1,
      fallidos: 3,
      retirados: 2,
    });
    // El texto del aviso NO va a la bitácora (§2.7.8).
    expect(JSON.stringify(registros)).not.toContain('Cuerpo');
  });

  it('el aviso lleva la pantalla que abre, y un cuerpo enorme se acorta hasta caber', async () => {
    const lista = [aparato('a', 'https://fcm.googleapis.com/a')];
    const { notificador, llegados } = montar(lista, async () => 201);
    await notificador.aVivienda('cop', 'viv', 'T', '🚪'.repeat(5000), 'historial');
    const claro = JSON.parse(llegados[0]?.claro ?? '{}') as { ruta: string; cuerpo: string };
    expect(claro.ruta).toBe('/mi/historial');
    expect(claro.cuerpo.endsWith('…')).toBe(true);
    expect(Buffer.byteLength(llegados[0]?.claro ?? '')).toBeLessThanOrEqual(4096 - 103);
  });

  it('sin aparatos suscritos devuelve 0 y no llama a nadie', async () => {
    const { notificador, llegados } = montar([], async () => 201);
    expect(await notificador.aVivienda('cop', 'viv', 'T', 'C')).toBe(0);
    expect(llegados).toEqual([]);
  });
});

describe('NotificadorPushSinLlaves', () => {
  it('devuelve 0 —no le llegó a nadie— y lo dice en cada aviso', async () => {
    const registros: string[] = [];
    const n = new NotificadorPushSinLlaves({ registrar: (_n, m) => void registros.push(m) });
    expect(await n.aVivienda('cop', 'viv', 'T')).toBe(0);
    expect(registros).toEqual(['aviso al residente NO enviado: Web Push sin llaves VAPID']);
  });
});
