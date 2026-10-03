'use client';

import { cliente, desenvolver } from './api/cliente';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · B4 · LOS AVISOS AL TELÉFONO DEL RESIDENTE, DESDE LA CONSOLA (ADR-036)
 *
 * Web Push estándar: el navegador se suscribe con la llave pública VAPID que
 * da la API y entrega su suscripción a la API. Sin Firebase ni SDK de nadie.
 *
 *  · El PERMISO se pide sólo dentro de un clic (gesto del usuario): pedirlo al
 *    cargar la página es lo que hace que el navegador lo bloquee para siempre.
 *  · En iPhone sólo funciona con la consola INSTALADA en la pantalla de inicio
 *    (iOS 16.4+); en Safari a secas `PushManager` no existe. Se detecta y se
 *    explica en vez de mostrar un botón que no puede funcionar.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type SoporteDeAvisos = 'si' | 'iphone_sin_instalar' | 'no';

export const soporteDeAvisos = (): SoporteDeAvisos => {
  if (typeof window === 'undefined') return 'no';
  const completo =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (completo) return 'si';
  const esIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return esIos ? 'iphone_sin_instalar' : 'no';
};

const bytesDe = (base64url: string): Uint8Array => {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const crudo = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(crudo, (c) => c.charCodeAt(0));
};

const ruta = (copropiedadId: string) => ({ params: { path: { id: copropiedadId } } });

/** La suscripción que ya tiene este navegador, si la tiene. */
export const suscripcionActual = async (): Promise<PushSubscription | null> => {
  const registro = await navigator.serviceWorker.ready;
  return registro.pushManager.getSubscription();
};

const entregar = async (copropiedadId: string, s: PushSubscription): Promise<void> => {
  const json = s.toJSON();
  desenvolver(
    await cliente.POST('/copropiedades/{id}/mi/notificaciones/web-push', {
      ...ruta(copropiedadId),
      body: {
        endpoint: json.endpoint ?? s.endpoint,
        keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
      },
    }),
  );
};

/** DENTRO de un clic: permiso → suscripción → API. Devuelve el permiso final. */
export const activarAvisos = async (
  copropiedadId: string,
  clavePublica: string,
): Promise<NotificationPermission> => {
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return permiso;
  const registro = await navigator.serviceWorker.ready;
  const s =
    (await registro.pushManager.getSubscription()) ??
    (await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytesDe(clavePublica),
    }));
  await entregar(copropiedadId, s);
  return permiso;
};

/** El navegador puede rotar la suscripción: al abrir la pantalla se vuelve a entregar. */
export const resincronizar = async (copropiedadId: string): Promise<boolean> => {
  if (Notification.permission !== 'granted') return false;
  const s = await suscripcionActual();
  if (s === null) return false;
  await entregar(copropiedadId, s);
  return true;
};

export const quitarAvisos = async (copropiedadId: string): Promise<void> => {
  const s = await suscripcionActual();
  if (s === null) return;
  desenvolver(
    await cliente.POST('/copropiedades/{id}/mi/notificaciones/web-push/baja', {
      ...ruta(copropiedadId),
      body: { endpoint: s.endpoint },
    }),
  );
  await s.unsubscribe();
};
