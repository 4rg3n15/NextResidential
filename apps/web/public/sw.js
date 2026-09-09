/**
 * Service worker de la consola — BASE de la PWA. La ETAPA 14 la completa.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA REGLA QUE GOBIERNA ESTA ESTRATEGIA
 *
 * **Nada autenticado se cachea. Nunca.** En un sistema multiempresa un service
 * worker es un almacén compartido por origen, no por usuario: si guardara la
 * respuesta de `/api/ncr/copropiedades/A/...` y luego entra un operador de la
 * copropiedad B en el mismo equipo —una portería con turnos es exactamente ese
 * caso—, el navegador le serviría datos de A sin que ninguna barrera del
 * servidor llegara a intervenir. Sería una fuga entre copropiedades desde
 * dentro del propio navegador, invisible para la RLS y para la capa de
 * aplicación, que son las dos barreras de §2.7.6.
 *
 * De ahí la estrategia:
 *
 *   · `/api/**`            → SOLO red. Ni se lee ni se escribe caché.
 *   · Estáticos de `_next` → caché primero: llevan hash en el nombre, así que
 *                            un contenido distinto es una URL distinta.
 *   · Documentos           → red primero, y si no hay red, la página de
 *                            «sin conexión». No se sirve un tablero cacheado:
 *                            cifras viejas presentadas como actuales son peor
 *                            que una pantalla honesta que dice que no hay red.
 *   · Manifiesto e iconos  → caché primero; no llevan datos.
 */

const VERSION = 'ncr-consola-v1';
const ESTATICOS = `${VERSION}-estaticos`;
const RUTA_SIN_CONEXION = '/sin-conexion';

const PRECARGA = ['/sin-conexion', '/manifest.webmanifest', '/iconos/icono-192.png'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(ESTATICOS)
      .then((cache) => cache.addAll(PRECARGA))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(claves.filter((c) => !c.startsWith(VERSION)).map((c) => caches.delete(c))),
      )
      .then(() => self.clients.claim()),
  );
});

const esApi = (url) => url.pathname.startsWith('/api/');
const esEstatico = (url) =>
  url.pathname.startsWith('/_next/static/') ||
  url.pathname.startsWith('/iconos/') ||
  url.pathname === '/manifest.webmanifest';

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);
  // Otro origen: no es asunto de este worker.
  if (url.origin !== self.location.origin) return;

  // Autenticado o de sesión: red y nada más. Sin `catch` que devuelva algo
  // cacheado, porque no hay nada cacheado que devolver — y no debe haberlo.
  if (esApi(url)) return;

  if (esEstatico(url)) {
    evento.respondWith(
      caches.match(peticion).then(
        (guardada) =>
          guardada ??
          fetch(peticion).then((respuesta) => {
            if (respuesta.ok) {
              const copia = respuesta.clone();
              void caches.open(ESTATICOS).then((cache) => cache.put(peticion, copia));
            }
            return respuesta;
          }),
      ),
    );
    return;
  }

  if (peticion.mode === 'navigate') {
    evento.respondWith(
      fetch(peticion).catch(async () => {
        const cache = await caches.open(ESTATICOS);
        const sinConexion = await cache.match(RUTA_SIN_CONEXION);
        return (
          sinConexion ??
          new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain' } })
        );
      }),
    );
  }
});
