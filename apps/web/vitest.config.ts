import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // Las pruebas resuelven los paquetes internos a su CÓDIGO FUENTE y nunca
      // a su `dist/`: un artefacto intermedio envejece y produce el verde que
      // no se reproduce. Es la regla de diseño que dejó la ETAPA 04.
      '@ncr/contracts': resolve(__dirname, '../../packages/contracts/src/index.ts'),
      '@ncr/config': resolve(__dirname, '../../packages/config/src/index.ts'),
      // `server-only` es un módulo de Next que solo existe para que el
      // empaquetador ROMPA el build si un componente de cliente importa un
      // módulo de servidor. Fuera de Next no hay nada que resolver, así que
      // aquí apunta a un archivo vacío: la barrera la impone `next build`, no
      // el ejecutor de pruebas, y sustituirla no la debilita.
      'server-only': resolve(__dirname, 'src/pruebas/server-only.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
    setupFiles: ['./src/pruebas/preparacion.ts'],
    coverage: {
      provider: 'v8',
      // Se mide `src/`, que es el código de la aplicación. Quedan fuera la
      // configuración de compilación —`next.config.mjs`, `tailwind.config.ts`,
      // `postcss.config.mjs`— y `public/sw.js`, que no son módulos que el
      // ejecutor pueda importar: contarlos como 0 % no mide nada, solo mueve
      // el porcentaje. El service worker se verifica a mano en el navegador,
      // y así queda dicho en el informe en vez de simulado con una cifra.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/pruebas/**', 'src/**/*.test.{ts,tsx}'],
    },
  },
});
