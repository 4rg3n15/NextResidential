import { describe, expect, it } from 'vitest';
import { FirmanteHmacDeEnlaces } from './firmante-de-enlaces';

const MAESTRA = 'llave-de-biometria-solo-para-pruebas-32+';
const COP_A = '10000000-0000-4000-8000-000000000001';
const COP_B = '10000000-0000-4000-8000-000000000002';
const AHORA = new Date('2026-09-25T10:00:00.000Z');
const DATOS = {
  copropiedadId: COP_A,
  consentimientoId: '50000000-0000-4000-8000-000000000001',
  titularId: '40000000-0000-4000-8000-000000000103',
  expiraEn: new Date(AHORA.getTime() + 3_600_000),
  estadoAlEmitir: 'pendiente' as const,
};

describe('FirmanteHmacDeEnlaces · el enlace del titular (A3)', () => {
  const firmante = new FirmanteHmacDeEnlaces(MAESTRA);

  it('lo que firma, lo verifica, y devuelve exactamente lo firmado', () => {
    const token = firmante.firmar(DATOS);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(firmante.verificar(token, AHORA)).toEqual({
      ...DATOS,
      // La caducidad viaja en segundos: se pierde el submilisegundo, nada más.
      expiraEn: new Date(Math.floor(DATOS.expiraEn.getTime() / 1000) * 1000),
    });
  });

  it('no lleva ningún dato del titular más allá de identificadores', () => {
    const [cuerpo] = firmante.firmar(DATOS).split('.');
    const carga = Buffer.from(cuerpo ?? '', 'base64url').toString('utf8');
    expect(Object.keys(JSON.parse(carga) as object).sort()).toEqual(['c', 'e', 'k', 's', 't']);
  });

  it('un carácter cambiado en la carga invalida el enlace', () => {
    const token = firmante.firmar(DATOS);
    const [cuerpo, firma] = token.split('.') as [string, string];
    const carga = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as {
      t: string;
    };
    carga.t = '40000000-0000-4000-8000-000000000999';
    const alterado = `${Buffer.from(JSON.stringify(carga)).toString('base64url')}.${firma}`;
    expect(firmante.verificar(alterado, AHORA)).toBeNull();
  });

  it('la firma de una copropiedad no vale en otra: la llave se deriva por tenant', () => {
    const token = firmante.firmar(DATOS);
    const [cuerpo, firma] = token.split('.') as [string, string];
    const carga = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as {
      c: string;
    };
    carga.c = COP_B;
    const ajeno = `${Buffer.from(JSON.stringify(carga)).toString('base64url')}.${firma}`;
    expect(firmante.verificar(ajeno, AHORA)).toBeNull();
  });

  it('caduca: pasado `expiraEn` no vale, y un segundo antes sí', () => {
    const token = firmante.firmar(DATOS);
    expect(firmante.verificar(token, new Date(DATOS.expiraEn.getTime() - 1000))).not.toBeNull();
    expect(firmante.verificar(token, DATOS.expiraEn)).toBeNull();
  });

  it('otra llave maestra no verifica lo que firmó ésta', () => {
    const otro = new FirmanteHmacDeEnlaces('otra-llave-de-biometria-de-pruebas-32+');
    expect(otro.verificar(firmante.firmar(DATOS), AHORA)).toBeNull();
  });

  it.each(['', 'sin-punto', 'a.b.c', '!!!.###', `${'x'.repeat(3000)}.abc`, 'bm8=.abc'])(
    'un token malformado se rechaza sin lanzar: %s',
    (token) => {
      expect(firmante.verificar(token, AHORA)).toBeNull();
    },
  );

  it('una llave corta no construye el firmante', () => {
    expect(() => new FirmanteHmacDeEnlaces('corta')).toThrow(/32 caracteres/);
  });
});
