export const POLITICA_SIN_MICROFONO =
  'camera=(), microphone=(), geolocation=(), payment=(), usb=()';
export const POLITICA_DE_LA_GUARDIA =
  'camera=(), microphone=(self), geolocation=(), payment=(), usb=()';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // El paquete de contratos es TypeScript sin compilar dentro del monorepo;
  // Next lo transpila él mismo en vez de exigirle un `dist`. Así el cliente
  // generado no necesita un paso de build previo para trabajar en la consola.
  transpilePackages: ['@ncr/contracts', '@ncr/config'],
  eslint: {
    // El lint del monorepo es el de la raíz y ya corre en `pnpm lint`. Que Next
    // lance otro durante el build daría dos veredictos sobre el mismo código.
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: '/:ruta*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
      /**
       * Cámara y micrófono solo donde se capturan (§2.7.7). 15-P · la guardia
       * virtual habla con el visitante: SU ruta, y sólo ella, admite el
       * micrófono del propio origen. Hasta la 15-P la regla era una para todo
       * —`microphone=()` también en la guardia— y el navegador negaba el
       * micrófono en la consola compilada: «pulsar para hablar» no podía abrir.
       */
      {
        source: '/((?!guardia(?:/|$)).*)',
        headers: [{ key: 'Permissions-Policy', value: POLITICA_SIN_MICROFONO }],
      },
      {
        source: '/guardia/:ruta*',
        headers: [{ key: 'Permissions-Policy', value: POLITICA_DE_LA_GUARDIA }],
      },
      {
        // El service worker no se cachea: si el navegador sirve uno viejo, la
        // consola se queda con la estrategia de caché de la versión anterior y
        // no hay forma de actualizarla.
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
