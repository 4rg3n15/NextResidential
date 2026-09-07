import { describe, expect, it } from 'vitest';
import { evaluarAcceso, REGLAS_PREDETERMINADAS } from './motor';
import type { ContextoDeAcceso, ZonaSolicitada } from './contexto';
import type { Politica } from './politicas';
import {
  dependeDeUnaLectura,
  lecturaDudosa,
  noPronunciarse,
  permitirSi,
  politicaConfianza,
  politicaConsentimiento,
  politicaListaNegra,
  politicaPlacaConocida,
  politicaRecurrencia,
  politicaVigencia,
  politicaVivienda,
  politicaZona,
  primeraQueNiega,
} from './politicas';
import { negar, permitir } from './resultado-acceso';
import { Autorizacion } from '../autorizaciones/autorizacion';
import { Vigencia } from '../autorizaciones/vigencia';
import { PatronRecurrencia } from '../autorizaciones/patron-recurrencia';
import { VersionDeReglas } from '../autorizaciones/version-de-reglas';
import type { Resultado } from '../compartido/resultado';
import { esExito } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';

/** Martes 09:00 en Bogotá. El reloj se inyecta: aquí no se llama a `new Date()`. */
const AHORA = new Date('2026-09-08T14:00:00Z');

const abrir = <T>(r: Resultado<T, ErrorDominio>): T => {
  if (!esExito(r)) throw new Error(`dato de prueba inválido: ${r.error.detalle}`);
  return r.valor;
};

const VERSION = abrir(VersionDeReglas.crear(7, 'cop-1'));

const vigencia = (desde: string, hasta: string): Vigencia =>
  abrir(Vigencia.crear(new Date(desde), new Date(hasta)));

const autorizacion = (
  extra: Partial<Parameters<typeof Autorizacion.crear>[0]> = {},
): Autorizacion =>
  abrir(
    Autorizacion.crear({
      id: 'aut-1',
      copropiedadId: 'cop-1',
      viviendaId: 'viv-1',
      personaId: 'per-1',
      vigencia: vigencia('2026-09-08T00:00:00Z', '2026-09-09T00:00:00Z'),
      ...extra,
    }),
  );

const patronMartes = (): PatronRecurrencia =>
  abrir(
    PatronRecurrencia.crear({
      dias: [2],
      minutoInicio: 8 * 60,
      minutoFin: 12 * 60,
      desplazamientoUtcMinutos: -300,
    }),
  );

const zona = (p: Partial<ZonaSolicitada> = {}): ZonaSolicitada => ({
  id: 'zona-piscina',
  dentroDeHorario: true,
  aforoCompleto: false,
  restringida: false,
  ...p,
});

/** Contexto que PERMITE. Cada prueba rompe exactamente una cosa. */
const contexto = (p: Partial<ContextoDeAcceso> = {}): ContextoDeAcceso => ({
  ahora: AHORA,
  copropiedadId: 'cop-1',
  versionDeReglas: VERSION,
  personaId: 'per-1',
  viviendaId: 'viv-1',
  metodo: 'placa',
  autorizaciones: [autorizacion()],
  personasEnListaNegra: new Set<string>(),
  placasEnListaNegra: new Set<string>(),
  placaLeida: 'ABC123',
  placaConocida: true,
  viviendaActiva: true,
  zona: null,
  confianza: 0.95,
  umbralDeConfianza: 0.8,
  consentimientoVigente: true,
  ...p,
});

const motivoDe = (c: ContextoDeAcceso): string => {
  const r = evaluarAcceso(c);
  return r.permitido ? 'PERMITIDO' : r.motivo;
};

