import type { Config } from 'tailwindcss';
import { presetTailwind } from '../../packages/config/src/tailwind-preset';

/**
 * La consola NO define paleta ni tipografía: las toma del preset compartido de
 * `packages/config`, derivado del sistema de diseño de la ETAPA 00. Si una
 * pantalla necesita un color que no está ahí, la respuesta es añadirlo al
 * preset —donde las tres superficies lo ven— y no aquí.
 *
 * Se importa el **fuente** del preset y no su `dist`: un artefacto intermedio
 * envejece, y aquí el síntoma sería una clase «que no existe» con el color ya
 * añadido al preset —ocurrió al montar esta etapa—. Es la regla de diseño que
 * dejó la ETAPA 04, aplicada también a la configuración de estilos.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [presetTailwind as unknown as Config],
  theme: {},
  plugins: [],
};

export default config;
