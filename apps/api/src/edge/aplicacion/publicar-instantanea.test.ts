import { describe, expect, it } from 'vitest';
import { Autorizacion, PatronRecurrencia, Placa, Vigencia } from '@ncr/domain-core';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import {
  FuenteDeReglasVacia,
  GatewaysEnMemoria,
  VersionesEnMemoria,
} from '../infraestructura/edge-en-memoria';
import { referenciaDeGeneracion } from '../infraestructura/referencia-de-credencial';
import { contenidoDe, hashDe } from './instantanea';
import { PublicarInstantanea } from './publicar-instantanea';
import type { FuenteDeReglas, GatewayRegistrado, LecturasDeReglas } from './puertos';

/**
 * 15-Q · Q1 · la instantánea versionada e incremental.
 *
 * La versión sólo avanza cuando el CONTENIDO cambia; `?desde=` contesta «sin
 * cambios» con la fe de vida de ahora; una versión del Edge que la nube no
 * publicó se dice; y lo que viaja no lleva ni un vector ni un nombre.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const VIVIENDA = '30000000-0000-4000-8000-000000000001';
const PERSONA = '40000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-10-02T12:00:00Z');

const ok = <T>(r: { ok: true; valor: T } | { ok: false }): T => {
  if (!r.ok) throw new Error('fabricación inválida en la prueba');
  return r.valor;
};

const visita = (): Autorizacion =>
  Autorizacion.rehidratar({
    id: '70000000-0000-4000-8000-000000000001',
    copropiedadId: COP,
    viviendaId: VIVIENDA,
    personaId: PERSONA,
    vigencia: ok(
      Vigencia.crear(new Date('2026-10-01T00:00:00Z'), new Date('2026-10-05T00:00:00Z')),
    ),
    estado: 'vigente',
    acompanantes: [{ personaId: '40000000-0000-4000-8000-000000000002', nombre: 'Nombre Real' }],
    zonasPermitidas: ['z2', 'z1'],
    patron: ok(
      PatronRecurrencia.crear({
        dias: [1, 3],
        minutoInicio: 480,
        minutoFin: 1080,
        desplazamientoUtcMinutos: -300,
      }),
    ),
    maximoAcompanantes: 5,
    revocadaEn: null,
    motivoRevocacion: null,
    placa: ok(Placa.crear('XYZ987')),
    observaciones: null,
  });

const lecturas = (cambios: Partial<LecturasDeReglas> = {}): LecturasDeReglas => ({
  autorizaciones: [visita()],
  vehiculos: [
    {
      placa: 'ABC123',
      vehiculoId: '50000000-0000-4000-8000-000000000001',
      viviendaId: VIVIENDA,
      viviendaActiva: true,
      viviendaDesactivadaEn: null,
      personaId: null,
      registradoEn: new Date('2026-09-01T00:00:00Z'),
    },
  ],
  viviendasActivas: [VIVIENDA],
  vetos: [{ personaId: null, placa: 'MAL666' }],
  zonas: [],
  plantillas: [
    { plantillaId: 'p-2', personaId: PERSONA, reconocibleHasta: new Date('2026-10-03T00:00:00Z') },
    { plantillaId: 'p-1', personaId: 'otra', reconocibleHasta: null },
  ],
  umbralDeConfianza: 0.8,
  ...cambios,
});

const gateway: GatewayRegistrado = {
  id: 'aa000000-0000-4000-8000-000000000001',
  copropiedadId: COP,
  nombre: 'Portería',
  usuarioServicioId: '00000000-0000-4000-8000-000000000003',
  credencialRef: referenciaDeGeneracion(1),
  activo: true,
};

const montar = (fuente: FuenteDeReglas = { leer: async () => lecturas() }) => {
  const lineas: string[] = [];
  const bitacora: Bitacora = { registrar: (_n, m) => void lineas.push(m) };
  let ahora = AHORA;
  const reloj: Reloj = { ahora: () => ahora };
  const versiones = new VersionesEnMemoria();
  const gateways = new GatewaysEnMemoria();
  const caso = new PublicarInstantanea(fuente, versiones, gateways, reloj, bitacora);
  return {
    caso,
    versiones,
    gateways,
    lineas,
    avanzar: (ms: number) => (ahora = new Date(+ahora + ms)),
  };
};

describe('contenido de la instantánea (15-Q, Q1)', () => {
  it('lleva el derecho del residente (S-33) con la persona sintética del vehículo sin dueño', () => {
    const c = contenidoDe(COP, lecturas(), AHORA);
    expect(c.vehiculos).toEqual([
      {
        placa: 'ABC123',
        vehiculoId: '50000000-0000-4000-8000-000000000001',
        personaId: 'vehiculo:50000000-0000-4000-8000-000000000001',
        viviendaId: VIVIENDA,
      },
    ]);
    expect(c.autorizaciones.map((a) => a.id)).toEqual([
      '70000000-0000-4000-8000-000000000001',
      'residente:50000000-0000-4000-8000-000000000001',
    ]);
  });

  it('la autorización de visitante viaja con su PLACA, su patrón y sus zonas ordenadas', () => {
    const a = contenidoDe(COP, lecturas(), AHORA).autorizaciones[0];
    expect(a).toMatchObject({
      placa: 'XYZ987',
      zonasPermitidas: ['z1', 'z2'],
      patron: { dias: [1, 3], minutoInicio: 480, minutoFin: 1080, desplazamientoUtcMinutos: -300 },
    });
  });

  it('minimización (Ley 1581): ni nombres de acompañante ni vectores; la plantilla, sólo su id', () => {
    const c = contenidoDe(COP, lecturas(), AHORA);
    const texto = JSON.stringify(c);
    expect(texto).not.toContain('Nombre Real');
    expect(texto).not.toMatch(/vector/i);
    expect(c.plantillas).toEqual([
      { plantillaId: 'p-1', personaId: 'otra', reconocibleHasta: null },
      { plantillaId: 'p-2', personaId: PERSONA, reconocibleHasta: '2026-10-03T00:00:00.000Z' },
    ]);
    expect(c.personasConConsentimiento).toEqual([PERSONA]);
  });

  it('mismas lecturas → mismo hash, aunque lleguen en otro orden', () => {
    const una = lecturas();
    const otra = lecturas({ plantillas: [...una.plantillas].reverse() });
    expect(hashDe(contenidoDe(COP, una, AHORA))).toBe(hashDe(contenidoDe(COP, otra, AHORA)));
    expect(hashDe(contenidoDe(COP, lecturas({ vetos: [] }), AHORA))).not.toBe(
      hashDe(contenidoDe(COP, una, AHORA)),
    );
  });
});

describe('PublicarInstantanea (15-Q, Q1)', () => {
  it('la primera descarga publica la v1 y la entrega entera, con hash y versión', async () => {
    const { caso, versiones, gateways } = montar();
    const r = await caso.ejecutar(gateway, 0);
    expect(r.tipo).toBe('nueva');
    if (r.tipo !== 'nueva') return;
    expect(r.instantanea).toMatchObject({
      copropiedadId: COP,
      version: 1,
      generadaEn: AHORA.toISOString(),
    });
    expect(r.instantanea.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(await versiones.ultima(COP)).toEqual({ numero: 1, hash: r.instantanea.hash });
    expect(gateways.descargas).toEqual([{ edgeId: gateway.id, version: 1, ahora: AHORA }]);
  });

  it('?desde= la vigente y sin cambios → «sin cambios» con la fe de vida de AHORA; no publica', async () => {
    const { caso, versiones, avanzar } = montar();
    await caso.ejecutar(gateway, 0);
    avanzar(60_000);
    const r = await caso.ejecutar(gateway, 1);
    expect(r).toEqual({
      tipo: 'sin_cambios',
      copropiedadId: COP,
      version: 1,
      generadaEn: new Date(+AHORA + 60_000).toISOString(),
    });
    expect(versiones.publicadas.get(COP)).toHaveLength(1);
  });

  it('la versión AVANZA cuando el contenido cambia, y sólo entonces', async () => {
    let actuales = lecturas();
    const { caso } = montar({ leer: async () => actuales });
    await caso.ejecutar(gateway, 0);
    actuales = lecturas({ vetos: [] });
    const r = await caso.ejecutar(gateway, 1);
    expect(r).toMatchObject({ tipo: 'nueva', instantanea: { version: 2 } });
  });

  it('un Edge con una versión que la nube no publicó: «adelantada», y se registra', async () => {
    const { caso, lineas } = montar();
    expect(await caso.ejecutar(gateway, 7)).toEqual({ tipo: 'adelantada', version: 1, desde: 7 });
    expect(lineas).toContain('un Edge tiene una versión de reglas que la nube no publicó');
  });

  it('si otras publicaciones ganan la carrera tres veces, falla en vez de inventar un número', async () => {
    const { caso, versiones } = montar();
    versiones.publicar = async () => false;
    await expect(caso.ejecutar(gateway, 0)).rejects.toThrow(/publicaciones concurrentes/);
  });

  it('si la anotación del Edge falla, la instantánea sale igual y se avisa', async () => {
    const { caso, gateways, lineas } = montar();
    gateways.anotarDescarga = async () => {
      throw new Error('base caída');
    };
    expect((await caso.ejecutar(gateway, 0)).tipo).toBe('nueva');
    expect(lineas).toContain('no se pudo anotar la descarga del Edge');
  });

  it('sin base, la instantánea sale vacía: el Edge niega todo lo que no conoce', async () => {
    const { caso } = montar(new FuenteDeReglasVacia());
    const r = await caso.ejecutar(gateway, 0);
    expect(r).toMatchObject({
      tipo: 'nueva',
      instantanea: { autorizaciones: [], vehiculos: [], plantillas: [], umbralDeConfianza: 0.8 },
    });
  });
});
