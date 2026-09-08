import { describe, expect, it } from 'vitest';
import { FranjaHoraria, HorarioDeZona } from './horario-zona';
import { debeReiniciarAforo, ultimoCierreDeJornada } from './politica-reinicio';
import type { PoliticaReinicio } from './politica-reinicio';
import { esExito } from '../compartido/resultado';
import type { Resultado } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';

const abrir = <T>(r: Resultado<T, ErrorDominio>): T => {
  if (!esExito(r)) throw new Error(`dato de prueba inválido: ${r.error.detalle}`);
  return r.valor;
};

const BOGOTA = -300;
const MINUTOS_DEL_DIA = 1440;
const local = (iso: string): Date => new Date(`${iso}-05:00`);

const franja = (dia: number, ini: number, fin: number, continua = false): FranjaHoraria =>
  abrir(
    FranjaHoraria.crear({
      dia,
      minutoInicio: ini,
      minutoFin: fin,
      continuaDelDiaAnterior: continua,
    }),
  );
const horario = (franjas: FranjaHoraria[]): HorarioDeZona =>
  abrir(HorarioDeZona.crear(franjas, BOGOTA));

/** Gimnasio: lunes de 08:00 a 20:00, hora de Bogotá. */
const GIMNASIO = horario([franja(1, 8 * 60, 20 * 60)]);

/** Salón social: viernes 22:00 → sábado 01:00, en dos franjas (S-09). */
const SALON = horario([franja(5, 22 * 60, MINUTOS_DEL_DIA), franja(6, 0, 60, true)]);

describe('ultimoCierreDeJornada', () => {
  it('devuelve el cierre de hoy si ya ocurrió', () => {
    // Lunes 7 de septiembre de 2026, 21:00 local: la zona cerró a las 20:00.
    const cierre = ultimoCierreDeJornada(GIMNASIO, local('2026-09-07T21:00:00'));
    expect(cierre?.getTime()).toBe(local('2026-09-07T20:00:00').getTime());
  });

  it('si el cierre de hoy aún no ha llegado, devuelve el de la semana pasada', () => {
    const cierre = ultimoCierreDeJornada(GIMNASIO, local('2026-09-07T10:00:00'));
    expect(cierre?.getTime()).toBe(local('2026-08-31T20:00:00').getTime());
  });

  it('sin franjas no hay cierre que calcular', () => {
    expect(ultimoCierreDeJornada(horario([]), local('2026-09-07T10:00:00'))).toBeNull();
  });

  it('S-09 · a las 00:30 del sábado el último cierre es el de la semana ANTERIOR', () => {
    // La jornada en curso todavía no ha cerrado: cierra a la 01:00.
    const cierre = ultimoCierreDeJornada(SALON, local('2026-09-12T00:30:00'));
    expect(cierre?.getTime()).toBe(local('2026-09-05T01:00:00').getTime());
  });

  it('S-09 · a la 01:00 del sábado el cierre ya es el de esta jornada', () => {
    const cierre = ultimoCierreDeJornada(SALON, local('2026-09-12T01:00:00'));
    expect(cierre?.getTime()).toBe(local('2026-09-12T01:00:00').getTime());
  });
});

