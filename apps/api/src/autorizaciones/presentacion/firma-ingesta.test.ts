import { describe, expect, it } from 'vitest';
import { firmar, mensajeCanonico, verificarFirma } from './firma-ingesta';

const SECRETO = 'un-secreto-de-pruebas-de-al-menos-32-caracteres';
const CUERPO = '{"copropiedadId":"c-1","referenciaExterna":"ev-9"}';
const AHORA = new Date('2026-09-08T14:00:00Z');
const marca = String(Math.floor(AHORA.getTime() / 1000));

const base = {
  cuerpoCrudo: CUERPO,
  secreto: SECRETO,
  ahora: AHORA,
  ventanaSegundos: 300,
};

describe('RNF-03.11 · firma del Alarm Server', () => {
  it('acepta una firma correcta y reciente', () => {
    const r = verificarFirma({
      ...base,
      firmaRecibida: firmar(SECRETO, marca, CUERPO),
      marcaTemporal: marca,
    });
    expect(r.valida).toBe(true);
  });

  it('rechaza sin firma y sin marca temporal', () => {
    expect(verificarFirma({ ...base, firmaRecibida: undefined, marcaTemporal: marca })).toEqual({
      valida: false,
      motivo: 'FALTA_FIRMA',
    });
    expect(verificarFirma({ ...base, firmaRecibida: '', marcaTemporal: marca })).toEqual({
      valida: false,
      motivo: 'FALTA_FIRMA',
    });
    expect(verificarFirma({ ...base, firmaRecibida: 'abc', marcaTemporal: undefined })).toEqual({
      valida: false,
      motivo: 'FALTA_MARCA',
    });
    expect(verificarFirma({ ...base, firmaRecibida: 'abc', marcaTemporal: '' })).toEqual({
      valida: false,
      motivo: 'FALTA_MARCA',
    });
  });

  it('rechaza una marca que no es un número', () => {
    expect(verificarFirma({ ...base, firmaRecibida: 'abc', marcaTemporal: 'ayer' })).toEqual({
      valida: false,
      motivo: 'MARCA_NO_NUMERICA',
    });
  });

  it('rechaza fuera de la ventana, en los dos sentidos (anti repetición)', () => {
    const vieja = String(Math.floor(AHORA.getTime() / 1000) - 400);
    expect(
      verificarFirma({
        ...base,
        firmaRecibida: firmar(SECRETO, vieja, CUERPO),
        marcaTemporal: vieja,
      }),
    ).toEqual({ valida: false, motivo: 'FUERA_DE_VENTANA' });
    const futura = String(Math.floor(AHORA.getTime() / 1000) + 400);
    expect(
      verificarFirma({
        ...base,
        firmaRecibida: firmar(SECRETO, futura, CUERPO),
        marcaTemporal: futura,
      }),
    ).toEqual({ valida: false, motivo: 'FUERA_DE_VENTANA' });
  });

  it('la firma cubre el cuerpo: alterar un byte la invalida', () => {
    const firma = firmar(SECRETO, marca, CUERPO);
    const r = verificarFirma({
      ...base,
      cuerpoCrudo: `${CUERPO} `,
      firmaRecibida: firma,
      marcaTemporal: marca,
    });
    expect(r).toEqual({ valida: false, motivo: 'FIRMA_NO_COINCIDE' });
  });

  it('la firma cubre la marca: reutilizarla con otra marca no sirve', () => {
    const firma = firmar(SECRETO, marca, CUERPO);
    const otra = String(Number(marca) + 10);
    expect(verificarFirma({ ...base, firmaRecibida: firma, marcaTemporal: otra })).toEqual({
      valida: false,
      motivo: 'FIRMA_NO_COINCIDE',
    });
  });

  it('otro secreto produce otra firma', () => {
    const ajena = firmar('otro-secreto-igual-de-largo-para-la-prueba', marca, CUERPO);
    expect(verificarFirma({ ...base, firmaRecibida: ajena, marcaTemporal: marca })).toEqual({
      valida: false,
      motivo: 'FIRMA_NO_COINCIDE',
    });
  });

  it('una firma de longitud distinta se rechaza sin comparar en tiempo constante', () => {
    expect(verificarFirma({ ...base, firmaRecibida: 'corta', marcaTemporal: marca })).toEqual({
      valida: false,
      motivo: 'FIRMA_NO_COINCIDE',
    });
  });

  it('el mensaje canónico es marca.cuerpo y no admite otra forma', () => {
    expect(mensajeCanonico('123', '{}')).toBe('123.{}');
  });
});
