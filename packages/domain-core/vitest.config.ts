import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Se excluyen los archivos que solo DECLARAN tipos: no compilan a código
      // ejecutable, así que su «cobertura» siempre sería 0 y arrastraría el
      // total hacia abajo sin decir nada sobre lo que está probado. El resto
      // —incluidos los tokens— sí se mide.
      exclude: [
        'src/**/*.test.ts',
        'src/index.ts',
        'src/puertos/**', // interfaces puras
        'src/eventos/evento-de-dominio.ts',
      ],
      // §2.4: 90 % en dominio. El umbral rompe la ejecución, no la comenta.
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
