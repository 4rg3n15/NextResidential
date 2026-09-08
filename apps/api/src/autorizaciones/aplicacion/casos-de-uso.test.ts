import { beforeEach, describe, expect, it } from 'vitest';
import type { Autorizacion, ContextoDeAcceso, GeneradorDeId, Reloj } from '@ncr/domain-core';
import { VersionDeReglas, esExito, esFallo } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { AgregarAcompanante, CrearAutorizacion, RevocarAutorizacion } from './casos-de-uso';
import { LevantarListaNegra, VetarEnListaNegra } from './listas-negras';
import { DecidirAcceso } from './evaluar-acceso';
import type {
  CargadorDeContexto,
  EntradaListaNegra,
  RepositorioAutorizaciones,
  RepositorioListaNegra,
  SolicitudDeAcceso,
} from './puertos';

const COP = '11111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-09-08T14:00:00Z');
const reloj: Reloj = { ahora: () => AHORA };

let contador = 0;
const ids: GeneradorDeId = { nuevo: () => `id-${(contador += 1)}` };

const ctx = (extra: Partial<ContextoTenant> = {}): ContextoTenant => ({
  usuarioId: 'usr-1',
  rol: 'residente',
  copropiedadId: COP,
  copropiedadesAtendidas: [],
  mfaVerificado: false,
  ...extra,
});

class RepoAutorizacionesFalso implements RepositorioAutorizaciones {
  readonly guardadas = new Map<string, Autorizacion>();
  async guardar(_cop: string, a: Autorizacion): Promise<void> {
    this.guardadas.set(a.id, a);
  }
  async porId(_cop: string, id: string): Promise<Autorizacion | null> {
    return this.guardadas.get(id) ?? null;
  }
  async vigentesDePersona(): Promise<readonly Autorizacion[]> {
    return [...this.guardadas.values()];
  }
}

const entradaBase = {
  viviendaId: '22222222-2222-4222-8222-222222222222',
  personaId: '33333333-3333-4333-8333-333333333333',
  desde: '2026-09-08T00:00:00Z',
  hasta: '2026-09-09T00:00:00Z',
};

describe('CrearAutorizacion (HU-07, HU-09)', () => {
  let repo: RepoAutorizacionesFalso;
  let caso: CrearAutorizacion;
  beforeEach(() => {
    repo = new RepoAutorizacionesFalso();
    caso = new CrearAutorizacion(repo, reloj, ids);
  });

  it('crea y persiste una autorización simple', async () => {
    const r = await caso.ejecutar(ctx(), entradaBase);
    expect(esExito(r)).toBe(true);
    expect(repo.guardadas.size).toBe(1);
  });

  it('crea una recurrente: el patrón es un dato, no otro caso de uso (RN-22)', async () => {
    const r = await caso.ejecutar(ctx(), {
      ...entradaBase,
      patron: { dias: [2], minutoInicio: 480, minutoFin: 720, desplazamientoUtcMinutos: -300 },
    });
    expect(esExito(r)).toBe(true);
    const guardada = [...repo.guardadas.values()][0];
    expect(guardada?.esRecurrente).toBe(true);
  });

  it('rechaza un patrón inválido sin tocar el repositorio', async () => {
    const r = await caso.ejecutar(ctx(), {
      ...entradaBase,
      patron: { dias: [], minutoInicio: 480, minutoFin: 720, desplazamientoUtcMinutos: -300 },
    });
    expect(esFallo(r)).toBe(true);
    expect(repo.guardadas.size).toBe(0);
  });

  it('rechaza una vigencia invertida y una que nace expirada (RN-01)', async () => {
    expect(esFallo(await caso.ejecutar(ctx(), { ...entradaBase, hasta: entradaBase.desde }))).toBe(
      true,
    );
    const vieja = await caso.ejecutar(ctx(), {
      ...entradaBase,
      desde: '2026-09-01T00:00:00Z',
      hasta: '2026-09-02T00:00:00Z',
    });
    expect(esFallo(vieja)).toBe(true);
  });

  it('rechaza un máximo de acompañantes fuera de rango (RN-05)', async () => {
    expect(esFallo(await caso.ejecutar(ctx(), { ...entradaBase, maximoAcompanantes: 99 }))).toBe(
      true,
    );
  });

  it('§2.7.6 · sin copropiedad alcanzable no se crea nada', async () => {
    expect(esFallo(await caso.ejecutar(ctx({ copropiedadId: null }), entradaBase))).toBe(true);
    const operador = ctx({ rol: 'operador_central', copropiedadesAtendidas: [] });
    expect(esFallo(await caso.ejecutar(operador, entradaBase))).toBe(true);
    expect(repo.guardadas.size).toBe(0);
  });
});

