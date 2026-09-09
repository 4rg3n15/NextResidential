import { describe, expect, it } from 'vitest';
import { decidirToken } from './decidir-vencimiento';

const MARGEN = 60;
const AHORA = 1_800_000_000;

describe('decidirToken', () => {
  it('sin refresco no hay sesión que salvar', () => {
    expect(
      decidirToken({ hayRefresco: false, accessToken: 'x', expiraEn: AHORA + 999 }, AHORA, MARGEN),
    ).toBe('sin-sesion');
  });

  it('un token con margen de sobra se usa tal cual', () => {
    expect(
      decidirToken({ hayRefresco: true, accessToken: 'x', expiraEn: AHORA + 600 }, AHORA, MARGEN),
    ).toBe('usar');
  });

  it('en el segundo EXACTO del margen ya se renueva', () => {
    // Apurar el borde es justo lo que produce la carrera: el token viaja
    // válido y caduca mientras la API lo verifica.
    expect(
      decidirToken(
        { hayRefresco: true, accessToken: 'x', expiraEn: AHORA + MARGEN },
        AHORA,
        MARGEN,
      ),
    ).toBe('renovar');
  });

  it('un token ya caducado se renueva, no se usa', () => {
    expect(
      decidirToken({ hayRefresco: true, accessToken: 'x', expiraEn: AHORA - 10 }, AHORA, MARGEN),
    ).toBe('renovar');
  });

  it('sin token de acceso pero con refresco, se renueva', () => {
    // Es el caso real: la cookie de acceso caduca con el token y desaparece
    // sola, mientras la de refresco sigue treinta días.
    expect(
      decidirToken({ hayRefresco: true, accessToken: '', expiraEn: AHORA + 600 }, AHORA, MARGEN),
    ).toBe('renovar');
  });
});
