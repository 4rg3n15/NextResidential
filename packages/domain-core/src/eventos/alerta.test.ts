import { describe, expect, it } from 'vitest';
import { Alerta, PLAZO_ESCALAMIENTO_MS } from './alerta';
import { esExito, esFallo } from '../compartido/resultado';
import type { Resultado } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';

const T0 = new Date('2026-09-08T14:00:00Z');
const mas = (ms: number): Date => new Date(T0.getTime() + ms);

const abrir = <T>(r: Resultado<T, ErrorDominio>): T => {
  if (!esExito(r)) throw new Error(`dato de prueba inválido: ${r.error.detalle}`);
  return r.valor;
};
const error = <T>(r: Resultado<T, ErrorDominio>): ErrorDominio => {
  if (!esFallo(r)) throw new Error('se esperaba un fallo');
  return r.error;
};

const alerta = (extra: Record<string, unknown> = {}): Alerta =>
  abrir(
    Alerta.abrir({
      id: 'al-1',
      copropiedadId: 'cop-1',
      tipo: 'lista_negra',
      severidad: 'critica',
      generadaEn: T0,
      eventoId: 'evt-1',
      ...extra,
    }),
  );

describe('Alerta · apertura', () => {
  it('nace abierta y sin escalar', () => {
    const a = alerta();
    expect(a.estado).toBe('abierta');
    expect(a.escaladaEn).toBeNull();
    expect(a.escaladaDentroDelPlazo()).toBeNull();
  });

  it('exige un origen: evento o dispositivo', () => {
    const r = Alerta.abrir({
      id: 'al-2',
      copropiedadId: 'cop-1',
      tipo: 'sabotaje',
      severidad: 'alta',
      generadaEn: T0,
    });
    expect(error(r).codigo).toBe('INVARIANTE_VIOLADA');
  });

  it('acepta un origen de dispositivo sin evento', () => {
    expect(
      esExito(
        Alerta.abrir({
          id: 'al-3',
          copropiedadId: 'cop-1',
          tipo: 'dispositivo_caido',
          severidad: 'alta',
          generadaEn: T0,
          dispositivoId: 'disp-1',
        }),
      ),
    ).toBe(true);
  });

  it('exige copropiedad (RN-15)', () => {
    const r = Alerta.abrir({
      id: 'al-4',
      copropiedadId: '',
      tipo: 'panico',
      severidad: 'critica',
      generadaEn: T0,
      eventoId: 'evt-1',
    });
    expect(error(r).regla).toBe('RN-15');
  });

  it('copia la fecha de generación', () => {
    const instante = new Date(T0.getTime());
    const a = alerta({ generadaEn: instante });
    instante.setFullYear(1999);
    expect(a.generadaEn.getTime()).toBe(T0.getTime());
  });
});

describe('Alerta · KPI-25, el plazo de 10 s vive en el dominio', () => {
  it('el plazo es de 10 000 ms (CA-18)', () => {
    expect(PLAZO_ESCALAMIENTO_MS).toBe(10_000);
  });

  it('escalar dentro del plazo cuenta como cumplido', () => {
    expect(alerta().escalar(mas(9_999)).escaladaDentroDelPlazo()).toBe(true);
  });

  it('el borde exacto de 10 s cumple', () => {
    expect(alerta().escalar(mas(10_000)).escaladaDentroDelPlazo()).toBe(true);
  });

  it('un milisegundo más, no', () => {
    expect(alerta().escalar(mas(10_001)).escaladaDentroDelPlazo()).toBe(false);
  });

  it('sin escalar devuelve null, no true: lo no medido no se da por bueno', () => {
    expect(alerta().escaladaDentroDelPlazo()).toBeNull();
  });

  it('escalar dos veces conserva el primer instante', () => {
    const a = alerta().escalar(mas(1_000));
    expect(a.escalar(mas(30_000))).toBe(a);
    expect(a.escaladaEn?.getTime()).toBe(mas(1_000).getTime());
  });
});

describe('Alerta · transiciones por métodos de intención', () => {
  it('atender deja constancia de quién y cuándo', () => {
    const a = abrir(alerta().atender('op-1', mas(5_000)));
    expect(a.estado).toBe('en_atencion');
    expect(a.atendidaPor).toBe('op-1');
    expect(a.atendidaEn?.getTime()).toBe(mas(5_000).getTime());
  });

  it('resolver exige notas', () => {
    expect(error(alerta().resolver(mas(1), '   ')).codigo).toBe('INVARIANTE_VIOLADA');
  });

  it('resolver con notas cierra la alerta', () => {
    const a = abrir(alerta().resolver(mas(60_000), 'falsa alarma verificada en cámara'));
    expect(a.estado).toBe('resuelta');
    expect(a.resueltaEn).not.toBeNull();
    expect(a.notas).toContain('falsa alarma');
  });

  it('una alerta resuelta no vuelve a atenderse', () => {
    const resuelta = abrir(alerta().resolver(mas(1), 'cerrada'));
    expect(error(resuelta.atender('op-2', mas(2))).codigo).toBe('OPERACION_NO_PERMITIDA');
  });

  it('cada transición devuelve una instancia nueva y no toca la anterior', () => {
    const a = alerta();
    const b = a.escalar(mas(100));
    expect(b).not.toBe(a);
    expect(a.escaladaEn).toBeNull();
  });

  it('el escalamiento sobrevive a las transiciones posteriores', () => {
    const a = abrir(alerta().escalar(mas(500)).atender('op-1', mas(2_000)));
    expect(a.escaladaEn?.getTime()).toBe(mas(500).getTime());
    expect(a.escaladaDentroDelPlazo()).toBe(true);
  });

  it('la alerta está congelada: no admite asignación externa', () => {
    const a = alerta();
    expect(() => {
      (a as unknown as Record<string, unknown>).estado = 'resuelta';
    }).toThrow();
  });
});
