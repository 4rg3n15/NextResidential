import type { JSX } from 'react';
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import Script from 'next/script';
import './globals.css';

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
  themeColor: '#0B0B12',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const RootLayout = async ({ children }: { children: React.ReactNode }): Promise<JSX.Element> => {
  // El nonce lo pone el middleware en la cabecera de la petición. Se lee aquí
  // para firmar el único script propio de la consola —el registro del service
  // worker—; sin él, la CSP lo bloquea en silencio y el PWA no se instala.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="es">
      <body>
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
