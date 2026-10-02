import { describe, expect, it } from 'vitest';
import type { NodoDeSalidas } from '@ncr/providers';
import type { ContextoTenant } from '../../autenticacion';
import { RepositorioDePuntosEnMemoria } from '../infraestructura/puntos-de-acceso-en-memoria';
import { SalidasDelEquipo } from './salidas-del-equipo';
import type { LectorDeSalidas, LecturaDeSalidas } from './salidas-del-equipo';
import { PuntosDeOperacion } from './puntos-de-operacion';
import { nombreDePunto } from './puntos-de-acceso';
import type { DatosDeEquipo } from './puertos';

/**
 * 15-P · P3/P5 · descubrir, ver y nombrar las salidas; y resolverlas para
 * abrir. Sin base ni equipo: el árbol lo da un lector de mentira y los puntos
 * el doble en memoria, que cumple el mismo contrato que el de PostgreSQL.
 */
const COP = 'cop-a';
const PORTERO = 'vp-1';

const ctx = (rol: ContextoTenant['rol'], copropiedadId: string | null = COP): ContextoTenant =>
  ({
    rol,
    usuarioId: 'u-1',
    copropiedadId,
    copropiedadesAtendidas: copropiedadId === null ? [] : [copropiedadId],
    mfaVerificado: true,
  }) as unknown as ContextoTenant;

const salida = (n: number, nombre = `Cerradura ${String(n)}`): NodoDeSalidas => ({
  clave: `puerta-${String(n)}`,
  tipo: 'salida',
  nombre,
  numeroDePuerta: n,
  estado: null,
  nota: null,
  hijos: [],
});
const arbolCon = (...hijos: NodoDeSalidas[]): NodoDeSalidas => ({
  clave: 'equipo',
  tipo: 'equipo',
  nombre: 'KD',
  numeroDePuerta: null,
  estado: null,
  nota: null,
  hijos: [
    {
      ...salida(0),
      clave: 'propio',
      tipo: 'modulo',
      nombre: 'Salidas del equipo',
      numeroDePuerta: null,
      hijos,
    },
  ],
});

/** Lo que el adaptador devolvería al leer un equipo con esas puertas. */
const leida = (...puertas: number[]): LecturaDeSalidas => ({
  estado: 'leida',
  arbol: arbolCon(...puertas.map((n) => salida(n))),
  salidas: puertas.map((n) => ({
    ruta: `equipo/propio/puerta-${String(n)}`,
    nombre: `Cerradura ${String(n)}`,
    numeroDePuerta: n,
    modulo: 'Salidas del equipo',
  })),
});

const montar = (equipos: Partial<DatosDeEquipo>[] = [{ id: PORTERO, tipo: 'intercom' }]) => {
  let lectura: LecturaDeSalidas = leida(1, 2);
  const lector: LectorDeSalidas = { leer: async () => lectura };
  const puntos = new RepositorioDePuntosEnMemoria();
  const caso = new SalidasDelEquipo(
    { listar: async () => equipos as DatosDeEquipo[] },
    puntos,
    lector,
    { ahora: () => new Date('2026-10-01T12:00:00Z') },
  );
  return {
    caso,
    operacion: new PuntosDeOperacion(puntos),
    declarar: (l: LecturaDeSalidas) => (lectura = l),
  };
};

describe('SalidasDelEquipo · quién y sobre qué', () => {
  it('sólo la administración: el portero y el operador reciben 403 de dominio', async () => {
    const m = montar();
    for (const rol of ['portero', 'operador_central', 'residente'] as const) {
      const r = await m.caso.consultar(ctx(rol), COP, PORTERO);
      expect(r.ok ? null : r.error.codigo).toBe('OPERACION_NO_PERMITIDA');
    }
  });

  it('segundo camino del aislamiento: un administrador de otra copropiedad no entra', async () => {
    const r = await montar().caso.descubrir(ctx('administrador', 'cop-b'), COP, PORTERO);
    expect(r.ok ? null : r.error.codigo).toBe('OPERACION_NO_PERMITIDA');
  });

  it('un equipo que no está, 404; uno que no es videoportero, la puerta de su ficha (R1)', async () => {
    const m = montar([{ id: 'camara', tipo: 'camara_lpr' }]);
    const r1 = await m.caso.consultar(ctx('administrador'), COP, PORTERO);
    expect(r1.ok ? null : r1.error.codigo).toBe('ENTIDAD_NO_ENCONTRADA');
    const r2 = await m.caso.descubrir(ctx('administrador'), COP, 'camara');
    expect(r2.ok ? null : r2.error.detalle).toMatch(/Sólo el videoportero/);
  });
});

