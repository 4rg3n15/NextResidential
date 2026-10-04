import type { JSX } from 'react';
import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import Script from 'next/script';
import './globals.css';
import { GUION_DE_TEMA, NOMBRE_COOKIE, atributoDeTema, preferenciaValida } from '@/lib/tema';
import { despliegue } from '@/lib/configuracion-de-despliegue';
import { META_DEL_ORIGEN } from '@/lib/origen-directo';

/**
 * Raíz de la consola.
 *
 * El nombre del producto es **Next Control Residencial** (C-14): el mockup
 * mostraba tres denominaciones distintas. La versión sale del `package.json` en
 * tiempo de construcción, nunca escrita a mano — el mockup traía un
 * «4.2.1-Prod» ficticio que no debe llegar al entregable.
 */
export const metadata: Metadata = {
  title: { default: 'Next Control Residencial', template: '%s · Next Control Residencial' },
  description: 'Consola de administración. Next Control decide, el hardware ejecuta.',
  applicationName: 'Next Control Residencial',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/iconos/icono-192.png', apple: '/iconos/icono-192.png' },
  // La consola no se indexa: es una herramienta interna tras autenticación.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // Dos colores de barra del navegador, uno por esquema: con uno solo, en
  // oscuro la barra del móvil queda de otro color que la página.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0B0B12' },
    { media: '(prefers-color-scheme: dark)', color: '#0F0F16' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const RootLayout = async ({ children }: { children: React.ReactNode }): Promise<JSX.Element> => {
  // El nonce lo pone el middleware en la cabecera de la petición. Se lee aquí
  // para firmar el único script propio de la consola —el registro del service
  // worker—; sin él, la CSP lo bloquea en silencio y el PWA no se instala.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  /**
   * SIN DESTELLO DE TEMA INCORRECTO.
   *
   * El atributo se decide **en el servidor** con la cookie del conmutador: el
   * HTML sale con el tema puesto. Con «sistema» (o sin cookie) no se escribe y
   * manda `@media (prefers-color-scheme: dark)`, antes de pintar.
   *
   * El guion en línea cubre lo que la cookie no puede: el HTML de la caché del SW.
   */
  const preferenciaDeTema = preferenciaValida((await cookies()).get(NOMBRE_COOKIE)?.value);
  const temaInicial = atributoDeTema(preferenciaDeTema);
  const origenDeLaApi = despliegue().apiOrigenPublico; // 15-R · D1 · ver `origen-directo.ts`

  return (
    <html lang="es" data-tema={temaInicial} suppressHydrationWarning>
      <body>
        {/*
          Primer nodo del cuerpo y síncrono: corre antes de que el analizador
          llegue a nada que se pinte. `next/script` no sirve aquí —difiere la
          ejecución, y diferido significa exactamente el destello que esto
          evita—, así que va como etiqueta normal con el nonce de la CSP.
        */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: GUION_DE_TEMA }} />
        {origenDeLaApi && <meta name={META_DEL_ORIGEN} content={origenDeLaApi} />}
        <a href="#contenido" className="sr-only salto-al-contenido">
          Saltar al contenido
        </a>
        {children}
        <Script id="registro-sw" nonce={nonce} strategy="afterInteractive">
          {`if ('serviceWorker' in navigator) {
              window.addEventListener('load', function () {
                navigator.serviceWorker.register('/sw.js').catch(function () {});
              });
            }`}
        </Script>
      </body>
    </html>
  );
};

export default RootLayout;
