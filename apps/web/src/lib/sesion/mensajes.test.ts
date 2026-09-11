import { describe, expect, it } from 'vitest';
import { estadoDeFalloDeAcceso, textoDeFalloDeAcceso } from './mensajes';

/**
 * La regla del cliente, 2026-09-10: **el cliente no puede inferir la causa,
 * solo sabe qué respondió el servidor. Que el mensaje diga eso.**
 *
 * El caso que la motivó: un 401 por firma inválida se traducía a «la consola
 * tiene el segundo factor desactivado, pero la API sigue exigiéndolo; pon
 * MFA_OBLIGATORIO=false en la API». Ya estaba puesto. Tres rondas de trabajo
 * persiguiendo una causa inexistente.
 */
describe('mensajes de fallo de acceso', () => {
  it('ningún texto afirma una causa del lado del servidor', () => {
    const motivos = [
      'CREDENCIALES_INVALIDAS',
      'DEMASIADOS_INTENTOS',
      'FACTOR_INVALIDO',
      'SESION_EXPIRADA',
      'ENLACE_NO_VALIDO',
      'CONTRASENA_DEBIL',
      'FACTOR_DUPLICADO',
      'SEGUNDO_FACTOR_YA_INSCRITO',
      'SERVICIO_NO_DISPONIBLE',
      'SERVICIO_RESPONDIO_ERROR',
    ] as const;

    for (const motivo of motivos) {
      const texto = textoDeFalloDeAcceso(motivo);
      // Ningún mensaje al usuario nombra una variable de entorno, un fichero de
      // configuración ni un componente interno: eso es un diagnóstico, y un
      // diagnóstico desde el cliente es una conjetura.
      expect(texto).not.toMatch(/MFA_OBLIGATORIO|\.env|API_URL|JWKS|reinicia/i);
      expect(texto.length).toBeGreaterThan(0);
    }
  });

  it('«no se pudo contactar» y «contestó un error» son mensajes distintos', () => {
    const sinContacto = textoDeFalloDeAcceso('SERVICIO_NO_DISPONIBLE');
    const conError = textoDeFalloDeAcceso('SERVICIO_RESPONDIO_ERROR', { estado: 503 });
    expect(sinContacto).not.toEqual(conError);
    expect(sinContacto).toMatch(/no se pudo contactar/i);
    // Lo observado —el estado— sí se transmite: es un enumerado del protocolo,
    // no un dato del titular, y sin él el mensaje no ayuda a nadie.
    expect(conError).toMatch(/HTTP 503/);
  });

  it('el cuerpo y el código del proveedor NO llegan a la pantalla', () => {
    const texto = textoDeFalloDeAcceso('SERVICIO_RESPONDIO_ERROR', {
      estado: 500,
      codigo: 'weak_password_reused',
    });
    expect(texto).not.toMatch(/weak_password_reused/);
  });

  it('un servicio de identidad caído NO se responde como 401', () => {
    /**
     * El estado también miente si se elige mal: las rutas devolvían 401 para
     * cualquier fallo que no fuese un 429, así que un proveedor caído llegaba
     * al navegador como «no autorizado» y el usuario reintentaba credenciales
     * que eran correctas.
     */
    expect(estadoDeFalloDeAcceso('SERVICIO_NO_DISPONIBLE', 401)).toBe(503);
    expect(estadoDeFalloDeAcceso('SERVICIO_RESPONDIO_ERROR', 400)).toBe(503);
  });

  it('lo que sí es culpa del cliente conserva el estado de la ruta', () => {
    expect(estadoDeFalloDeAcceso('CREDENCIALES_INVALIDAS', 401)).toBe(401);
    expect(estadoDeFalloDeAcceso('CONTRASENA_DEBIL', 400)).toBe(400);
    expect(estadoDeFalloDeAcceso('DEMASIADOS_INTENTOS', 401)).toBe(429);
  });
});
