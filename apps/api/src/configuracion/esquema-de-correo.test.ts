import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ESQUEMA_DE_CORREO, configuracionDeCorreo, problemaDeCorreo } from './esquema-de-correo';

/** D-147 · las cinco CORREO_* van juntas o no va ninguna; sin ellas, la API arranca. */
const esquema = z.object(ESQUEMA_DE_CORREO);
const COMPLETO = {
  CORREO_SMTP_HOST: 'smtp.ejemplo.test',
  CORREO_SMTP_PUERTO: '587',
  CORREO_SMTP_USUARIO: 'envios',
  CORREO_SMTP_CLAVE: 'una clave con espacios',
  CORREO_REMITENTE: 'respaldo@ejemplo.test',
};

describe('esquema de correo', () => {
  it('ninguna: válida, y el correo queda sin configurar', () => {
    const c = esquema.parse({});
    expect(problemaDeCorreo(c)).toBeNull();
    expect(configuracionDeCorreo(c)).toBeNull();
  });

  it('las cinco: válida, con el puerto como número', () => {
    const c = esquema.parse(COMPLETO);
    expect(problemaDeCorreo(c)).toBeNull();
    expect(configuracionDeCorreo(c)).toEqual({
      host: 'smtp.ejemplo.test',
      puerto: 587,
      usuario: 'envios',
      clave: 'una clave con espacios',
      remitente: 'respaldo@ejemplo.test',
    });
  });

  it('a medias: el problema nombra las variables y no lleva ningún valor', () => {
    const faltaLaClave = { ...COMPLETO, CORREO_SMTP_CLAVE: undefined };
    const problema = problemaDeCorreo(esquema.parse(faltaLaClave));
    expect(problema).toContain('las cinco o ninguna');
    expect(problema).not.toContain('envios');
  });

  it('rechaza un host con esquema, un puerto fuera de rango, un remitente que no es correo y una clave con control', () => {
    expect(
      esquema.safeParse({ ...COMPLETO, CORREO_SMTP_HOST: 'smtps://smtp.ejemplo.test' }).success,
    ).toBe(false);
    expect(esquema.safeParse({ ...COMPLETO, CORREO_SMTP_PUERTO: '70000' }).success).toBe(false);
    expect(esquema.safeParse({ ...COMPLETO, CORREO_REMITENTE: 'no-es-correo' }).success).toBe(
      false,
    );
    expect(esquema.safeParse({ ...COMPLETO, CORREO_SMTP_CLAVE: 'clave\nPEGADA=1' }).success).toBe(
      false,
    );
  });
});
