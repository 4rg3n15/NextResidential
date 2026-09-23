import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { informeDe } from '../../scripts/lib/reporteros-de-prueba.mjs';

export default defineConfig({
  test: {
    ...informeDe('edge'),
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/main.ts',
        // Solo tipos: no hay una línea que ejecutar, y contarla al 0 % haría
        // bajar el umbral sin que exista nada que probar.
        'src/aplicacion/puertos.ts',
      ],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
  resolve: {
    alias: {
      // §2.8.0 · al FUENTE, nunca al `dist/`. Y aquí importa el doble: lo que
      // esta etapa tiene que demostrar es que el Edge ejecuta EL MISMO dominio
      // que la nube, no una copia compilada que puede haber envejecido.
      '@ncr/domain-core': resolve(__dirname, '../../packages/domain-core/src/index.ts'),
    },
  },
});
