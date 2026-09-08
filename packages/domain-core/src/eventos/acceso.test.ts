import { describe, expect, it } from 'vitest';
import { Acceso, TIPOS_DE_EVENTO } from './acceso';
import type { HechoDeAcceso } from './acceso';
import { VersionDeReglas } from '../autorizaciones/version-de-reglas';
import { negar, permitir } from '../reglas/resultado-acceso';
import { esExito, esFallo } from '../compartido/resultado';
import type { Resultado } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';

const AHORA = new Date('2026-09-08T14:00:00Z');

const abrir = <T>(r: Resultado<T, ErrorDominio>): T => {
  if (!esExito(r)) throw new Error(`dato de prueba inválido: ${r.error.detalle}`);
  return r.valor;
};

const VERSION = abrir(VersionDeReglas.crear(7, 'cop-1'));
const OTRA_VERSION = abrir(VersionDeReglas.crear(7, 'cop-2'));

const hecho = (extra: Partial<HechoDeAcceso> = {}): HechoDeAcceso => ({
  id: 'evt-1',
  copropiedadId: 'cop-1',
  ocurridoEn: AHORA,
  tipo: 'ingreso',
  metodo: 'placa',
  dispositivoId: 'disp-1',
  claveIdempotencia: 'cop-1:disp-1:placa:ref-1',
  ...extra,
});

const error = <T>(r: Resultado<T, ErrorDominio>): ErrorDominio => {
  if (!esFallo(r)) throw new Error('se esperaba un fallo y llegó un éxito');
  return r.error;
};

describe('Acceso · sella la decisión, no la reescribe', () => {
  it('copia motivo, regla y versión desde el ResultadoAcceso', () => {
    const decision = negar('LISTA_NEGRA', VERSION, 'listaNegra.persona');
    const acceso = abrir(Acceso.desdeDecision(hecho({ tipo: 'denegado' }), decision));

    expect(acceso.permitido).toBe(false);
    expect(acceso.motivo).toBe('LISTA_NEGRA');
    expect(acceso.reglaAplicada).toBe('listaNegra.persona');
    expect(acceso.versionDeReglas).toBe(VERSION);
    expect(acceso.resultado).toBe('negado');
  });

  it('un permiso no lleva motivo, y `resultado` lo dice en el vocabulario de la base', () => {
    const acceso = abrir(Acceso.desdeDecision(hecho(), permitir(VERSION, 'motor.ninguna')));
    expect(acceso.motivo).toBeNull();
    expect(acceso.resultado).toBe('permitido');
    expect(acceso.requiereConfirmacionHumana).toBe(false);
  });

  it('arrastra la marca de confirmación humana del permiso dudoso (CU-01 3a)', () => {
    const acceso = abrir(Acceso.desdeDecision(hecho(), permitir(VERSION, 'motor.ninguna', true)));
    expect(acceso.requiereConfirmacionHumana).toBe(true);
  });
});

describe('Acceso · es inmutable (RN-03, CA-23, ADR-005)', () => {
  it('no admite asignación sobre ningún campo', () => {
    const acceso = abrir(Acceso.desdeDecision(hecho(), permitir(VERSION, 'r')));
    // `Object.freeze` en el constructor: en modo estricto la asignación lanza.
    expect(() => {
      (acceso as unknown as Record<string, unknown>).reglaAplicada = 'alterada';
    }).toThrow();
    expect(acceso.reglaAplicada).toBe('r');
  });

  it('no expone ningún método que cambie su estado', () => {
    const acceso = abrir(Acceso.desdeDecision(hecho(), permitir(VERSION, 'r')));
    const metodos = Object.getOwnPropertyNames(Object.getPrototypeOf(acceso)).filter(
      (n) => n !== 'constructor',
    );
    // Solo el getter `resultado`. Si alguien añade `actualizar` o `anular`,
    // esta prueba se pone roja antes de que llegue a la base de datos.
    expect(metodos).toEqual(['resultado']);
  });

  it('copia la fecha: mover el Date original no mueve el evento', () => {
    const instante = new Date(AHORA.getTime());
    const acceso = abrir(
      Acceso.desdeDecision(hecho({ ocurridoEn: instante }), permitir(VERSION, 'r')),
    );
    instante.setFullYear(1999);
    expect(acceso.ocurridoEn.getTime()).toBe(AHORA.getTime());
  });
});

