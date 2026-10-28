import { createServer } from 'node:net';
import type { AddressInfo, Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { ConfiguracionDeCorreo } from '../../configuracion/esquema-de-correo';
import { CorreoSmtp, opcionesDeTransporte } from './correo-smtp';

/**
 * D-147 · el SMTP exige TLS: sin él no se autentica ni se envía nada. Se prueba
 * contra un servidor de mentira en texto plano que NO ofrece STARTTLS y que
 * apunta todo lo que recibe.
 */
const CONFIG: ConfiguracionDeCorreo = {
  host: 'localhost',
  puerto: 587,
  usuario: 'cuenta-de-envio',
  clave: 'clave-de-prueba-no-real',
  remitente: 'respaldo@ejemplo.test',
};

let servidor: Server | undefined;
afterEach(() => {
  servidor?.close();
  servidor = undefined;
});

/** Un SMTP que contesta EHLO sin STARTTLS y acepta lo que le manden. */
const smtpSinTls = async (): Promise<{ puerto: number; recibido: string[] }> => {
  const recibido: string[] = [];
  servidor = createServer((socket) => {
    socket.write('220 prueba ESMTP\r\n');
    socket.on('data', (datos) => {
      for (const linea of datos.toString('utf8').split('\r\n').filter(Boolean)) {
        recibido.push(linea);
        if (/^(EHLO|HELO)/i.test(linea)) socket.write('250-prueba\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (/^QUIT/i.test(linea)) socket.end('221 adiós\r\n');
        else socket.write('250 ok\r\n');
      }
    });
    socket.on('error', () => undefined);
  });
  await new Promise<void>((listo) => servidor?.listen(0, '127.0.0.1', listo));
  return { puerto: (servidor?.address() as AddressInfo).port, recibido };
};

describe('CorreoSmtp', () => {
  it('en el 465 usa TLS implícito; en cualquier otro puerto exige STARTTLS', () => {
    const implicito = opcionesDeTransporte({ ...CONFIG, puerto: 465 });
    expect([implicito.secure, implicito.requireTLS]).toEqual([true, false]);
    const starttls = opcionesDeTransporte({ ...CONFIG, puerto: 587 });
    expect([starttls.secure, starttls.requireTLS, starttls.ignoreTLS]).toEqual([
      false,
      true,
      false,
    ]);
    expect(starttls.tls).toEqual({
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
      servername: 'localhost',
    });
  });

  it('nunca registra: sin logger ni modo de depuración', () => {
    const o = opcionesDeTransporte(CONFIG);
    expect([o.logger, o.debug]).toEqual([false, false]);
  });

  it('un servidor sin STARTTLS: no se autentica, no se envía y el fallo no lleva la clave', async () => {
    const { puerto, recibido } = await smtpSinTls();
    const correo = new CorreoSmtp({ ...CONFIG, host: 'localhost', puerto });
    const resultado = await correo.enviar({
      destinatarios: ['super@ejemplo.test'],
      asunto: 'Eventos del 2026-10-27 · Prueba',
      cuerpo: 'contenido',
      adjuntos: [],
    });
    expect(resultado.estado).toBe('error');
    expect(recibido.some((l) => /^AUTH/i.test(l))).toBe(false);
    expect(recibido.some((l) => /^MAIL FROM/i.test(l))).toBe(false);
    expect(recibido.join('\n')).not.toContain(CONFIG.clave);
    expect(JSON.stringify(resultado)).not.toContain(CONFIG.clave);
    expect(JSON.stringify(resultado)).not.toContain(CONFIG.usuario);
  });

  it('está configurado: el respaldo intenta enviar', () => {
    expect(new CorreoSmtp(CONFIG).configurado).toBe(true);
  });
});