describe('AgregarAcompanante y RevocarAutorizacion (HU-08, HU-10)', () => {
  let repo: RepoAutorizacionesFalso;
  let id: string;
  beforeEach(async () => {
    repo = new RepoAutorizacionesFalso();
    const r = await new CrearAutorizacion(repo, reloj, ids).ejecutar(ctx(), entradaBase);
    id = esExito(r) ? r.valor.id : '';
  });

  it('agrega un acompañante y falla si la autorización no existe', async () => {
    const caso = new AgregarAcompanante(repo, reloj);
    const acompanante = { personaId: '44444444-4444-4444-8444-444444444444', nombre: 'Ana' };
    expect(esExito(await caso.ejecutar(ctx(), id, acompanante))).toBe(true);
    expect(repo.guardadas.get(id)?.acompanantes).toHaveLength(1);
    expect(esFallo(await caso.ejecutar(ctx(), 'no-existe', acompanante))).toBe(true);
    expect(esFallo(await caso.ejecutar(ctx({ copropiedadId: null }), id, acompanante))).toBe(true);
    // El duplicado lo rechaza el AGREGADO, no el caso de uso.
    expect(esFallo(await caso.ejecutar(ctx(), id, acompanante))).toBe(true);
  });

  it('revoca con motivo y no dos veces (RN-19)', async () => {
    const caso = new RevocarAutorizacion(repo, reloj);
    expect(esFallo(await caso.ejecutar(ctx(), id, '  '))).toBe(true);
    expect(esFallo(await caso.ejecutar(ctx(), 'no-existe', 'x'))).toBe(true);
    expect(esFallo(await caso.ejecutar(ctx({ copropiedadId: null }), id, 'x'))).toBe(true);
    expect(esExito(await caso.ejecutar(ctx(), id, 'el residente canceló'))).toBe(true);
    expect(repo.guardadas.get(id)?.estado).toBe('revocada');
    expect(esFallo(await caso.ejecutar(ctx(), id, 'otra vez'))).toBe(true);
  });
});

class RepoListaNegraFalso implements RepositorioListaNegra {
  readonly entradas = new Map<string, EntradaListaNegra>();
  async crear(e: Omit<EntradaListaNegra, 'levantadaPor' | 'levantadaEn'>): Promise<void> {
    this.entradas.set(e.id, { ...e, levantadaPor: null, levantadaEn: null });
  }
  async porId(_cop: string, id: string): Promise<EntradaListaNegra | null> {
    return this.entradas.get(id) ?? null;
  }
  async levantar(_cop: string, id: string, actorId: string, ahora: Date): Promise<boolean> {
    const e = this.entradas.get(id);
    if (e === undefined || e.levantadaEn !== null) return false;
    this.entradas.set(id, { ...e, levantadaPor: actorId, levantadaEn: ahora });
    return true;
  }
  async activasDe(): Promise<readonly EntradaListaNegra[]> {
    return [...this.entradas.values()].filter((e) => e.levantadaEn === null);
  }
}

