import { describe, expect, it } from 'vitest';
import { FranjaHoraria, HorarioDeZona } from './horario-zona';
import { esExito, esFallo } from '../compartido/resultado';
import type { Resultado } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';

const abrir = <T>(r: Resultado<T, ErrorDominio>): T => {
  if (!esExito(r)) throw new Error(`dato de prueba inválido: ${r.error.detalle}`);
  return r.valor;
};

/** Bogotá: UTC−5. Todas las horas locales de abajo son de la copropiedad. */
const BOGOTA = -300;
const MINUTOS_DEL_DIA = 1440;

/** Instante UTC correspondiente a una hora local de Bogotá. */
const local = (iso: string): Date => new Date(`${iso}-05:00`);

const franja = (
  dia: number,
  minutoInicio: number,
  minutoFin: number,
  continua = false,
): FranjaHoraria =>
  abrir(FranjaHoraria.crear({ dia, minutoInicio, minutoFin, continuaDelDiaAnterior: continua }));

const horario = (franjas: FranjaHoraria[]): HorarioDeZona =>
  abrir(HorarioDeZona.crear(franjas, BOGOTA));

describe('FranjaHoraria · validación', () => {
  it.each([
    ['día fuera de rango', { dia: 7, minutoInicio: 0, minutoFin: 60 }],
    ['minuto fuera del día', { dia: 1, minutoInicio: 0, minutoFin: 1441 }],
    ['fin antes que inicio', { dia: 1, minutoInicio: 600, minutoFin: 300 }],
    ['fin igual que inicio', { dia: 1, minutoInicio: 600, minutoFin: 600 }],
  ])('rechaza %s', (_caso, entrada) => {
    expect(esFallo(FranjaHoraria.crear(entrada))).toBe(true);
  });

  it('una franja que cruza la medianoche se rechaza: se expresa con dos (S-09)', () => {
    const r = FranjaHoraria.crear({ dia: 5, minutoInicio: 22 * 60, minutoFin: 60 });
    expect(esFallo(r)).toBe(true);
  });

  it('una continuación que no empieza a las 00:00 se rechaza', () => {
    const r = FranjaHoraria.crear({
      dia: 6,
      minutoInicio: 30,
      minutoFin: 60,
      continuaDelDiaAnterior: true,
    });
    expect(esFallo(r)).toBe(true);
  });
});

describe('HorarioDeZona · el minuto de apertura y el de cierre (CA-15)', () => {
  // Lunes (día 1 con getUTCDay) de 08:00 a 20:00, hora de Bogotá.
  const gimnasio = horario([franja(1, 8 * 60, 20 * 60)]);

  it('el MINUTO EXACTO de apertura ya está dentro', () => {
    expect(gimnasio.estaAbiertaEn(local('2026-09-07T08:00:00'))).toBe(true);
  });

  it('el minuto anterior a la apertura está fuera', () => {
    expect(gimnasio.estaAbiertaEn(local('2026-09-07T07:59:00'))).toBe(false);
  });

  it('el MINUTO EXACTO de cierre ya está FUERA: el intervalo es cerrado-abierto', () => {
    // Mismo criterio que `Vigencia`, y por lo mismo: con el cierre incluido, el
    // último minuto pertenecería a la jornada de hoy y a la de mañana.
    expect(gimnasio.estaAbiertaEn(local('2026-09-07T20:00:00'))).toBe(false);
  });

  it('el minuto anterior al cierre todavía está dentro', () => {
    expect(gimnasio.estaAbiertaEn(local('2026-09-07T19:59:00'))).toBe(true);
  });

  it('otro día de la semana está fuera', () => {
    expect(gimnasio.estaAbiertaEn(local('2026-09-08T10:00:00'))).toBe(false);
  });

  it('un horario vacío es zona sin restricción horaria', () => {
    expect(horario([]).estaAbiertaEn(local('2026-09-07T03:00:00'))).toBe(true);
  });
});

describe('HorarioDeZona · la zona horaria es del horario, no del proceso', () => {
  it('las 08:00 de Bogotá son las 13:00 UTC', () => {
    const gimnasio = horario([franja(1, 8 * 60, 20 * 60)]);
    expect(gimnasio.estaAbiertaEn(new Date('2026-09-07T13:00:00Z'))).toBe(true);
    expect(gimnasio.estaAbiertaEn(new Date('2026-09-07T08:00:00Z'))).toBe(false);
  });

  it('rechaza un desplazamiento imposible', () => {
    expect(esFallo(HorarioDeZona.crear([], 15 * 60))).toBe(true);
  });
});

describe('HorarioDeZona · S-09, el horario que cruza la medianoche', () => {
  // Salón social: viernes 22:00 → sábado 01:00, en dos franjas.
  const viernes = franja(5, 22 * 60, MINUTOS_DEL_DIA);
  const sabadoMadrugada = franja(6, 0, 60, true);
  const salon = horario([viernes, sabadoMadrugada]);

  it('la zona sigue abierta a las 23:59 del viernes', () => {
    expect(salon.estaAbiertaEn(local('2026-09-11T23:59:00'))).toBe(true);
  });

  it('y sigue abierta a las 00:30 del sábado, con la franja de continuación', () => {
    expect(salon.estaAbiertaEn(local('2026-09-12T00:30:00'))).toBe(true);
  });

  it('cierra a la 01:00 del sábado', () => {
    expect(salon.estaAbiertaEn(local('2026-09-12T01:00:00'))).toBe(false);
  });

  it('la franja del viernes NO cierra jornada: la continúa la del sábado', () => {
    expect(salon.cierraJornada(viernes)).toBe(false);
  });

  it('la franja del sábado SÍ cierra jornada', () => {
    expect(salon.cierraJornada(sabadoMadrugada)).toBe(true);
  });

  it('sin franja de continuación, terminar a las 24:00 SÍ cierra jornada', () => {
    const soloViernes = horario([viernes]);
    expect(soloViernes.cierraJornada(viernes)).toBe(true);
  });

  it('una franja que no llega a las 24:00 siempre cierra jornada', () => {
    const gimnasio = horario([franja(1, 8 * 60, 20 * 60)]);
    expect(gimnasio.cierraJornada(franja(1, 8 * 60, 20 * 60))).toBe(true);
  });

  it('`franjaEn` devuelve la franja que corresponde a cada lado del corte', () => {
    expect(salon.franjaEn(local('2026-09-11T23:00:00'))?.dia).toBe(5);
    expect(salon.franjaEn(local('2026-09-12T00:30:00'))?.dia).toBe(6);
    expect(salon.franjaEn(local('2026-09-12T02:00:00'))).toBeNull();
  });
});
