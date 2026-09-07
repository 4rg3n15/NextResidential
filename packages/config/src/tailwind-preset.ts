/**
 * Preset Tailwind compartido, derivado del sistema de diseño de la ETAPA 00
 * (`docs/auditoria/03-mockups.md` §5). Vive aquí para que la consola (ETAPA 09)
 * y la de operaciones (ETAPA 10) no diverjan en paleta ni densidad.
 * Se declara sin depender de `tailwindcss`: es un objeto plano y el consumidor
 * lo pasa a `presets`. Así este paquete no arrastra la dependencia.
 */
export const presetTailwind = {
  theme: {
    extend: {
      colors: {
        marca: { DEFAULT: '#1f3a5f', claro: '#2f5d8a', oscuro: '#132a45' },
        estado: {
          permitido: '#1b7f4b',
          denegado: '#b3261e',
          aviso: '#a16207',
          fuera_de_linea: '#57534e',
        },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      borderRadius: { tarjeta: '0.75rem' },
    },
  },
} as const;
