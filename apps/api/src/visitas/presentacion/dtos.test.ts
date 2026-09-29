import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { esFallo } from '@ncr/domain-core';
import { GenerarVisitaDto, MENSAJE_DURACION_MINIMA, RepetirVisitaDto } from './dtos';
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
  it('revisarForma(true, 0) falla nombrando la hora de fin', () => {
    const r = revisarForma(true, 0);
    expect(esFallo(r)).toBe(true);
    if (esFallo(r)) expect(r.error.detalle).toMatch(/más de cero minutos.*posterior/);
  });

  it('y una duración negativa, igual', () => {
    expect(esFallo(revisarForma(true, -30))).toBe(true);
  });
});
