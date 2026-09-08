import { beforeEach, describe, expect, it } from 'vitest';
import { Aforo, FranjaHoraria, HorarioDeZona, Zona, esExito, esFallo } from '@ncr/domain-core';
import type { ErrorDominio, Reloj, Resultado } from '@ncr/domain-core';
import {
  AutorizarZonaAVisitante,
  ConfigurarZona,
  LiberarAforo,
  ValidarAforo,
} from './casos-de-uso';
import { RepositorioZonasEnMemoria } from '../infraestructura/repositorio-zonas-memoria';

const abrir = <T>(r: Resultado<T, ErrorDominio>): T => {
  if (!esExito(r)) throw new Error(`dato de prueba inválido: ${r.error.detalle}`);
  return r.valor;
};

const COP = 'cop-1';
const ZONA = 'zon-1';
const ACTOR = 'act-1';
const BOGOTA = -300;
const MINUTOS_DEL_DIA = 1440;

/** Instante UTC correspondiente a una hora local de Bogotá. */
const local = (iso: string): Date => new Date(`${iso}-05:00`);

const relojEn = (instante: Date): Reloj & { mover(a: Date): void } => {
  let ahora = instante;
  return { ahora: () => new Date(ahora.getTime()), mover: (a: Date) => (ahora = a) };
};

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

/** Gimnasio: lunes de 08:00 a 20:00 (hora de Bogotá). */
const GIMNASIO = horario([franja(1, 8 * 60, 20 * 60)]);
/** Salón: viernes 22:00 → sábado 01:00, en dos franjas (S-09). */
const SALON = horario([franja(5, 22 * 60, MINUTOS_DEL_DIA), franja(6, 0, 60, true)]);

const zona = (extra: Partial<Parameters<typeof Zona.crear>[0]> = {}): Zona =>
  abrir(
    Zona.crear({
      id: ZONA,
      copropiedadId: COP,
      nombre: 'Gimnasio',
      tipo: 'comun',
      horario: GIMNASIO,
      aforo: abrir(Aforo.crear(3)),
      ...extra,
    }),
  );

let repo: RepositorioZonasEnMemoria;
beforeEach(() => {
  repo = new RepositorioZonasEnMemoria();
});

describe('ValidarAforo · el límite exacto y el límite más uno (CA-14)', () => {
  const dentroDeHorario = local('2026-09-07T10:00:00');

  it('admite exactamente hasta el aforo máximo', async () => {
    repo.declarar(zona());
    const caso = new ValidarAforo(repo, relojEn(dentroDeHorario));

    for (let i = 1; i <= 3; i += 1) {
      const v = await caso.ejecutar(COP, ZONA);
      expect(v).toEqual({ admitido: true, conteo: i });
    }
  });

  it('el ingreso número máximo+1 se deniega con AFORO_SUPERADO', async () => {
    repo.declarar(zona({ aforo: abrir(Aforo.crear(3, 3)) }));
    const caso = new ValidarAforo(repo, relojEn(dentroDeHorario));

    expect(await caso.ejecutar(COP, ZONA)).toEqual({
      admitido: false,
      motivo: 'AFORO_SUPERADO',
    });
  });

  it('con la última plaza libre todavía admite', async () => {
    repo.declarar(zona({ aforo: abrir(Aforo.crear(3, 2)) }));
    const caso = new ValidarAforo(repo, relojEn(dentroDeHorario));
    expect(await caso.ejecutar(COP, ZONA)).toEqual({ admitido: true, conteo: 3 });
  });

  it('una zona con aforo cero no admite a nadie', async () => {
    repo.declarar(zona({ aforo: abrir(Aforo.crear(0)) }));
    const caso = new ValidarAforo(repo, relojEn(dentroDeHorario));
    expect((await caso.ejecutar(COP, ZONA)).admitido).toBe(false);
  });

  it('una zona que no existe se DENIEGA, no se admite (§2.1.4)', async () => {
    const caso = new ValidarAforo(repo, relojEn(dentroDeHorario));
    expect(await caso.ejecutar(COP, 'inexistente')).toEqual({
      admitido: false,
      motivo: 'FALLO_TECNICO',
    });
  });
});

