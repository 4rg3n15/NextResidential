import { describe, expect, it } from 'vitest';
import { MENSAJE_CUENTA_DE_MENOR } from './edad';
import {
  copropiedadDelCodigo,
  motivoDeCodigoDeInvitacion,
  motivoDeCorreoInvalido,
  motivoDeFechaDeAdulto,
  motivoDeUsuarioInvalido,
  normalizarUsuario,
  registroListoParaEnviar,
} from './reglas';

/**
 * 15-Y1 · «Crear cuenta» en la consola, con LAS MISMAS reglas y textos que la
 * app (`apps/mobile/lib/dominio/registro.dart`, `edad.dart`): un residente que
 * entra desde Safari en su iPhone (P-23) lee lo mismo que uno con la app.
 */
const AHORA = new Date('2026-10-14T15:00:00Z');
/** Una clave de prueba que cumple la política; se nombra aparte por el escáner de secretos (§2.5). */
const CLAVE = 'Clave#2026xy';

describe('reglas de «Crear cuenta» · paridad con la app', () => {
  it('el código de invitación: su prefijo es el código de la copropiedad; sin él, el motivo de la app', () => {
    expect(copropiedadDelCodigo('MIRA-K7PQ-2XWZ')).toBe('MIRA');
    expect(copropiedadDelCodigo(' mira k7pq 2xwz ')).toBe('MIRA');
    expect(copropiedadDelCodigo('K7PQ-2XWZ')).toBeNull();
    expect(copropiedadDelCodigo('DEMASIADOLARGO-K7PQ-2XWZ')).toBeNull();
    expect(motivoDeCodigoDeInvitacion('  ')).toBe('Escriba el código de invitación');
    expect(motivoDeCodigoDeInvitacion('K7PQ2XWZ')).toBe(
      'Escriba el código completo, como MIRA-K7PQ-2XWZ',
    );
    expect(motivoDeCodigoDeInvitacion('MIRA-K7PQ-2XWZ')).toBeNull();
  });

  it('el usuario: de 3 a 32, letras sin tilde, números, punto, guion y guion bajo; normalizado en minúsculas', () => {
    expect(normalizarUsuario('  Ana.Perez ')).toBe('ana.perez');
    expect(motivoDeUsuarioInvalido('ab')).toBe('El usuario tiene entre 3 y 32 caracteres');
    expect(motivoDeUsuarioInvalido('.ana')).toBe(
      'El usuario admite letras sin tilde, números, punto, guion y guion bajo, y empieza por letra o número',
    );
    expect(motivoDeUsuarioInvalido('ana.perez')).toBeNull();
  });

  it('el correo: contacto, no acceso; sólo su forma', () => {
    expect(motivoDeCorreoInvalido('')).toBe('Escriba su correo');
    expect(motivoDeCorreoInvalido('ana@')).toBe('Escriba un correo válido');
    expect(motivoDeCorreoInvalido(' ana@ejemplo.invalid ')).toBeNull();
  });

  it('la fecha: forma, no futura y mayor de edad, con el mensaje del dominio para el menor', () => {
    expect(motivoDeFechaDeAdulto('', AHORA)).toBe('Escriba su fecha de nacimiento');
    expect(motivoDeFechaDeAdulto('14/10/2000', AHORA)).toBe('Escriba la fecha como AAAA-MM-DD');
    expect(motivoDeFechaDeAdulto('2027-01-01', AHORA)).toBe('Esa fecha todavía no llegó');
    expect(motivoDeFechaDeAdulto('2010-05-17', AHORA)).toBe(MENSAJE_CUENTA_DE_MENOR);
    expect(motivoDeFechaDeAdulto('2008-10-14', AHORA)).toBeNull();
    expect(motivoDeFechaDeAdulto('2008-10-16', AHORA)).toBe(MENSAJE_CUENTA_DE_MENOR);
  });

  it('listo para enviar: todo escrito, contraseñas iguales, política recibida y casilla marcada', () => {
    const base = {
      usuario: 'ana.perez',
      correo: 'ana@ejemplo.invalid',
      contrasena: CLAVE,
      confirmacion: CLAVE,
      codigo: 'MIRA-K7PQ-2XWZ',
      fechaNacimiento: '1990-05-17',
      aceptada: true,
      hayPolitica: true,
    };
    expect(registroListoParaEnviar(base)).toBe(true);
    expect(registroListoParaEnviar({ ...base, confirmacion: 'otra' })).toBe(false);
    expect(registroListoParaEnviar({ ...base, aceptada: false })).toBe(false);
    expect(registroListoParaEnviar({ ...base, hayPolitica: false })).toBe(false);
    expect(registroListoParaEnviar({ ...base, codigo: ' ' })).toBe(false);
  });
});