describe('Acceso · invariantes', () => {
  it('rechaza sellar la versión de reglas de otra copropiedad (RN-15)', () => {
    const r = Acceso.desdeDecision(hecho(), permitir(OTRA_VERSION, 'r'));
    expect(error(r).regla).toBe('RN-15');
  });

  it('exige copropiedad', () => {
    const r = Acceso.desdeDecision(hecho({ copropiedadId: '' }), permitir(VERSION, 'r'));
    expect(error(r).codigo).toBe('DATO_INVALIDO');
  });

  it('rechaza un instante inválido', () => {
    const r = Acceso.desdeDecision(
      hecho({ ocurridoEn: new Date('no es fecha') }),
      permitir(VERSION, 'r'),
    );
    expect(error(r).detalle).toContain('no es una fecha válida');
  });

  it.each([
    ['corta', 'abc'],
    ['larga', 'x'.repeat(201)],
  ])('rechaza una clave de idempotencia %s (RN-17)', (_caso, clave) => {
    const r = Acceso.desdeDecision(hecho({ claveIdempotencia: clave }), permitir(VERSION, 'r'));
    expect(error(r).regla).toBe('RN-17');
  });

  it('CA-16 · una apertura manual sin motivo no se puede construir', () => {
    const r = Acceso.desdeDecision(
      hecho({ tipo: 'manual', operadorId: 'op-1' }),
      permitir(VERSION, 'manual'),
    );
    expect(error(r).regla).toBe('CA-16');
  });

  it('CA-16 · un motivo de solo espacios tampoco vale', () => {
    const r = Acceso.desdeDecision(
      hecho({ tipo: 'manual', operadorId: 'op-1', motivoManual: '    ' }),
      permitir(VERSION, 'manual'),
    );
    expect(error(r).regla).toBe('CA-16');
  });

  it('CA-16 · sin operador tampoco, aunque haya motivo', () => {
    const r = Acceso.desdeDecision(
      hecho({ tipo: 'manual', motivoManual: 'visitante conocido' }),
      permitir(VERSION, 'manual'),
    );
    expect(error(r).regla).toBe('CA-16');
  });

  it('CA-16 · con operador y motivo, se construye', () => {
    const acceso = abrir(
      Acceso.desdeDecision(
        hecho({ tipo: 'manual', operadorId: 'op-1', motivoManual: 'proveedor esperado' }),
        permitir(VERSION, 'manual'),
      ),
    );
    expect(acceso.operadorId).toBe('op-1');
  });

  it('exige la placa ya normalizada por el objeto de valor', () => {
    const r = Acceso.desdeDecision(hecho({ placaDetectada: 'abc-123' }), permitir(VERSION, 'r'));
    expect(error(r).regla).toBe('RN-04');
  });

  it('acepta una placa normalizada', () => {
    const acceso = abrir(
      Acceso.desdeDecision(hecho({ placaDetectada: 'ABC123' }), permitir(VERSION, 'r')),
    );
    expect(acceso.placaDetectada).toBe('ABC123');
  });

  it.each([-0.1, 1.1])('rechaza una confianza fuera de 0..1 (%s)', (confianza) => {
    const r = Acceso.desdeDecision(hecho({ confianza }), permitir(VERSION, 'r'));
    expect(error(r).codigo).toBe('DATO_INVALIDO');
  });

  it('acepta la confianza en el borde', () => {
    expect(
      abrir(Acceso.desdeDecision(hecho({ confianza: 1 }), permitir(VERSION, 'r'))).confianza,
    ).toBe(1);
  });

  it('RN-02 · un evento `denegado` no puede sellar una decisión permitida', () => {
    const r = Acceso.desdeDecision(hecho({ tipo: 'denegado' }), permitir(VERSION, 'r'));
    expect(error(r).regla).toBe('RN-02');
  });

  it.each(['ingreso', 'salida'] as const)(
    'RN-02 · un `%s` no puede sellar una decisión negada',
    (tipo) => {
      const r = Acceso.desdeDecision(hecho({ tipo }), negar('LISTA_NEGRA', VERSION, 'r'));
      expect(error(r).regla).toBe('RN-02');
    },
  );

  it('un evento de tipo `alerta` admite cualquiera de las dos decisiones', () => {
    expect(
      esExito(
        Acceso.desdeDecision(hecho({ tipo: 'alerta' }), negar('FALLO_TECNICO', VERSION, 'r')),
      ),
    ).toBe(true);
    expect(esExito(Acceso.desdeDecision(hecho({ tipo: 'alerta' }), permitir(VERSION, 'r')))).toBe(
      true,
    );
  });

  it('los valores por defecto del Edge son los conservadores', () => {
    const acceso = abrir(Acceso.desdeDecision(hecho(), permitir(VERSION, 'r')));
    expect(acceso.decididoPorEdge).toBe(false);
    expect(acceso.cachePotencialmenteObsoleto).toBe(false);
  });

  it('conserva las marcas del Edge cuando llegan (KPI-31)', () => {
    const acceso = abrir(
      Acceso.desdeDecision(
        hecho({ decididoPorEdge: true, cachePotencialmenteObsoleto: true }),
        permitir(VERSION, 'r'),
      ),
    );
    expect(acceso.decididoPorEdge).toBe(true);
    expect(acceso.cachePotencialmenteObsoleto).toBe(true);
  });

  it('los campos opcionales ausentes quedan en null, nunca en undefined', () => {
    const acceso = abrir(Acceso.desdeDecision(hecho(), permitir(VERSION, 'r')));
    for (const campo of [
      acceso.personaId,
      acceso.viviendaId,
      acceso.autorizacionId,
      acceso.zonaId,
      acceso.placaDetectada,
      acceso.confianza,
      acceso.evidenciaId,
      acceso.operadorId,
      acceso.motivoManual,
    ]) {
      expect(campo).toBeNull();
    }
  });
});

describe('Acceso · el vocabulario coincide con el esquema', () => {
  it('los tipos de evento son los del enumerado `tipo_evento` (migración 0011)', () => {
    // Copiado del enumerado de la migración 0002. Si alguien añade un tipo en
    // uno de los dos sitios, esta prueba lo delata antes del despliegue.
    expect([...TIPOS_DE_EVENTO]).toEqual(['ingreso', 'salida', 'denegado', 'alerta', 'manual']);
  });
});
