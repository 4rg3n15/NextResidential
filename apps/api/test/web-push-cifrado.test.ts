import { describe, expect, it } from 'vitest';
import { createECDH } from 'node:crypto';
import { decodeProtectedHeader, importJWK, jwtVerify } from 'jose';
import { cifrarParaElNavegador } from '../src/eventos/infraestructura/web-push/cifrado';
import { FirmaVapid } from '../src/eventos/infraestructura/web-push/vapid';
import { problemaDeAvisos } from '../src/configuracion/esquema-de-avisos';
import { esServicioDePushPermitido } from '../src/comun/servicios-de-push';
import { descifrarComoNavegador, navegadorNuevo } from './dobles/navegador-con-push';

/**
 * 15-R · B6 · el cifrado y la firma de Web Push, contra la RFC y no contra sí
 * mismos. El ejemplo del apéndice A de la RFC 8291 (llaves, sal, texto y
 * resultado fijos) se reprodujo byte a byte con `http_ece`, una implementación
 * independiente, antes de escribir el emisor.
 */
const b = (s: string): Buffer => Buffer.from(s, 'base64url');
const RFC = {
  texto: 'When I grow up, I want to be a watermelon',
  privadaServidor: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  privadaNavegador: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  publicaNavegador:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  sal: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  cuerpo:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

describe('RFC 8291 · apéndice A', () => {
  it('el emisor produce EXACTAMENTE el mensaje del ejemplo', () => {
    const cuerpo = cifrarParaElNavegador(
      { p256dh: b(RFC.publicaNavegador), auth: b(RFC.auth) },
      Buffer.from(RFC.texto),
      { privada: b(RFC.privadaServidor), sal: b(RFC.sal) },
    );
    expect(cuerpo.toString('base64url')).toBe(RFC.cuerpo);
  });

  it('el descifrador de la prueba lee el mensaje del ejemplo (valida al validador)', () => {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(b(RFC.privadaNavegador));
    expect(ecdh.getPublicKey().toString('base64url')).toBe(RFC.publicaNavegador);
    const claro = descifrarComoNavegador({ ecdh, auth: b(RFC.auth) }, b(RFC.cuerpo));
    expect(claro.toString()).toBe(RFC.texto);
  });

  it('con llave efímera y sal aleatorias: dos cifrados distintos, el navegador lee los dos', () => {
    const nav = navegadorNuevo();
    const destino = { p256dh: b(nav.p256dh), auth: nav.auth };
    const uno = cifrarParaElNavegador(destino, Buffer.from('hola'));
    const dos = cifrarParaElNavegador(destino, Buffer.from('hola'));
    expect(uno.equals(dos)).toBe(false);
    expect(descifrarComoNavegador(nav, uno).toString()).toBe('hola');
    expect(descifrarComoNavegador(nav, dos).toString()).toBe('hola');
  });

  it('otro navegador (otro auth) NO puede leerlo', () => {
    const nav = navegadorNuevo();
    const intruso = { ...navegadorNuevo(), ecdh: nav.ecdh };
    const cuerpo = cifrarParaElNavegador(
      { p256dh: b(nav.p256dh), auth: nav.auth },
      Buffer.from('x'),
    );
    expect(() => descifrarComoNavegador(intruso, cuerpo)).toThrow();
  });

  it('rechaza llaves malformadas y un aviso que no cabe en un registro', () => {
    const nav = navegadorNuevo();
    expect(() =>
      cifrarParaElNavegador({ p256dh: Buffer.alloc(65), auth: nav.auth }, Buffer.from('x')),
    ).toThrow(/P-256/);
    expect(() =>
      cifrarParaElNavegador({ p256dh: b(nav.p256dh), auth: Buffer.alloc(8) }, Buffer.from('x')),
    ).toThrow(/16 bytes/);
    expect(() =>
      cifrarParaElNavegador({ p256dh: b(nav.p256dh), auth: nav.auth }, Buffer.alloc(4000)),
    ).toThrow(/4096/);
  });
});

const parVapid = (): { publica: string; privada: string } => {
  const e = createECDH('prime256v1');
  e.generateKeys();
  return { publica: e.getPublicKey('base64url'), privada: e.getPrivateKey('base64url') };
};

describe('VAPID · RFC 8292', () => {
  it('firma un ES256 con audiencia = origen del servicio, caducidad ≤ 24 h y contacto', async () => {
    const par = parVapid();
    const firma = new FirmaVapid({ ...par, sujeto: 'mailto:ti@grupocontrol.co' });
    const ahora = new Date();
    const cabecera = firma.cabecera('https://fcm.googleapis.com/fcm/send/abc', ahora);
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(cabecera);
    expect(m?.[2]).toBe(par.publica);
    const jwt = m?.[1] ?? '';
    expect(decodeProtectedHeader(jwt)).toMatchObject({ alg: 'ES256', typ: 'JWT' });
    const pub = Buffer.from(par.publica, 'base64url');
    const llave = await importJWK(
      {
        kty: 'EC',
        crv: 'P-256',
        x: pub.subarray(1, 33).toString('base64url'),
        y: pub.subarray(33).toString('base64url'),
      },
      'ES256',
    );
    const { payload } = await jwtVerify(jwt, llave, {
      audience: 'https://fcm.googleapis.com',
      currentDate: ahora,
    });
    expect(payload.sub).toBe('mailto:ti@grupocontrol.co');
    const vida = (payload.exp ?? 0) - Math.floor(ahora.getTime() / 1000);
    expect(vida).toBeGreaterThan(0);
    expect(vida).toBeLessThanOrEqual(24 * 3600);
  });

  it('un par cruzado no se acepta: ni la firma ni el arranque', () => {
    const a = parVapid();
    const otro = parVapid();
    expect(
      () => new FirmaVapid({ publica: a.publica, privada: otro.privada, sujeto: 'mailto:x@y.co' }),
    ).toThrow(/no corresponde/);
    expect(
      problemaDeAvisos({
        WEB_PUSH_VAPID_PUBLICA: a.publica,
        WEB_PUSH_VAPID_PRIVADA: otro.privada,
        WEB_PUSH_SUJETO: 'mailto:x@y.co',
      }),
    ).toMatch(/no corresponde/);
  });

  it('una privada de 31 bytes (cero inicial omitido por ECDH) es la misma llave: se acepta', () => {
    // ~4 de cada 1000 pares de `ECDH` salen así; acotado a 20 000 intentos.
    let corta: ReturnType<typeof createECDH> | undefined;
    for (let i = 0; i < 20_000 && corta === undefined; i += 1) {
      const e = createECDH('prime256v1');
      e.generateKeys();
      if (e.getPrivateKey().length < 32) corta = e;
    }
    expect(corta).toBeDefined();
    const par = {
      publica: corta?.getPublicKey('base64url') ?? '',
      privada: corta?.getPrivateKey('base64url') ?? '',
    };
    expect(
      problemaDeAvisos({
        WEB_PUSH_VAPID_PUBLICA: par.publica,
        WEB_PUSH_VAPID_PRIVADA: par.privada,
        WEB_PUSH_SUJETO: 'mailto:x@y.co',
      }),
    ).toBeNull();
    expect(() =>
      new FirmaVapid({ ...par, sujeto: 'mailto:x@y.co' }).cabecera(
        'https://fcm.googleapis.com/x',
        new Date(),
      ),
    ).not.toThrow();
  });

  it('las tres variables van juntas o ninguna', () => {
    const a = parVapid();
    expect(problemaDeAvisos({})).toBeNull();
    expect(problemaDeAvisos({ WEB_PUSH_VAPID_PUBLICA: a.publica })).toMatch(/las tres/);
    expect(
      problemaDeAvisos({
        WEB_PUSH_VAPID_PUBLICA: a.publica,
        WEB_PUSH_VAPID_PRIVADA: a.privada,
        WEB_PUSH_SUJETO: 'mailto:x@y.co',
      }),
    ).toBeNull();
  });
});

describe('lista blanca de servicios de push (SSRF)', () => {
  const lista = ['fcm.googleapis.com', 'push.apple.com', '127.0.0.1'];
  const admite = (e: string, prod = true): boolean => esServicioDePushPermitido(e, lista, prod);

  it('admite los servicios de los navegadores por HTTPS', () => {
    expect(admite('https://fcm.googleapis.com/fcm/send/x')).toBe(true);
    expect(admite('https://web.push.apple.com/QGx')).toBe(true);
  });

  it('rechaza lo que convertiría a la API en un proxy hacia dentro', () => {
    expect(admite('https://metadata.google.internal/computeMetadata/v1/')).toBe(false);
    expect(admite('https://fcm.googleapis.com.atacante.co/x')).toBe(false);
    expect(admite('https://atacantefcm.googleapis.com.co/x')).toBe(false);
    expect(admite('https://usuario:clave@fcm.googleapis.com/x')).toBe(false);
    expect(admite('https://fcm.googleapis.com:8443/x')).toBe(false);
    expect(admite('http://fcm.googleapis.com/x')).toBe(false);
    expect(admite('no es una url')).toBe(false);
    expect(admite(`https://fcm.googleapis.com/${'x'.repeat(5000)}`)).toBe(false);
  });

  it('el servicio local de la suite sólo fuera de producción', () => {
    expect(admite('http://127.0.0.1:4567/push/a', false)).toBe(true);
    expect(admite('http://127.0.0.1:4567/push/a', true)).toBe(false);
  });
});
