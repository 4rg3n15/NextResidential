import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { emiteMetadatosDeTipos } from './metadatos-de-tipos';

describe('H-SITIO-06 (anexo) · los metadatos de tipos de los que depende el ValidationPipe', () => {
  it('compilada con metadatos (SWC aquí, tsc en `start:dev` y `build`), la sonda los tiene', () => {
    expect(emiteMetadatosDeTipos()).toBe(true);
  });

  it('una clase sin ellos —lo que deja esbuild, el compilador de tsx— se detecta', () => {
    // Sin decorador el compilador no emite nada: es lo que ve la API con tsx.
    class SinDecorar {
      constructor(readonly dependencia: Date) {}
    }
    expect(emiteMetadatosDeTipos(SinDecorar)).toBe(false);
  });
});
