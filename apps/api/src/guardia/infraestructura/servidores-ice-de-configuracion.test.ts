import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ESQUEMA_DE_ICE, problemaDeIce } from '../../configuracion/esquema-de-ice';
import {
  ServidoresIceDeConfiguracion,
  TTL_POR_OMISION_S,
  credencialTurn,
} from './servidores-ice-de-configuracion';

const SECRETO = 'secreto-compartido-con-el-turn-de-pruebas-0123456789';
const AHORA = new Date('2026-10-02T12:00:00Z');
const reloj = { ahora: () => AHORA };
const USUARIO = '00000000-0000-4000-8000-0000000000c7';
const esquema = z.object(ESQUEMA_DE_ICE);

describe('E2 · los servidores ICE de la consola (15-Q2)', () => {
  it('sin nada configurado, la lista va VACÍA: la consola negocia como siempre (R1)', () => {
    expect(new ServidoresIceDeConfiguracion({}, reloj).para(USUARIO)).toEqual({
      iceServers: [],
      ttlSegundos: TTL_POR_OMISION_S,
    });
  });

  it('STUN sin credencial; TURN con credencial EFÍMERA que el TURN puede comprobar', () => {
    const r = new ServidoresIceDeConfiguracion(
      {
        WEBRTC_STUN_URLS: ['stun:stun.ejemplo.invalid:3478'],
        WEBRTC_TURN_URLS: ['turns:turn.ejemplo.invalid:5349?transport=tcp'],
        WEBRTC_TURN_SECRETO: SECRETO,
        WEBRTC_TURN_TTL_SEGUNDOS: 300,
      },
      reloj,
    ).para(USUARIO);
    expect(r.ttlSegundos).toBe(300);
    expect(r.iceServers[0]).toEqual({ urls: ['stun:stun.ejemplo.invalid:3478'] });
    const turn = r.iceServers[1];
    const expira = AHORA.getTime() / 1000 + 300;
    expect(turn?.username).toBe(`${String(expira)}:${USUARIO}`);
    // Lo mismo que calcula coturn con `static-auth-secret`: HMAC-SHA1 en base64.
    const esperada = createHmac('sha1', SECRETO)
      .update(turn?.username ?? '')
      .digest('base64');
    expect(turn?.credential).toBe(esperada);
    // El secreto no viaja, ni en claro ni dentro de nada.
    expect(JSON.stringify(r)).not.toContain(SECRETO);
  });

  it('la credencial está atada a quien la pidió y a cuándo: otra persona, otra credencial', () => {
    const a = credencialTurn(SECRETO, 'uno', 100);
    expect(credencialTurn(SECRETO, 'dos', 100).credential).not.toBe(a.credential);
    expect(credencialTurn(SECRETO, 'uno', 101).credential).not.toBe(a.credential);
  });
});

describe('E2 · el esquema de las variables ICE', () => {
  it('lee listas separadas por comas y rechaza lo que no es stun:/turn:', () => {
    const ok = esquema.parse({
      WEBRTC_STUN_URLS: 'stun:a.invalid:3478, stun:b.invalid:3478',
      WEBRTC_TURN_URLS: 'turn:c.invalid:3478,turns:c.invalid:5349',
    });
    expect(ok.WEBRTC_STUN_URLS).toEqual(['stun:a.invalid:3478', 'stun:b.invalid:3478']);
    expect(ok.WEBRTC_TURN_URLS).toEqual(['turn:c.invalid:3478', 'turns:c.invalid:5349']);
    expect(esquema.safeParse({ WEBRTC_STUN_URLS: 'http://a.invalid' }).success).toBe(false);
    expect(esquema.safeParse({ WEBRTC_TURN_URLS: 'stun:a.invalid' }).success).toBe(false);
    expect(esquema.safeParse({ WEBRTC_TURN_URLS: ' , ' }).success).toBe(false);
  });

  it('el secreto tiene forma de secreto y el TTL, límites', () => {
    expect(esquema.safeParse({ WEBRTC_TURN_SECRETO: 'corto' }).success).toBe(false);
    expect(esquema.safeParse({ WEBRTC_TURN_SECRETO: `${SECRETO} pegado` }).success).toBe(false);
    expect(esquema.safeParse({ WEBRTC_TURN_TTL_SEGUNDOS: '30' }).success).toBe(false);
    expect(esquema.parse({ WEBRTC_TURN_TTL_SEGUNDOS: '900' }).WEBRTC_TURN_TTL_SEGUNDOS).toBe(900);
  });

  it('un TURN sin su secreto, o un secreto sin TURN, no arranca', () => {
    expect(problemaDeIce({})).toBeNull();
    expect(
      problemaDeIce({ WEBRTC_TURN_URLS: ['turn:x.invalid'], WEBRTC_TURN_SECRETO: SECRETO }),
    ).toBeNull();
    expect(problemaDeIce({ WEBRTC_TURN_URLS: ['turn:x.invalid'] })).toMatch(
      /sin WEBRTC_TURN_SECRETO/,
    );
    expect(problemaDeIce({ WEBRTC_TURN_SECRETO: SECRETO })).toMatch(/sin WEBRTC_TURN_URLS/);
  });
});
