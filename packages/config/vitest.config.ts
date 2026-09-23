import { defineConfig } from 'vitest/config';
import { informeDe } from '../../scripts/lib/reporteros-de-prueba.mjs';

export default defineConfig({
  test: { ...informeDe('config'), include: ['src/**/*.test.ts'] },
});
