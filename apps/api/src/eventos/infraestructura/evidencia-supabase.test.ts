import { describe, expect, it, vi } from 'vitest';
import { AlmacenEvidenciaSupabase, ErrorDeEvidencia, tipoRealDe } from './evidencia-supabase';

/**
 * Lo que estas pruebas protegen es la mitad que no da error cuando se rompe.
 *
 * Un almacén de evidencia que acepta cualquier cosa no falla: guarda. El fallo
 * llega meses después, cuando alguien abre una «foto» que el navegador
 * interpreta como otra cosa, o cuando una evidencia se sobrescribe y la que
 * sustentó una decisión ya no está.
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const TEXTO = new Uint8Array([0x3c, 0x3f, 0x70, 0x68, 0x70]); // «<?php»

const almacen = (pedir: typeof fetch): AlmacenEvidenciaSupabase =>
  new AlmacenEvidenciaSupabase({
    supabaseUrl: 'https://proyecto.supabase.co',
    // El valor NO imita el formato de una llave real a propósito: el escáner de
    // secretos de §2.5 marca cualquier cadena con esa forma, y tiene razón —
    // un doble con forma de credencial enseña a ignorar el aviso.
    llaveSecreta: 'llave-doble-para-pruebas',
    bucket: 'evidencias',
    pedir,
  });

const respuesta = (cuerpo: unknown, estado = 200): Response =>
  new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json' },
  });

describe('tipo REAL por contenido, no por extensión (§2.7.8)', () => {
  it('reconoce PNG y JPEG por sus bytes de cabecera', () => {
    expect(tipoRealDe(PNG)).toBe('image/png');
    expect(tipoRealDe(JPEG)).toBe('image/jpeg');
  });

  it('un fichero que NO es imagen se rechaza aunque se declare como tal', async () => {
    // El camino clásico: extensión y `Content-Type` mentidos. Validar por
    // extensión lo dejaría pasar; validar por bytes, no.
    const a = almacen(vi.fn(async () => respuesta({})));
    await expect(a.guardar('cop/ev/foto.png', TEXTO, 'image/png')).rejects.toBeInstanceOf(
      ErrorDeEvidencia,
    );
  });

  it('un tipo declarado que no casa con el real se rechaza, no se corrige en silencio', async () => {
    const a = almacen(vi.fn(async () => respuesta({})));
    await expect(a.guardar('cop/ev/foto.jpg', PNG, 'image/jpeg')).rejects.toThrow(/no coincide/);
  });
});

describe('subida', () => {
  it('sube al bucket con la llave secreta y SIN permitir sobrescritura', async () => {
    // `upsert: false` no es un detalle: sobrescribir la foto que sustentó una
    // decisión ya registrada desharía por Storage lo que RN-03 garantiza.
    const pedir = vi.fn(async () => respuesta({ Key: 'ok' }));
    const clave = await almacen(pedir as unknown as typeof fetch).guardar(
      'cop-a/evento-1/foto.png',
      PNG,
      'image/png',
    );
    expect(clave).toBe('cop-a/evento-1/foto.png');
    const [url, opciones] = pedir.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://proyecto.supabase.co/storage/v1/object/evidencias/cop-a/evento-1/foto.png',
    );
    expect((opciones.headers as Record<string, string>)['x-upsert']).toBe('false');
  });

  it('los separadores de la clave sobreviven a la codificación', async () => {
    // Codificar la clave entera convertiría `/` en `%2F` y toda la evidencia
    // acabaría en la raíz del bucket, en un solo montón.
    const pedir = vi.fn(async () => respuesta({}));
    await almacen(pedir as unknown as typeof fetch).guardar('a/b/c.png', PNG, 'image/png');
    expect((pedir.mock.calls[0] as unknown as [string])[0]).toContain('/evidencias/a/b/c.png');
  });

  it('un error de Storage llega con su CUERPO, no solo con el código', async () => {
    const pedir = vi.fn(async () =>
      respuesta({ error: 'Duplicate', message: 'The resource already exists' }, 409),
    );
    await expect(
      almacen(pedir as unknown as typeof fetch).guardar('a/b.png', PNG, 'image/png'),
    ).rejects.toThrow(/already exists/);
  });
});

describe('lectura', () => {
  it('firma una URL de vida corta y devuelve la absoluta', async () => {
    const pedir = vi.fn(async () =>
      respuesta({ signedURL: '/object/sign/evidencias/a/b.png?token=t' }),
    );
    const url = await almacen(pedir as unknown as typeof fetch).urlFirmada('a/b.png', 60);
    expect(url).toBe(
      'https://proyecto.supabase.co/storage/v1/object/sign/evidencias/a/b.png?token=t',
    );
    const cuerpo = JSON.parse(
      String((pedir.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    ) as { expiresIn: number };
    expect(cuerpo.expiresIn).toBe(60);
  });

  it('si Storage responde sin `signedURL`, se lanza en vez de devolver algo roto', async () => {
    // Devolver `undefined` como si fuera una URL pinta una imagen rota y hace
    // creer que la evidencia no existe.
    const pedir = vi.fn(async () => respuesta({ otra: 'cosa' }));
    await expect(
      almacen(pedir as unknown as typeof fetch).urlFirmada('a/b.png', 60),
    ).rejects.toThrow(/signedURL/);
  });

  it('la URL NO se guarda en ninguna parte: se firma en cada lectura', async () => {
    // D-19. Se comprueba pidiendo dos veces: si hubiera caché, la segunda no
    // llamaría a Storage y la URL firmada sobreviviría a su caducidad.
    const pedir = vi.fn(async () => respuesta({ signedURL: '/object/sign/x?token=t' }));
    const a = almacen(pedir as unknown as typeof fetch);
    await a.urlFirmada('a/b.png', 60);
    await a.urlFirmada('a/b.png', 60);
    expect(pedir).toHaveBeenCalledTimes(2);
  });
});
