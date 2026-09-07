import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
  resolve: {
    alias: {
      // §2.8.0: las pruebas resuelven los paquetes internos a su CÓDIGO FUENTE,
      // nunca a su `dist/`. Un artefacto intermedio puede envejecer; el fuente no.
      '@ncr/domain-core': resolve(__dirname, '../domain-core/src/index.ts'),
    },
  },
});