describe('motor de reglas · caso base', () => {
  it('permite cuando ninguna política niega, y sella la versión de reglas (RN-16)', () => {
    const r = evaluarAcceso(contexto());
    expect(r.permitido).toBe(true);
    expect(r.versionDeReglas).toBe(VERSION);
    expect(r.reglaAplicada).toBe('motor.ningunaRegulaNiega');
    if (r.permitido) expect(r.requiereConfirmacionHumana).toBeUndefined();
  });

  it('la versión viaja también en la denegación: toda decisión es auditable', () => {
    const r = evaluarAcceso(contexto({ autorizaciones: [] }));
    expect(r.versionDeReglas).toBe(VERSION);
  });

  it('es pura: la misma entrada produce siempre la misma salida', () => {
    const c = contexto();
    expect(evaluarAcceso(c)).toEqual(evaluarAcceso(c));
  });

  it('RN-15 · una versión de reglas de otra copropiedad no se «intenta igual»', () => {
    const ajena = abrir(VersionDeReglas.crear(1, 'cop-2'));
    const r = evaluarAcceso(contexto({ versionDeReglas: ajena }));
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toBe('FALLO_TECNICO');
    expect(r.reglaAplicada).toBe('motor.copropiedadIncoherente');
  });

  it('§2.1.4 · sin reglas se deniega por defecto; no se abre la puerta', () => {
    const r = evaluarAcceso(contexto(), []);
    expect(r.permitido).toBe(false);
    expect(r.reglaAplicada).toBe('motor.sinReglas');
  });

  it('un permiso temprano no corta el recorrido: la siguiente política sigue mandando', () => {
    const siemprePermite: Politica = (c) => permitir(c.versionDeReglas, 'prueba.permite');
    const r = evaluarAcceso(contexto(), [siemprePermite, politicaVigencia]);
    expect(r.permitido).toBe(true);
    const r2 = evaluarAcceso(contexto({ autorizaciones: [] }), [siemprePermite, politicaVigencia]);
    expect(r2.permitido).toBe(false);
  });
});

