import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * Las pruebas se transpilan con SWC y `decoratorMetadata: true`.
 *
 * Sin esto, el transformador por defecto NO emite `design:paramtypes`, y las
 * consecuencias son silenciosas y graves: el contenedor de Nest entrega
 * `undefined` donde debería inyectar, y —peor— `ValidationPipe` no conoce el
 * tipo del DTO y **deja pasar cualquier cuerpo**. La suite habría dado por
 * buena la validación de §2.7.3 sin que existiera.
 *
 * Es la misma lección de la ETAPA 01: un entorno de pruebas que no reproduce
 * las condiciones reales produce suites verdes que no significan nada.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  resolve: {
    alias: {
      /**
       * Las pruebas resuelven `@ncr/domain-core` a su CÓDIGO FUENTE, no a su
       * `dist/`.
       *
       * Motivo (defecto del 2026-09-07): `dist/` está en `.gitignore`, así que
       * cada checkout tiene el suyo. Ejecutar `pnpm --filter @ncr/api test` no
       * dispara `turbo`, y por tanto no reconstruye el dominio: la suite corría
       * contra un artefacto de una etapa anterior. El fallo es especialmente
       * traicionero porque NO es un «módulo no encontrado» —el paquete carga
       * bien— sino un `undefined` en el único símbolo que faltaba, así que
       * fallan tres pruebas y pasan las otras 48.
       *
       * Con el alias, la suite no puede quedar desincronizada del código: no
       * existe artefacto intermedio que pueda envejecer.
       */
      '@ncr/domain-core': resolve(__dirname, '../../packages/domain-core/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/openapi.ts'],
    },
  },
});