describe('ValidarAforo · el minuto de apertura y el de cierre (CA-15)', () => {
  beforeEach(() => repo.declarar(zona()));

  it('EN EL MINUTO EXACTO de apertura ya admite', async () => {
    const caso = new ValidarAforo(repo, relojEn(local('2026-09-07T08:00:00')));
    expect((await caso.ejecutar(COP, ZONA)).admitido).toBe(true);
  });

  it('un minuto antes de abrir, deniega por horario', async () => {
    const caso = new ValidarAforo(repo, relojEn(local('2026-09-07T07:59:00')));
    expect(await caso.ejecutar(COP, ZONA)).toEqual({
      admitido: false,
      motivo: 'FUERA_DE_HORARIO',
    });
  });

  it('un minuto antes de cerrar, todavía admite', async () => {
    const caso = new ValidarAforo(repo, relojEn(local('2026-09-07T19:59:00')));
    expect((await caso.ejecutar(COP, ZONA)).admitido).toBe(true);
  });

  it('EN EL MINUTO EXACTO de cierre ya deniega: el intervalo es cerrado-abierto', async () => {
    const caso = new ValidarAforo(repo, relojEn(local('2026-09-07T20:00:00')));
    expect(await caso.ejecutar(COP, ZONA)).toEqual({
      admitido: false,
      motivo: 'FUERA_DE_HORARIO',
    });
  });

  it('el horario se comprueba ANTES que el aforo', async () => {
    // Una zona cerrada Y llena responde FUERA_DE_HORARIO: es el motivo que el
    // operador necesita leer. Decir «aforo superado» de una zona que ni
    // siquiera abre lo mandaría a mirar el sitio equivocado.
    repo.declarar(zona({ aforo: abrir(Aforo.crear(1, 1)) }));
    const caso = new ValidarAforo(repo, relojEn(local('2026-09-07T21:00:00')));
    expect((await caso.ejecutar(COP, ZONA)).admitido).toBe(false);
    expect(await caso.ejecutar(COP, ZONA)).toEqual({
      admitido: false,
      motivo: 'FUERA_DE_HORARIO',
    });
  });

  it('el cierre manual del operador también deniega por horario (PB-04)', async () => {
    repo.declarar(zona({ abierta: false }));
    const caso = new ValidarAforo(repo, relojEn(local('2026-09-07T10:00:00')));
    expect(await caso.ejecutar(COP, ZONA)).toEqual({
      admitido: false,
      motivo: 'FUERA_DE_HORARIO',
    });
  });
});

describe('ValidarAforo · S-09, el corte de medianoche no libera plazas', () => {
  const llena = () =>
    zona({
      horario: SALON,
      aforo: abrir(Aforo.crear(2, 2)),
      ultimoReinicio: local('2026-09-11T22:00:00'),
    });

  it('a las 23:59 del viernes la zona sigue llena', async () => {
    repo.declarar(llena());
    const caso = new ValidarAforo(repo, relojEn(local('2026-09-11T23:59:00')));
    expect(await caso.ejecutar(COP, ZONA)).toEqual({
      admitido: false,
      motivo: 'AFORO_SUPERADO',
    });
  });

  it('EN EL CORTE de medianoche tampoco se vacía: sigue llena', async () => {
    repo.declarar(llena());
    const caso = new ValidarAforo(repo, relojEn(local('2026-09-12T00:00:00')));
    expect(await caso.ejecutar(COP, ZONA)).toEqual({
      admitido: false,
      motivo: 'AFORO_SUPERADO',
    });
  });

  it('a las 00:30, dentro de la franja de continuación, tampoco', async () => {
    repo.declarar(llena());
    const caso = new ValidarAforo(repo, relojEn(local('2026-09-12T00:30:00')));
    expect((await caso.ejecutar(COP, ZONA)).admitido).toBe(false);
  });

  it('tras cerrar la jornada y volver a abrir, la zona admite de nuevo', async () => {
    repo.declarar(llena());
    // Viernes siguiente, 22:30: la jornada del sábado 01:00 ya cerró.
    const caso = new ValidarAforo(repo, relojEn(local('2026-09-18T22:30:00')));
    expect(await caso.ejecutar(COP, ZONA)).toEqual({ admitido: true, conteo: 1 });
  });

  it('el reinicio se PERSISTE antes de ocupar, no solo se proyecta', async () => {
    // Si solo se proyectara en memoria, el incremento chocaría contra el
    // contador viejo de la base y negaría plazas que ya están libres.
    repo.declarar(llena());
    const caso = new ValidarAforo(repo, relojEn(local('2026-09-18T22:30:00')));
    await caso.ejecutar(COP, ZONA);

    const guardada = await repo.porId(COP, ZONA);
    expect(guardada?.aforo.actual).toBe(1);
  });
});