describe('SalidasDelEquipo · descubrir y nombrar', () => {
  it('descubre, conserva el nombre editado y da de baja lo que el equipo ya no declara', async () => {
    const m = montar();
    const admin = ctx('administrador');
    const primera = await m.caso.descubrir(admin, COP, PORTERO);
    expect(primera.ok && primera.valor.puntos.map((p) => p.nombre)).toEqual([
      'Cerradura 1',
      'Cerradura 2',
    ]);
    const uno = primera.ok ? primera.valor.puntos[0] : undefined;
    const renombrado = await m.caso.renombrar(
      admin,
      COP,
      PORTERO,
      uno?.id ?? '',
      '  Portón   peatonal ',
    );
    expect(renombrado.ok && renombrado.valor.nombre).toBe('Portón peatonal');

    m.declarar(leida(1));
    const segunda = await m.caso.descubrir(admin, COP, PORTERO);
    expect(segunda.ok && segunda.valor.puntos.map((p) => [p.nombre, p.numeroDePuerta])).toEqual([
      ['Portón peatonal', 1],
    ]);
  });

  it('el equipo no contesta: nada cambia y el motivo llega en palabras, sin jerga', async () => {
    const m = montar();
    const admin = ctx('administrador');
    await m.caso.descubrir(admin, COP, PORTERO);
    m.declarar({ estado: 'sin_lectura', motivo: 'El equipo no respondió' });
    const r = await m.caso.descubrir(admin, COP, PORTERO);
    expect(r.ok && r.valor.arbol).toBeNull();
    expect(r.ok && r.valor.motivoSinArbol).toBe('El equipo no respondió');
    expect(r.ok && r.valor.puntos).toHaveLength(2);
  });

  it('un proveedor que no lee salidas lo dice, y no inventa ninguna', async () => {
    const m = montar();
    m.declarar({ estado: 'sin_lectura', motivo: 'El proveedor de equipos no lee salidas' });
    const r = await m.caso.consultar(ctx('superadministrador'), COP, PORTERO);
    expect(r.ok && r.valor.motivoSinArbol).toMatch(/no lee salidas/);
    expect(r.ok && r.valor.puntos).toEqual([]);
  });

  it('R3 · un árbol de más de 3 niveles no se persiste a medias: es un dato inválido', async () => {
    const m = montar();
    m.declarar({ estado: 'invalida', motivo: 'El árbol de salidas pasa de 3 niveles' });
    const r = await m.caso.descubrir(ctx('administrador'), COP, PORTERO);
    expect(r.ok ? null : r.error.codigo).toBe('DATO_INVALIDO');
    expect(await m.operacion.listar(ctx('portero'), COP, PORTERO)).toEqual({ ok: true, valor: [] });
  });

  it('renombrar: un nombre vacío o invisible no vale; un punto ajeno, 404', async () => {
    const m = montar();
    const admin = ctx('administrador');
    const r = await m.caso.descubrir(admin, COP, PORTERO);
    const id = r.ok ? (r.valor.puntos[0]?.id ?? '') : '';
    const vacio = await m.caso.renombrar(admin, COP, PORTERO, id, '   ');
    expect(vacio.ok ? null : vacio.error.codigo).toBe('DATO_INVALIDO');
    const ajeno = await m.caso.renombrar(admin, COP, 'otro-equipo', id, 'Puerta');
    expect(ajeno.ok ? null : ajeno.error.codigo).toBe('ENTIDAD_NO_ENCONTRADA');
  });
});

describe('PuntosDeOperacion · lo que la guardia puede abrir', () => {
  it('quien acciona puertas ve los puntos; el residente no; un punto ajeno no se resuelve', async () => {
    const m = montar();
    const r = await m.caso.descubrir(ctx('administrador'), COP, PORTERO);
    const id = r.ok ? (r.valor.puntos[1]?.id ?? '') : '';
    const visto = await m.operacion.listar(ctx('operador_central'), COP, PORTERO);
    expect(visto.ok && visto.valor).toHaveLength(2);
    const residente = await m.operacion.listar(ctx('residente'), COP, PORTERO);
    expect(residente.ok).toBe(false);
    expect((await m.operacion.resolver(ctx('portero'), COP, PORTERO, id))?.numeroDePuerta).toBe(2);
    expect(await m.operacion.resolver(ctx('portero'), COP, 'otro-equipo', id)).toBeNull();
    expect(await m.operacion.resolver(ctx('portero', 'cop-b'), COP, PORTERO, id)).toBeNull();
  });
});

describe('nombreDePunto', () => {
  it('NFC, sin controles ni marcas de dirección, espacios colapsados, 1–80', () => {
    const rlo = String.fromCodePoint(0x202e);
    expect(nombreDePunto(`Port${rlo}ón${String.fromCharCode(7)}  2`)).toBe('Portón 2');
    expect(nombreDePunto('a'.repeat(81))).toBeNull();
    expect(nombreDePunto(42)).toBeNull();
  });
});
