import { describe, expect, it } from 'vitest';
import { recursoBucketDeRespaldos, recursoCorreoDelRespaldo } from './recursos-del-respaldo';

/**
 * D-147 · sin SMTP la API arranca y lo declara SIN CONFIGURAR, no verde; el
 * bucket del respaldo tiene que existir y ser privado.
 */
const respuesta = (status: number, cuerpo: unknown = {}): Response =>
  new Response(JSON.stringify(cuerpo), { status });

describe('recursos del respaldo diario', () => {
  it('correo sin configurar: no crítico y SIN CONFIGURAR, nunca ok', async () => {
    // Un doble del PUERTO, no el adaptador de eventos: arranque no entra en otro módulo por dentro (§2.2).
    const r = recursoCorreoDelRespaldo({
      configurado: false,
      enviar: async () => ({ estado: 'sin-configurar' }),
    });
    expect(r.critico).toBe(false);
    expect((await r.comprobar()).estado).toBe('sin-configurar');
  });

  it('correo configurado que conecta: ok', async () => {
    const r = recursoCorreoDelRespaldo({
      configurado: true,
      enviar: async () => ({ estado: 'enviado', rechazados: [] }),
      comprobar: async () => undefined,
    });
    expect((await r.comprobar()).estado).toBe('ok');
  });

  it('correo configurado que no conecta: roto, con el código y sin la configuración', async () => {
    const r = recursoCorreoDelRespaldo({
      configurado: true,
      enviar: async () => ({ estado: 'enviado', rechazados: [] }),
      comprobar: async () => {
        throw Object.assign(new Error('Invalid login: smtp.ejemplo.test usuario clave-secreta'), {
          code: 'EAUTH',
        });
      },
    });
    const resultado = await r.comprobar();
    expect(resultado.estado).toBe('roto');
    expect(resultado.detalle).toContain('EAUTH');
    expect(JSON.stringify(resultado)).not.toContain('clave-secreta');
    expect(JSON.stringify(resultado)).not.toContain('smtp.ejemplo.test');
  });

  const bucket = (pedir: typeof fetch, enBase = true) =>
    recursoBucketDeRespaldos({
      supabaseUrl: 'https://proyecto.ejemplo.test',
      llaveSecreta: 'sb_secret_prueba',
      enBase,
      pedir,
    });

  it('respaldo en memoria: SIN CONFIGURAR, sin preguntar a Storage', async () => {
    let llamadas = 0;
    const r = bucket(async () => {
      llamadas += 1;
      return respuesta(200);
    }, false);
    expect((await r.comprobar()).estado).toBe('sin-configurar');
    expect(llamadas).toBe(0);
  });

  it('bucket privado: ok; inexistente o público: roto', async () => {
    expect((await bucket(async () => respuesta(200, { public: false })).comprobar()).estado).toBe(
      'ok',
    );
    const falta = await bucket(async () => respuesta(404)).comprobar();
    expect(falta.estado).toBe('roto');
    expect(falta.remedio).toContain('0061');
    expect((await bucket(async () => respuesta(200, { public: true })).comprobar()).estado).toBe(
      'roto',
    );
    expect((await bucket(async () => respuesta(401)).comprobar()).estado).toBe('roto');
    expect(
      (
        await bucket(async () => {
          throw new Error('ECONNREFUSED');
        }).comprobar()
      ).estado,
    ).toBe('roto');
  });
});