describe('Listas negras · RN-07 separa quién veta de quién levanta (HU-35)', () => {
  let repo: RepoListaNegraFalso;
  let vetar: VetarEnListaNegra;
  let levantar: LevantarListaNegra;
  beforeEach(() => {
    repo = new RepoListaNegraFalso();
    vetar = new VetarEnListaNegra(repo, ids);
    levantar = new LevantarListaNegra(repo, reloj);
  });

  it('el portero puede vetar; el residente no', async () => {
    const porPortero = await vetar.ejecutar(ctx({ rol: 'portero' }), {
      personaId: 'p-9',
      motivo: 'intento de suplantación',
    });
    expect(esExito(porPortero)).toBe(true);
    expect(
      esFallo(await vetar.ejecutar(ctx({ rol: 'residente' }), { personaId: 'p-9', motivo: 'x' })),
    ).toBe(true);
  });

  it('el portero NO puede levantar su propio veto: levantar es administración', async () => {
    const creado = await vetar.ejecutar(ctx({ rol: 'portero' }), {
      placa: 'ABC123',
      motivo: 'vehículo reportado',
    });
    const id = esExito(creado) ? creado.valor.id : '';
    expect(esFallo(await levantar.ejecutar(ctx({ rol: 'portero' }), id))).toBe(true);
    expect(esExito(await levantar.ejecutar(ctx({ rol: 'administrador' }), id))).toBe(true);
    // Sin borrado: queda el hecho, con autor y momento.
    expect(repo.entradas.get(id)?.levantadaPor).toBe('usr-1');
    expect(repo.entradas.get(id)?.levantadaEn).toEqual(AHORA);
    expect(esFallo(await levantar.ejecutar(ctx({ rol: 'administrador' }), id))).toBe(true);
  });

  it('un veto sin sujeto o sin motivo no se acepta (RN-06, RN-07)', async () => {
    const admin = ctx({ rol: 'administrador' });
    expect(esFallo(await vetar.ejecutar(admin, { motivo: 'porque sí' }))).toBe(true);
    expect(esFallo(await vetar.ejecutar(admin, { personaId: 'p-1', motivo: '   ' }))).toBe(true);
    expect(
      esFallo(
        await vetar.ejecutar(ctx({ rol: 'administrador', copropiedadId: null }), {
          personaId: 'p-1',
          motivo: 'x',
        }),
      ),
    ).toBe(true);
  });

  it('levantar exige que la entrada exista y sea alcanzable', async () => {
    expect(esFallo(await levantar.ejecutar(ctx({ rol: 'administrador' }), 'no-existe'))).toBe(true);
    expect(
      esFallo(await levantar.ejecutar(ctx({ rol: 'administrador', copropiedadId: null }), 'x')),
    ).toBe(true);
  });
});

describe('DecidirAcceso · todo el I/O ANTES de evaluar', () => {
  const version = (() => {
    const r = VersionDeReglas.crear(3, COP);
    if (!esExito(r)) throw new Error('inesperado');
    return r.valor;
  })();

  const contextoCargado = (extra: Partial<ContextoDeAcceso> = {}): ContextoDeAcceso => ({
    ahora: AHORA,
    copropiedadId: COP,
    versionDeReglas: version,
    personaId: 'per-1',
    viviendaId: 'viv-1',
    metodo: 'placa',
    autorizaciones: [],
    personasEnListaNegra: new Set<string>(),
    placasEnListaNegra: new Set<string>(),
    placaLeida: 'ABC123',
    placaConocida: true,
    viviendaActiva: true,
    zona: null,
    confianza: 0.95,
    umbralDeConfianza: 0.8,
    consentimientoVigente: true,
    ...extra,
  });

  const solicitud: SolicitudDeAcceso = {
    copropiedadId: COP,
    dispositivoId: 'disp-1',
    metodo: 'placa',
    personaId: 'per-1',
    placaLeida: 'ABC123',
    zonaId: null,
    confianza: 0.95,
  };

  it('el cargador se invoca una vez y el motor no vuelve a pedir nada', async () => {
    let veces = 0;
    const cargador: CargadorDeContexto = {
      cargar: async () => {
        veces += 1;
        return contextoCargado();
      },
    };
    const r = await new DecidirAcceso(cargador, reloj).ejecutar(solicitud);
    expect(veces).toBe(1);
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toBe('VIGENCIA_EXPIRADA');
    expect(r.versionDeReglas).toBe(version);
  });

  it('admite un conjunto de reglas reducido: es lo que permitirá al Edge decidir con su caché', async () => {
    const cargador: CargadorDeContexto = { cargar: async () => contextoCargado() };
    const r = await new DecidirAcceso(cargador, reloj, []).ejecutar(solicitud);
    expect(r.permitido).toBe(false);
    expect(r.reglaAplicada).toBe('motor.sinReglas');
  });
});
