import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { esFallo } from '@ncr/domain-core';
import { GenerarVisitaDto, MENSAJE_DURACION_MINIMA, MiVisitaDto, RepetirVisitaDto } from './dtos';
import { revisarForma } from '../aplicacion/generar-visita';

/**
 * C9 (15-M) · UNA VISITA DE 0 MINUTOS NO EXISTE.
 *
 * En sitio se leyó «de 02:33 a 02:33» y pareció una visita sin duración. Las
 * dos barreras del módulo lo rechazan con palabras: el DTO (forma) y la capa
 * de aplicación (`revisarForma`, por si alguien llega sin pasar por el DTO).
 */
const cuerpoValido = {
  nombre: 'Ana Pérez',
  tipoDocumento: 'cedula',
  documento: '1020304050',
  viviendaId: '30000000-0000-4000-8000-000000000042',
  inicio: '2026-09-29T02:33:00.000Z',
  duracionMinutos: 60,
  casillaMarcada: true,
  foto: {
    contenidoBase64: 'QUJDREVGR0hJSktMTU5PUA==',
    tipoMime: 'image/jpeg',
    medidas: { rostrosDetectados: 1, nitidez: 0.9, iluminacion: 0.8, proporcionRostro: 0.4 },
  },
};

const mensajesDe = async (dto: object): Promise<string[]> =>
  (await validate(dto)).flatMap((e) => Object.values(e.constraints ?? {}));

describe('duración de la visita · el DTO rechaza 0 minutos con palabras', () => {
  it('GenerarVisitaDto · 0 minutos → error que habla de la hora de fin', async () => {
    const dto = plainToInstance(GenerarVisitaDto, { ...cuerpoValido, duracionMinutos: 0 });
    const mensajes = await mensajesDe(dto);
    expect(mensajes).toContain(MENSAJE_DURACION_MINIMA);
    expect(MENSAJE_DURACION_MINIMA).toMatch(/más de cero minutos/);
    expect(mensajes.join(' ')).not.toMatch(/must not be less than/);
  });

  it('RepetirVisitaDto · 0 minutos → el mismo mensaje', async () => {
    const dto = plainToInstance(RepetirVisitaDto, {
      inicio: cuerpoValido.inicio,
      duracionMinutos: 0,
      casillaMarcada: true,
      claveDeIdempotencia: 'clave-estable-1',
    });
    expect(await mensajesDe(dto)).toContain(MENSAJE_DURACION_MINIMA);
  });

  it('con 60 minutos el DTO no objeta la duración', async () => {
    const dto = plainToInstance(GenerarVisitaDto, cuerpoValido);
    expect((await mensajesDe(dto)).join(' ')).not.toMatch(/durar|duración/);
  });
});

describe('duración de la visita · la capa de aplicación también la exige', () => {
  const forma = (duracionMinutos: number) =>
    revisarForma({ casillaMarcada: true, duracionMinutos, placa: 'ABC123', conFoto: true });

  it('una duración de 0 falla nombrando la hora de fin', () => {
    const r = forma(0);
    expect(esFallo(r)).toBe(true);
    if (esFallo(r)) expect(r.error.detalle).toMatch(/más de cero minutos.*posterior/);
  });

  it('y una duración negativa, igual', () => {
    expect(esFallo(forma(-30))).toBe(true);
  });
});

/**
 * D-143 · la FORMA admite una visita sin foto y sin casilla: que llegue la
 * placa o la foto lo exige el caso de uso (`revisarForma`), no el DTO (§2.7.3).
 */
describe('D-143 · el DTO deja pasar una visita sólo con placa', () => {
  const sinFoto = {
    nombre: cuerpoValido.nombre,
    tipoDocumento: cuerpoValido.tipoDocumento,
    documento: cuerpoValido.documento,
    viviendaId: cuerpoValido.viviendaId,
    inicio: cuerpoValido.inicio,
    duracionMinutos: cuerpoValido.duracionMinutos,
  };

  it('GenerarVisitaDto sin foto ni casilla, con placa: forma válida', async () => {
    const dto = plainToInstance(GenerarVisitaDto, { ...sinFoto, placa: 'ABC123' });
    expect(await mensajesDe(dto)).toEqual([]);
  });

  it('MiVisitaDto sin foto ni casilla, con placa: forma válida', async () => {
    const dto = plainToInstance(MiVisitaDto, {
      nombre: sinFoto.nombre,
      documento: sinFoto.documento,
      inicio: sinFoto.inicio,
      duracionMinutos: sinFoto.duracionMinutos,
      placa: 'ABC123',
      claveDeIdempotencia: 'clave-estable-1',
    });
    expect(await mensajesDe(dto)).toEqual([]);
  });

  it('una foto que llega sigue validándose entera', async () => {
    const dto = plainToInstance(GenerarVisitaDto, {
      ...cuerpoValido,
      foto: { ...cuerpoValido.foto, tipoMime: 'image/gif' },
    });
    expect((await validate(dto)).map((e) => e.property)).toContain('foto');
  });
});
