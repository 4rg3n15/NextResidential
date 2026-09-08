import { describe, expect, it } from 'vitest';
import { Zona } from './zona';
import { Aforo } from './aforo';
import { FranjaHoraria, HorarioDeZona } from './horario-zona';
import { esExito, esFallo } from '../compartido/resultado';
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

const GIMNASIO = horario([franja(1, 8 * 60, 20 * 60)]);
const SALON = horario([franja(5, 22 * 60, MINUTOS_DEL_DIA), franja(6, 0, 60, true)]);

const zona = (extra: Partial<Parameters<typeof Zona.crear>[0]> = {}): Zona =>
  abrir(
    Zona.crear({
      id: 'zon-1',
      copropiedadId: 'cop-1',
      nombre: 'Gimnasio',
      tipo: 'comun',
      horario: GIMNASIO,
      aforo: abrir(Aforo.crear(20)),
      ...extra,
    }),
  );

describe('Zona · construcción', () => {
  it('los valores por defecto son los del esquema', () => {
    const z = zona();
    expect(z.abierta).toBe(true);
    expect(z.politicaReinicio).toBe('cierre_horario');
    expect(z.normas).toEqual([]);
    expect(z.ultimoReinicio).toBeNull();
  });

  it('recorta el nombre y rechaza el vacío', () => {
    expect(zona({ nombre: '  Piscina  ' }).nombre).toBe('Piscina');
    expect(esFallo(Zona.crear({ ...datosBase(), nombre: '   ' }))).toBe(true);
  });

  it('exige copropiedad (RN-15)', () => {
    const r = Zona.crear({ ...datosBase(), copropiedadId: '' });
    expect(esFallo(r)).toBe(true);
  });

  it('rechaza demasiadas normas', () => {
    const muchas = Array.from({ length: 31 }, (_, i) => `norma ${i}`);
    expect(esFallo(Zona.crear({ ...datosBase(), normas: muchas }))).toBe(true);
  });

  it('copia la fecha del último reinicio', () => {
    const instante = local('2026-09-07T20:00:00');
    const z = zona({ ultimoReinicio: instante });
    instante.setFullYear(1999);
    expect(z.ultimoReinicio?.getUTCFullYear()).toBe(2026);
  });

  it('está congelada', () => {
    const z = zona();
    expect(() => {
      (z as unknown as Record<string, unknown>).abierta = false;
    }).toThrow();
  });
});

describe('Zona · disponibilidad (CA-14, CA-15)', () => {
  it('dentro de horario y con sitio, admite', () => {
    const d = zona().disponibilidadEn(local('2026-09-07T10:00:00'));
    expect(d).toEqual({ dentroDeHorario: true, aforoCompleto: false });
  });

  it('fuera de horario lo dice, aunque haya sitio de sobra', () => {
    const d = zona().disponibilidadEn(local('2026-09-07T21:00:00'));
    expect(d.dentroDeHorario).toBe(false);
  });

  it('con el aforo lleno lo dice, aunque esté dentro de horario', () => {
    const d = zona({ aforo: abrir(Aforo.crear(2, 2)) }).disponibilidadEn(
      local('2026-09-07T10:00:00'),
    );
    expect(d).toEqual({ dentroDeHorario: true, aforoCompleto: true });
  });

  it('el cierre manual del operador se reporta como fuera de horario (PB-04)', () => {
    // Para quien está en la puerta es lo mismo, y es lo que el mockup W-06
    // ofrece: cerrar una zona sin presencia física.
    const d = zona({ abierta: false }).disponibilidadEn(local('2026-09-07T10:00:00'));
    expect(d.dentroDeHorario).toBe(false);
  });

  it('una zona desactivada no admite a nadie', () => {
    const d = zona({ activa: false }).disponibilidadEn(local('2026-09-07T10:00:00'));
    expect(d.dentroDeHorario).toBe(false);
  });
});

describe('Zona · el aforo se proyecta al día antes de decidir (CU-05 6a, S-09)', () => {
  const lleno = () => abrir(Aforo.crear(10, 10));

  it('S-09 · en el corte de medianoche la zona sigue llena', () => {
    const z = zona({
      horario: SALON,
      aforo: lleno(),
      ultimoReinicio: local('2026-09-11T22:00:00'),
    });
    expect(z.disponibilidadEn(local('2026-09-12T00:00:00')).aforoCompleto).toBe(true);
  });

  it('tras el cierre real de la jornada, el contador se ha vaciado', () => {
    const z = zona({
      horario: SALON,
      aforo: lleno(),
      ultimoReinicio: local('2026-09-11T22:00:00'),
    });
    expect(z.conAforoAlDia(local('2026-09-12T01:00:00')).aforo.actual).toBe(0);
  });

  it('el reinicio sella su instante, para no repetirse', () => {
    const ahora = local('2026-09-12T01:00:00');
    const z = zona({
      horario: SALON,
      aforo: lleno(),
      ultimoReinicio: local('2026-09-11T22:00:00'),
    });
    const alDia = z.conAforoAlDia(ahora);
    expect(alDia.ultimoReinicio?.getTime()).toBe(ahora.getTime());
    expect(alDia.conAforoAlDia(ahora)).toBe(alDia);
  });

  it('si no toca reiniciar, devuelve la MISMA instancia', () => {
    const z = zona({ aforo: lleno(), ultimoReinicio: local('2026-09-07T08:00:00') });
    expect(z.conAforoAlDia(local('2026-09-07T10:00:00'))).toBe(z);
  });

  it('con el contador ya vacío no se reinicia por reiniciar', () => {
    const z = zona({ ultimoReinicio: local('2026-08-31T20:00:00') });
    expect(z.conAforoAlDia(local('2026-09-07T21:00:00'))).toBe(z);
  });
});

describe('Zona · métodos de intención', () => {
  it('cerrar y reabrir devuelven instancias nuevas', () => {
    const z = zona();
    const cerrada = z.cambiarApertura(false);
    expect(cerrada).not.toBe(z);
    expect(cerrada.abierta).toBe(false);
    expect(z.abierta).toBe(true);
  });

  it('cambiar la apertura al mismo valor devuelve la misma instancia', () => {
    const z = zona();
    expect(z.cambiarApertura(true)).toBe(z);
  });

  it('reconfigurar cambia lo indicado y NO toca el contador', () => {
    // Cambiar el horario de una zona con gente dentro no la vacía.
    const z = zona({ aforo: abrir(Aforo.crear(10, 4)) });
    const nueva = abrir(z.reconfigurar({ nombre: 'Salón social', horario: SALON }));
    expect(nueva.nombre).toBe('Salón social');
    expect(nueva.horario).toBe(SALON);
    expect(nueva.aforo.actual).toBe(4);
  });

  it('reconfigurar valida: un nombre vacío se rechaza', () => {
    expect(esFallo(zona().reconfigurar({ nombre: '' }))).toBe(true);
  });

  it('reconfigurar conserva identidad, copropiedad y apertura', () => {
    const z = zona({ abierta: false });
    const nueva = abrir(z.reconfigurar({ normas: ['Prohibido el vidrio'] }));
    expect(nueva.id).toBe(z.id);
    expect(nueva.copropiedadId).toBe(z.copropiedadId);
    expect(nueva.abierta).toBe(false);
    expect(nueva.normas).toEqual(['Prohibido el vidrio']);
  });
});

const datosBase = (): Parameters<typeof Zona.crear>[0] => ({
  id: 'zon-1',
  copropiedadId: 'cop-1',
  nombre: 'Gimnasio',
  tipo: 'comun',
  horario: GIMNASIO,
  aforo: abrir(Aforo.crear(20)),
});
