import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AvisosEnEsteAparato } from './avisos-en-este-aparato';
import { COP, Envoltura, escrituras } from '../pruebas';

/**
 * 15-R · B4 · la consola del residente activa los avisos Web Push (ADR-036).
 *
 * jsdom no trae `PushManager` ni `Notification`: se instalan dobles mínimos con
 * la forma de la API del navegador, y lo que se comprueba es el contrato que
 * importa —el permiso SÓLO tras el clic, la suscripción con la llave pública
 * que da la API, la entrega a `/mi/notificaciones/web-push`, y la explicación
 * de iPhone cuando no hay `PushManager`—.
 */
const CLAVE =
  'BIpDgqaW2PDmYJ_5vAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const respuesta = (cuerpo: unknown, estado = 200): Response =>
  new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json' },
  });

const servidor = (disponible: boolean) =>
  vi.fn(async (entrada: Request) => {
    const ruta = new URL(entrada.url).pathname;
    if (entrada.method === 'GET' && ruta.endsWith('/mi/notificaciones/web-push')) {
      return respuesta({ disponible, clavePublica: disponible ? CLAVE : null });
    }
    if (entrada.method === 'POST') return respuesta({ id: 'x', anulada: true }, 201);
    return respuesta({ estado: 404, mensaje: 'no' }, 404);
  });

let permiso: NotificationPermission;
const pedirPermiso = vi.fn(async () => {
  permiso = 'granted';
  return permiso;
});
const suscribir = vi.fn(async (_o: PushSubscriptionOptionsInit) => ({
  endpoint: 'https://fcm.googleapis.com/fcm/send/aparato',
  toJSON: () => ({
    endpoint: 'https://fcm.googleapis.com/fcm/send/aparato',
    keys: { p256dh: 'B'.repeat(87), auth: 'Q'.repeat(22) },
  }),
  unsubscribe: async () => true,
}));

const instalarNavegadorConPush = (): void => {
  permiso = 'default';
  vi.stubGlobal('PushManager', function PushManager() {});
  vi.stubGlobal(
    'Notification',
    Object.assign(function Notification() {}, {
      get permission() {
        return permiso;
      },
      requestPermission: pedirPermiso,
    }),
  );
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: { getSubscription: async () => null, subscribe: suscribir },
      }),
    },
  });
};

beforeEach(() => {
  pedirPermiso.mockClear();
  suscribir.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('15-R · avisos en este aparato', () => {
  it('no pide permiso al cargar; lo pide al pulsar, se suscribe con la llave de la API y la entrega', async () => {
    instalarNavegadorConPush();
    const fetch = servidor(true);
    vi.stubGlobal('fetch', fetch);
    render(
      <Envoltura>
        <AvisosEnEsteAparato copropiedadId={COP} />
      </Envoltura>,
    );
    const boton = await screen.findByRole('button', { name: /Activar avisos en este aparato/ });
    await waitFor(() => expect((boton as HTMLButtonElement).disabled).toBe(false));
    expect(pedirPermiso).not.toHaveBeenCalled();

    fireEvent.click(boton);
    await screen.findByText('Los avisos llegan a este aparato.');
    expect(pedirPermiso).toHaveBeenCalledTimes(1);
    const opciones = suscribir.mock.calls[0]?.[0];
    expect(opciones?.userVisibleOnly).toBe(true);
    expect(Buffer.from(opciones?.applicationServerKey as Uint8Array).toString('base64url')).toBe(
      CLAVE,
    );
    expect(await escrituras(fetch)).toEqual([
      {
        metodo: 'POST',
        ruta: `/copropiedades/${COP}/mi/notificaciones/web-push`,
        cuerpo: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/aparato',
          keys: { p256dh: 'B'.repeat(87), auth: 'Q'.repeat(22) },
        },
      },
    ]);
  });

  it('en un iPhone sin la consola instalada explica cómo instalarla, sin botón inútil', async () => {
    vi.stubGlobal('fetch', servidor(true));
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
    );
    render(
      <Envoltura>
        <AvisosEnEsteAparato copropiedadId={COP} />
      </Envoltura>,
    );
    await screen.findByText(/Añadir a pantalla de inicio/);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('sin llaves VAPID en la API lo dice, y no ofrece activar nada', async () => {
    instalarNavegadorConPush();
    vi.stubGlobal('fetch', servidor(false));
    render(
      <Envoltura>
        <AvisosEnEsteAparato copropiedadId={COP} />
      </Envoltura>,
    );
    await screen.findByText(/no envía avisos al teléfono/);
    expect(screen.queryByRole('button')).toBeNull();
    expect(pedirPermiso).not.toHaveBeenCalled();
  });
});
