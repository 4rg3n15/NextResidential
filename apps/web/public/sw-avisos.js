/**
 * Avisos al residente por Web Push — 15-R, bloque B4 (ADR-036, P-23).
 *
 * Lo carga `sw.js` con `importScripts`. Sin Firebase: el servicio de push del
 * navegador entrega el aviso CIFRADO para este navegador (RFC 8291) y aquí se
 * muestra. El aviso no se cachea ni se guarda: se pinta y se olvida.
 *
 * Al tocarlo se abre la pantalla que el aviso nombra, pero SÓLO si es una de
 * las del residente: una ruta arbitraria en el aviso convertiría la
 * notificación en una redirección a cualquier sitio.
 */

const RUTAS_DE_AVISO = new Set(['/mi/notificaciones', '/mi/historial']);
const RUTA_POR_OMISION = '/mi/notificaciones';

const avisoDe = (evento) => {
  try {
    const datos = evento.data ? evento.data.json() : {};
    return {
      titulo: typeof datos.titulo === 'string' ? datos.titulo : 'Next Control',
      cuerpo: typeof datos.cuerpo === 'string' ? datos.cuerpo : '',
      ruta: RUTAS_DE_AVISO.has(datos.ruta) ? datos.ruta : RUTA_POR_OMISION,
    };
  } catch {
    return { titulo: 'Next Control', cuerpo: 'Tiene un aviso nuevo', ruta: RUTA_POR_OMISION };
  }
};

self.addEventListener('push', (evento) => {
  const aviso = avisoDe(evento);
  evento.waitUntil(
    self.registration.showNotification(aviso.titulo, {
      body: aviso.cuerpo,
      icon: '/iconos/icono-192.png',
      badge: '/iconos/icono-192.png',
      lang: 'es-CO',
      data: { ruta: aviso.ruta },
    }),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const pedida = evento.notification.data && evento.notification.data.ruta;
  const ruta = RUTAS_DE_AVISO.has(pedida) ? pedida : RUTA_POR_OMISION;
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      const propia = ventanas.find((v) => new URL(v.url).origin === self.location.origin);
      if (propia !== undefined && 'navigate' in propia) {
        return propia.navigate(ruta).then((v) => (v ?? propia).focus());
      }
      return self.clients.openWindow(ruta);
    }),
  );
});
