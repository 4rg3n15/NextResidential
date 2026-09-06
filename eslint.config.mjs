// Frontera de arquitectura, verificable por máquina (§2.3 DIP, DoD ETAPA 02).
// El linter no documenta la regla: la IMPONE. Un `import` prohibido rompe el build.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Infraestructura que el dominio no puede nombrar jamás. */
const PROHIBIDO_EN_DOMINIO = [
  '@nestjs/*',
  '@supabase/*',
  'supabase',
  'axios',
  'pg',
  'pg-boss',
  'pino',
  'helmet',
  'express',
  'fs',
  'node:fs',
  'http',
  'node:http',
  'https',
  'node:https',
  'net',
  'node:net',
  'zod',
];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/.turbo/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // §2.4: prohibido `any`. Es error, no aviso: un aviso se ignora.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
    },
  },
  {
    // El DOMINIO no conoce infraestructura. Dirección de dependencia de §2.2.
    files: ['packages/domain-core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: PROHIBIDO_EN_DOMINIO,
              message:
                'El dominio no puede importar infraestructura (§2.2). Declara un puerto y que la infraestructura lo implemente.',
            },
            {
              group: ['**/infraestructura/**', '**/adaptadores/**', '../../../apps/**'],
              message: 'El dominio no depende de capas externas. La flecha va hacia dentro (§2.2).',
            },
          ],
        },
      ],
      // Cero I/O. Se prohíbe CONSTRUIR el reloj, no nombrar el tipo `Date`:
      // `ocurridoEn: Date` es una firma legítima del dominio. La regla apunta a
      // la obtención del instante, que es lo que rompe la reproducibilidad.
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'El dominio no lee el entorno.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'Prohibido `new Date()` en el dominio: inyecta `Reloj` (§2.4).',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'Prohibido Math.random() en el dominio: inyecta `GeneradorDeId`.',
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: 'Prohibido Date.now() en el dominio: inyecta `Reloj` (§2.4).',
        },
      ],
      // Los puertos de repositorio son marcadores nominales a propósito: cada
      // agregado tiene SU tipo aunque hoy compartan forma (ISP, §2.3).
      '@typescript-eslint/no-empty-object-type': [
        'error',
        { allowInterfaces: 'with-single-extends' },
      ],
    },
  },
  {
    // La capa de aplicación de la API tampoco toca infraestructura concreta.
    files: ['apps/api/src/**/aplicacion/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@supabase/*', 'pg', 'axios'],
              message: 'La aplicación orquesta puertos; no conoce adaptadores (§2.2).',
            },
          ],
        },
      ],
    },
  },
  {
    // Las pruebas del dominio SÍ construyen instantes: es su trabajo fijar el
    // tiempo. Y los dos puntos de entrada escriben en consola antes de que
    // exista bitácora, que es el único momento en que no hay alternativa.
    files: ['**/*.test.ts', '**/*.spec.ts', 'apps/api/src/main.ts', 'apps/api/src/openapi.ts'],
    rules: { 'no-console': 'off', 'no-restricted-syntax': 'off' },
  },
);
