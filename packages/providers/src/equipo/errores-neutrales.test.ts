import { describe, expect, it } from 'vitest';
import { comoErrorNeutral } from './errores-del-fabricante';
import {
  BibliotecaLlena,
  CredencialRechazada,
  EquipoAveriado,
  EquipoOcupado,
  PeticionRechazada,
  ReinicioNecesario,
} from '../nucleo/errores';

const estado = (n: number, sub = ''): string =>
  `<ResponseStatus><statusCode>${String(n)}</statusCode>${sub}</ResponseStatus>`;

describe('del rechazo del fabricante a la clase NEUTRAL · una por reacción', () => {
  it('401/403 o badAuthorization → CredencialRechazada, que no se reintenta', () => {
    expect(comoErrorNeutral('d', '', 401)).toBeInstanceOf(CredencialRechazada);
    expect(comoErrorNeutral('d', '', 403)).toBeInstanceOf(CredencialRechazada);
    expect(
      comoErrorNeutral('d', '<subStatusCode>badAuthorization</subStatusCode>', 400),
    ).toBeInstanceOf(CredencialRechazada);
  });

  it('ocupado → EquipoOcupado con el código conservado en el detalle', () => {
    const e = comoErrorNeutral('d', estado(2, '<subStatusCode>deviceBusy</subStatusCode>'), 503);
    expect(e).toBeInstanceOf(EquipoOcupado);
    expect(e.message).toMatch(/HTTP 503/);
  });

  it('avería → EquipoAveriado · reinicio → ReinicioNecesario', () => {
    expect(comoErrorNeutral('d', estado(3), 500)).toBeInstanceOf(EquipoAveriado);
    expect(comoErrorNeutral('d', estado(7), 200)).toBeInstanceOf(ReinicioNecesario);
  });

  it('mal formado (5/6) o placa no reconocible → PeticionRechazada: el defecto es NUESTRO', () => {
    expect(comoErrorNeutral('d', estado(5), 400)).toBeInstanceOf(PeticionRechazada);
    expect(comoErrorNeutral('d', estado(6), 400)).toBeInstanceOf(PeticionRechazada);
    expect(comoErrorNeutral('d', '0x40001122', 400)).toBeInstanceOf(PeticionRechazada);
  });

  it('la biblioteca llena se reconoce por su nombre aunque el estado sea genérico', () => {
    expect(
      comoErrorNeutral('d', '{"statusCode":6,"subStatusCode":"faceLibraryFull"}', 400),
    ).toBeInstanceOf(BibliotecaLlena);
  });

  it('lo desconocido o sin código se trata como avería, nunca como éxito', () => {
    expect(comoErrorNeutral('d', 'basura', 500)).toBeInstanceOf(EquipoAveriado);
    expect(comoErrorNeutral('d', estado(4), 200)).toBeInstanceOf(EquipoAveriado);
  });
});