describe('motor de reglas · un motivo por cada denegación (§2.4)', () => {
  it('LISTA_NEGRA por identidad', () => {
    expect(motivoDe(contexto({ personasEnListaNegra: new Set(['per-1']) }))).toBe('LISTA_NEGRA');
  });

  it('LISTA_NEGRA por placa', () => {
    expect(motivoDe(contexto({ placasEnListaNegra: new Set(['ABC123']) }))).toBe('LISTA_NEGRA');
  });

  it('LISTA_NEGRA alcanza al acompañante por identidad propia (D-01, RN-06)', () => {
    const a = autorizacion();
    a.agregarAcompanante({ personaId: 'per-9', nombre: 'Vetado' }, AHORA);
    expect(
      motivoDe(
        contexto({
          autorizaciones: [a],
          personasEnListaNegra: new Set(['per-9']),
        }),
      ),
    ).toBe('LISTA_NEGRA');
  });

  it('CA-13 · lista negra CON autorización vigente produce LISTA_NEGRA, no VIGENCIA_EXPIRADA', () => {
    const c = contexto({ personasEnListaNegra: new Set(['per-1']) });
    // La autorización está vigente: sin la precedencia absoluta, el motivo sería otro.
    expect(c.autorizaciones[0]?.estaVigenteEn(AHORA)).toBe(true);
    const r = evaluarAcceso(c);
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toBe('LISTA_NEGRA');
    expect(r.reglaAplicada).toBe('politica.listaNegra');
  });

  it('CA-13 bis · la lista negra gana incluso sobre una vigencia YA expirada', () => {
    expect(
      motivoDe(
        contexto({
          autorizaciones: [],
          personasEnListaNegra: new Set(['per-1']),
        }),
      ),
    ).toBe('LISTA_NEGRA');
  });

  it('VIGENCIA_EXPIRADA cuando ninguna autorización está viva (RN-01)', () => {
    expect(motivoDe(contexto({ autorizaciones: [] }))).toBe('VIGENCIA_EXPIRADA');
    const revocada = autorizacion();
    revocada.revocar('cancelada por el residente', AHORA);
    expect(motivoDe(contexto({ autorizaciones: [revocada] }))).toBe('VIGENCIA_EXPIRADA');
    expect(motivoDe(contexto({ ahora: new Date('2026-09-10T00:00:00Z') }))).toBe(
      'VIGENCIA_EXPIRADA',
    );
  });

  it('FUERA_DE_PATRON cuando hay vigencia pero el patrón no aplica ahora (RN-22, CA-06)', () => {
    const rec = autorizacion({ patron: patronMartes() });
    expect(motivoDe(contexto({ autorizaciones: [rec] }))).toBe('PERMITIDO');
    expect(
      motivoDe(
        contexto({
          autorizaciones: [rec],
          ahora: new Date('2026-09-08T20:00:00Z'),
        }),
      ),
    ).toBe('FUERA_DE_PATRON');
  });

  it('ZONA_NO_AUTORIZADA cuando la zona restringida no está en la autorización (RN-14)', () => {
    expect(motivoDe(contexto({ zona: zona({ restringida: true }) }))).toBe('ZONA_NO_AUTORIZADA');
    expect(
      motivoDe(
        contexto({
          zona: zona({ restringida: true }),
          autorizaciones: [autorizacion({ zonasPermitidas: ['zona-piscina'] })],
        }),
      ),
    ).toBe('PERMITIDO');
  });

  it('FUERA_DE_HORARIO es la zona cerrada, no la falta de permiso (D-18, CA-15)', () => {
    expect(motivoDe(contexto({ zona: zona({ dentroDeHorario: false }) }))).toBe('FUERA_DE_HORARIO');
  });

  it('AFORO_SUPERADO es un criterio distinto del horario (CA-14)', () => {
    expect(motivoDe(contexto({ zona: zona({ aforoCompleto: true }) }))).toBe('AFORO_SUPERADO');
  });

  it('SIN_CONSENTIMIENTO bloquea el reconocimiento facial (RN-09, RN-10, CA-09)', () => {
    expect(
      motivoDe(
        contexto({
          metodo: 'facial',
          consentimientoVigente: false,
          placaLeida: null,
        }),
      ),
    ).toBe('SIN_CONSENTIMIENTO');
  });

  it('PLACA_DESCONOCIDA cuando la placa leída no está registrada', () => {
    expect(motivoDe(contexto({ placaConocida: false }))).toBe('PLACA_DESCONOCIDA');
  });

  it('CONFIANZA_INSUFICIENTE solo cuando la lectura es inservible (CU-01, 3a)', () => {
    expect(motivoDe(contexto({ confianza: 0.2 }))).toBe('CONFIANZA_INSUFICIENTE');
  });

  it('FALLO_TECNICO cuando no hay vivienda destino identificable', () => {
    expect(motivoDe(contexto({ viviendaId: null }))).toBe('FALLO_TECNICO');
  });

  it('los diez motivos del contrato tienen prueba propia', () => {
    const cubiertos = new Set([
      motivoDe(contexto({ personasEnListaNegra: new Set(['per-1']) })),
      motivoDe(contexto({ autorizaciones: [] })),
      motivoDe(
        contexto({
          autorizaciones: [autorizacion({ patron: patronMartes() })],
          ahora: new Date('2026-09-08T20:00:00Z'),
        }),
      ),
      motivoDe(contexto({ zona: zona({ restringida: true }) })),
      motivoDe(contexto({ zona: zona({ dentroDeHorario: false }) })),
      motivoDe(contexto({ zona: zona({ aforoCompleto: true }) })),
      motivoDe(contexto({ metodo: 'facial', consentimientoVigente: false, placaLeida: null })),
      motivoDe(contexto({ placaConocida: false })),
      motivoDe(contexto({ confianza: 0.2 })),
      motivoDe(contexto({ viviendaId: null })),
    ]);
    expect(cubiertos.size).toBe(10);
  });
});

describe('motor de reglas · lectura dudosa (CU-01, excepción 3a)', () => {
  it('entre la mitad del umbral y el umbral se permite pero se marca para un humano', () => {
    const r = evaluarAcceso(contexto({ confianza: 0.6 }));
    expect(r.permitido).toBe(true);
    if (r.permitido) expect(r.requiereConfirmacionHumana).toBe(true);
  });

  it('no se marca cuando la lectura es buena ni cuando el método no depende de una lectura', () => {
    expect(lecturaDudosa(contexto())).toBe(false);
    expect(lecturaDudosa(contexto({ metodo: 'manual', confianza: 0 }))).toBe(false);
    expect(dependeDeUnaLectura(contexto({ metodo: 'facial' }))).toBe(true);
    expect(dependeDeUnaLectura(contexto({ metodo: 'tarjeta' }))).toBe(false);
    expect(dependeDeUnaLectura(contexto({ metodo: 'remoto' }))).toBe(false);
  });
});

