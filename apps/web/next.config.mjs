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
            // Cámara y micrófono solo donde se capturan. La consola de
            // administración no captura nada; la guardia virtual de la ETAPA 10
            // relajará esto en SU ruta, no aquí.
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
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
