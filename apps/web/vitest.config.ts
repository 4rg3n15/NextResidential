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
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
  },
});
