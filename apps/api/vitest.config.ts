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
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/openapi.ts'],
    },
  },
});