describe('debeReiniciarAforo · S-09, el corte de medianoche NO reinicia', () => {
  const abiertaDesde = local('2026-09-11T22:00:00');

  it('a las 23:59 del viernes, con la zona llena, NO se reinicia', () => {
    expect(
      debeReiniciarAforo({
        politica: 'cierre_horario',
        horario: SALON,
        ultimoReinicio: abiertaDesde,
        ahora: local('2026-09-11T23:59:00'),
      }),
    ).toBe(false);
  });

  it('EN EL CORTE EXACTO de medianoche tampoco se reinicia', () => {
    // Es la prueba que da nombre a S-09. Reiniciar aquí vaciaría el contador
    // con la zona llena de gente dentro, y a las 00:01 admitiría el aforo
    // entero otra vez: la violación de RN-14 que el contador existe para
    // impedir.
    expect(
      debeReiniciarAforo({
        politica: 'cierre_horario',
        horario: SALON,
        ultimoReinicio: abiertaDesde,
        ahora: local('2026-09-12T00:00:00'),
      }),
    ).toBe(false);
  });

  it('a las 00:30 del sábado, dentro de la franja de continuación, tampoco', () => {
    expect(
      debeReiniciarAforo({
        politica: 'cierre_horario',
        horario: SALON,
        ultimoReinicio: abiertaDesde,
        ahora: local('2026-09-12T00:30:00'),
      }),
    ).toBe(false);
  });

  it('a la 01:00 del sábado, cuando cierra la JORNADA, SÍ se reinicia', () => {
    expect(
      debeReiniciarAforo({
        politica: 'cierre_horario',
        horario: SALON,
        ultimoReinicio: abiertaDesde,
        ahora: local('2026-09-12T01:00:00'),
      }),
    ).toBe(true);
  });

  it('y sigue correspondiendo más tarde, mientras nadie haya reiniciado', () => {
    expect(
      debeReiniciarAforo({
        politica: 'cierre_horario',
        horario: SALON,
        ultimoReinicio: abiertaDesde,
        ahora: local('2026-09-12T09:00:00'),
      }),
    ).toBe(true);
  });

  it('una vez reiniciado tras el cierre, no se vuelve a reiniciar', () => {
    expect(
      debeReiniciarAforo({
        politica: 'cierre_horario',
        horario: SALON,
        ultimoReinicio: local('2026-09-12T01:00:00'),
        ahora: local('2026-09-12T09:00:00'),
      }),
    ).toBe(false);
  });
});

describe('debeReiniciarAforo · el resto de las políticas y los bordes', () => {
  it.each<[PoliticaReinicio]>([['manual'], ['nunca']])(
    'la política `%s` no reinicia sola',
    (politica) => {
      expect(
        debeReiniciarAforo({
          politica,
          horario: GIMNASIO,
          ultimoReinicio: local('2026-08-31T21:00:00'),
          ahora: local('2026-09-07T21:00:00'),
        }),
      ).toBe(false);
    },
  );

  it('una zona sin horario nunca reinicia automáticamente', () => {
    expect(
      debeReiniciarAforo({
        politica: 'cierre_horario',
        horario: horario([]),
        ultimoReinicio: null,
        ahora: local('2026-09-07T21:00:00'),
      }),
    ).toBe(false);
  });

  it('una zona nunca reiniciada Y ABIERTA no se vacía a mitad de jornada', () => {
    expect(
      debeReiniciarAforo({
        politica: 'cierre_horario',
        horario: GIMNASIO,
        ultimoReinicio: null,
        ahora: local('2026-09-07T10:00:00'),
      }),
    ).toBe(false);
  });

  it('una zona nunca reiniciada y CERRADA sí inicia su ciclo', () => {
    expect(
      debeReiniciarAforo({
        politica: 'cierre_horario',
        horario: GIMNASIO,
        ultimoReinicio: null,
        ahora: local('2026-09-07T21:00:00'),
      }),
    ).toBe(true);
  });

  it('el minuto EXACTO del cierre ya cuenta como cierre', () => {
    expect(
      debeReiniciarAforo({
        politica: 'cierre_horario',
        horario: GIMNASIO,
        ultimoReinicio: local('2026-09-07T08:00:00'),
        ahora: local('2026-09-07T20:00:00'),
      }),
    ).toBe(true);
  });

  it('un minuto antes del cierre, todavía no', () => {
    expect(
      debeReiniciarAforo({
        politica: 'cierre_horario',
        horario: GIMNASIO,
        ultimoReinicio: local('2026-09-07T08:00:00'),
        ahora: local('2026-09-07T19:59:00'),
      }),
    ).toBe(false);
  });
});