describe('políticas · ramas que el caso base no recorre', () => {
  it('la lista negra no se pronuncia sin identidad ni placa', () => {
    expect(politicaListaNegra(contexto({ personaId: null, placaLeida: null }))).toBeNull();
  });

  it('la confianza no opina en métodos que no dependen de una lectura', () => {
    expect(politicaConfianza(contexto({ metodo: 'manual', confianza: 0 }))).toBeNull();
    expect(politicaConfianza(contexto({ confianza: 0.6 }))).toBeNull();
    expect(politicaConfianza(contexto({ confianza: 0.8 }))).toBeNull();
  });

  it('el consentimiento solo aplica al método facial', () => {
    expect(politicaConsentimiento(contexto({ consentimientoVigente: false }))).toBeNull();
    expect(politicaConsentimiento(contexto({ metodo: 'facial' }))).toBeNull();
  });

  it('la placa conocida no opina si no hubo lectura de placa', () => {
    expect(politicaPlacaConocida(contexto({ placaConocida: false, metodo: 'facial' }))).toBeNull();
    expect(politicaPlacaConocida(contexto({ placaLeida: null, placaConocida: false }))).toBeNull();
    expect(politicaPlacaConocida(contexto())).toBeNull();
  });

  it('la recurrencia calla si no hay ninguna vigente: ese motivo es de la vigencia', () => {
    expect(politicaRecurrencia(contexto({ autorizaciones: [] }))).toBeNull();
  });

  it('RN-13 · la apertura manual no exige vivienda destino', () => {
    expect(politicaVivienda(contexto({ viviendaId: null, metodo: 'manual' }))).toBeNull();
    expect(politicaVivienda(contexto())).toBeNull();
  });

  it('sin zona solicitada la política de zona no se pronuncia', () => {
    expect(politicaZona(contexto())).toBeNull();
    expect(politicaZona(contexto({ zona: zona() }))).toBeNull();
  });

  it('la vigencia se pronuncia a favor callando, nunca abriendo por su cuenta', () => {
    expect(politicaVigencia(contexto())).toBeNull();
  });
});

describe('combinadores de políticas', () => {
  it('`noPronunciarse` es el neutro', () => {
    expect(noPronunciarse(contexto())).toBeNull();
  });

  it('`primeraQueNiega` ignora nulos y permisos, y devuelve la primera negación', () => {
    const permite: Politica = (c) => permitir(c.versionDeReglas, 'p');
    const niegaA: Politica = (c) => negar('AFORO_SUPERADO', c.versionDeReglas, 'a');
    const niegaB: Politica = (c) => negar('LISTA_NEGRA', c.versionDeReglas, 'b');
    expect(primeraQueNiega(noPronunciarse, permite)(contexto())).toBeNull();
    const r = primeraQueNiega(noPronunciarse, permite, niegaA, niegaB)(contexto());
    expect(r?.permitido).toBe(false);
    expect(r?.reglaAplicada).toBe('a');
  });

  it('`permitirSi` permite o calla, según el predicado', () => {
    expect(permitirSi(() => true, 'regla.si')(contexto())?.permitido).toBe(true);
    expect(permitirSi(() => false, 'regla.no')(contexto())).toBeNull();
  });

  it('el conjunto predeterminado empieza por la lista negra (precedencia vinculante)', () => {
    expect(REGLAS_PREDETERMINADAS[0]).toBe(politicaListaNegra);
    expect(REGLAS_PREDETERMINADAS.indexOf(politicaVigencia)).toBeLessThan(
      REGLAS_PREDETERMINADAS.indexOf(politicaRecurrencia),
    );
    expect(REGLAS_PREDETERMINADAS.indexOf(politicaRecurrencia)).toBeLessThan(
      REGLAS_PREDETERMINADAS.indexOf(politicaZona),
    );
  });
});