describe('LiberarAforo · CU-05 excepción 6a', () => {
  it('libera una plaza y devuelve el conteo', async () => {
    repo.declarar(zona({ aforo: abrir(Aforo.crear(3, 2)) }));
    expect(await new LiberarAforo(repo).ejecutar(COP, ZONA)).toBe(1);
  });

  it('con el contador en cero NO baja de cero', async () => {
    repo.declarar(zona());
    expect(await new LiberarAforo(repo).ejecutar(COP, ZONA)).toBe(0);
  });

  it('una zona inexistente devuelve cero sin romper', async () => {
    expect(await new LiberarAforo(repo).ejecutar(COP, 'inexistente')).toBe(0);
  });

  it('liberar deja sitio para un ingreso nuevo', async () => {
    repo.declarar(zona({ aforo: abrir(Aforo.crear(1, 1)) }));
    const validar = new ValidarAforo(repo, relojEn(local('2026-09-07T10:00:00')));

    expect((await validar.ejecutar(COP, ZONA)).admitido).toBe(false);
    await new LiberarAforo(repo).ejecutar(COP, ZONA);
    expect((await validar.ejecutar(COP, ZONA)).admitido).toBe(true);
  });
});

describe('ConfigurarZona · HU-18', () => {
  it('cambia el nombre, las normas y la apertura', async () => {
    repo.declarar(zona());
    const r = await new ConfigurarZona(repo).ejecutar(COP, ZONA, ACTOR, {
      nombre: 'Salón social',
      normas: ['Prohibido el vidrio'],
      abierta: false,
    });
    const actualizada = abrir(r);
    expect(actualizada.nombre).toBe('Salón social');
    expect(actualizada.normas).toEqual(['Prohibido el vidrio']);
    expect(actualizada.abierta).toBe(false);
    expect((await repo.porId(COP, ZONA))?.nombre).toBe('Salón social');
  });

  it('subir el aforo NO vacía el contador', async () => {
    repo.declarar(zona({ aforo: abrir(Aforo.crear(3, 2)) }));
    const r = await new ConfigurarZona(repo).ejecutar(COP, ZONA, ACTOR, {
      aforo: abrir(Aforo.crear(10, 2)),
    });
    expect(abrir(r).aforo.actual).toBe(2);
  });

  it('una zona inexistente devuelve ENTIDAD_NO_ENCONTRADA', async () => {
    const r = await new ConfigurarZona(repo).ejecutar(COP, 'inexistente', ACTOR, {});
    expect(esFallo(r)).toBe(true);
  });

  it('un nombre vacío se rechaza y NO se guarda', async () => {
    repo.declarar(zona());
    const r = await new ConfigurarZona(repo).ejecutar(COP, ZONA, ACTOR, { nombre: '  ' });
    expect(esFallo(r)).toBe(true);
    expect((await repo.porId(COP, ZONA))?.nombre).toBe('Gimnasio');
  });
});

describe('AutorizarZonaAVisitante · HU-19, HU-20', () => {
  it('otorga el permiso sobre la zona', async () => {
    repo.declarar(zona());
    const caso = new AutorizarZonaAVisitante(repo, repo.permisosDeZona);
    expect(esExito(await caso.ejecutar(COP, 'aut-1', ZONA, ACTOR))).toBe(true);
    expect(await repo.permisosDeZona.zonasDe(COP, 'aut-1')).toEqual([ZONA]);
  });

  it('conceder dos veces el mismo permiso no es un error', async () => {
    repo.declarar(zona());
    const caso = new AutorizarZonaAVisitante(repo, repo.permisosDeZona);
    await caso.ejecutar(COP, 'aut-1', ZONA, ACTOR);
    expect(esExito(await caso.ejecutar(COP, 'aut-1', ZONA, ACTOR))).toBe(true);
    expect(await repo.permisosDeZona.zonasDe(COP, 'aut-1')).toEqual([ZONA]);
  });

  it('una zona inexistente se rechaza', async () => {
    const caso = new AutorizarZonaAVisitante(repo, repo.permisosDeZona);
    expect(esFallo(await caso.ejecutar(COP, 'aut-1', 'inexistente', ACTOR))).toBe(true);
  });

  it('el permiso NO abre la zona por sí solo', async () => {
    // Dar permiso es una de las tres condiciones, no las tres. Es lo que
    // permite que el evento diga cuál de ellas falló.
    repo.declarar(zona());
    await new AutorizarZonaAVisitante(repo, repo.permisosDeZona).ejecutar(
      COP,
      'aut-1',
      ZONA,
      ACTOR,
    );
    const fuera = new ValidarAforo(repo, relojEn(local('2026-09-07T21:00:00')));
    expect((await fuera.ejecutar(COP, ZONA)).admitido).toBe(false);
  });
});
