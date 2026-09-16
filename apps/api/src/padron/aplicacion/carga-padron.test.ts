import { describe, expect, it, vi } from 'vitest';
import { CargarPadronDesdeArchivo, analizarCsv } from './carga-padron';
import type { RepositorioPadron } from './puertos';
import type { LectorDeVocabulario } from './vocabulario';
import type { ContextoTenant } from '../../autenticacion';

const ctx: ContextoTenant = {
  usuarioId: 'u1',
  rol: 'administrador',
  copropiedadId: 'cop-1',
  copropiedadesAtendidas: [],
  mfaVerificado: true,
};

const repoFalso = (
  registrar = vi.fn().mockResolvedValue({ tipo: 'registrado', id: 'v1' }),
): RepositorioPadron => {
  const repo: RepositorioPadron = {
    registrarVehiculo: registrar,
    desactivarVehiculo: vi.fn().mockResolvedValue(true),
    registrarResidente: vi.fn().mockResolvedValue({ id: 'r1' }),
    buscarViviendaPorIdentificador: vi
      .fn()
      .mockResolvedValue({ id: '30000000-0000-4000-8000-0000000000bb' }),
    buscarPersonas: vi.fn().mockResolvedValue([]),
    registrarPersona: vi
      .fn()
      .mockResolvedValue({ tipo: 'registrada', id: 'per-1', nombreCompleto: 'Ana Pérez' }),
    desactivarVivienda: vi.fn().mockResolvedValue(true),
    contarVehiculosActivos: vi.fn().mockResolvedValue(0),
    listarViviendas: vi
      .fn()
      .mockResolvedValue({ totales: { activas: 0, inactivas: 0 }, viviendas: [] }),
    listarVehiculos: vi.fn().mockResolvedValue([]),
    generarViviendas: vi.fn().mockResolvedValue({ creadas: 0, colisiones: [] }),
    viviendasExistentes: vi.fn().mockResolvedValue([]),
    exportarPadron: vi.fn().mockResolvedValue([]),
    enTransaccion: async (op) => op(repo),
  };
  return repo;
};

/** Vocabulario del conjunto. Sin configurar salvo que la prueba diga otra cosa. */
const vocabulario = (
  etiquetaVivienda = 'Vivienda',
  etiquetaAgrupacion = 'Torre o bloque',
): LectorDeVocabulario => ({
  leer: vi.fn().mockResolvedValue({ tipo: null, etiquetaVivienda, etiquetaAgrupacion }),
});

describe('analizador CSV', () => {
  it('lee cabeceras y celdas entrecomilladas', () => {
    const filas = analizarCsv('vivienda,placa\nCasa 12,"ABC 123"\nCasa 13,XYZ987\n');
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({ numeroDeFila: 2, vivienda: 'Casa 12', placa: 'ABC 123' });
  });

  it('devuelve vacío si no hay filas de datos', () => {
    expect(analizarCsv('vivienda,placa\n')).toEqual([]);
    expect(analizarCsv('')).toEqual([]);
  });

  it('las comillas dobles escapadas no parten la celda', () => {
    const filas = analizarCsv('vivienda,placa\n"Casa, 1","AB""C12"\n');
    expect(filas[0]!.vivienda).toBe('Casa, 1');
  });

  it('la columna se llama `identificador`, y `vivienda` sigue valiendo', () => {
    const nuevas = analizarCsv('identificador,agrupacion\n101,B\n');
    expect(nuevas[0]).toMatchObject({ vivienda: '101', agrupacion: 'B' });
    const viejas = analizarCsv('vivienda\nCasa 12\n');
    expect(viejas[0]).toMatchObject({ vivienda: 'Casa 12' });
  });

  it('D-72 · la hoja se llena con nombre y documento, no con UUIDs', () => {
    const filas = analizarCsv('vivienda,documento,nombre\nCasa 12,12.345.678,Ana Pérez\n');
    expect(filas[0]).toMatchObject({
      vivienda: 'Casa 12',
      documento: '12.345.678',
      nombre: 'Ana Pérez',
    });
  });

  it('sigue leyendo `vivienda_id` y `persona_id`: quien exporta y recarga no traduce nada', () => {
    const filas = analizarCsv('vivienda_id,persona_id\nviv-1,per-1\n');
    expect(filas[0]).toMatchObject({ vivienda: 'viv-1', personaId: 'per-1' });
  });
});

describe('carga de padrón · todo o nada (HU-03)', () => {
  it('no escribe NADA si alguna fila es inválida', async () => {
    const registrar = vi.fn();
    const r = await new CargarPadronDesdeArchivo(repoFalso(registrar), vocabulario()).ejecutar(
      ctx,
      [
        { numeroDeFila: 2, vivienda: 'Casa 12', placa: 'ABC123' },
        { numeroDeFila: 3, vivienda: 'Casa 12', placa: 'no-vale-Ω' },
      ],
    );
    expect(r.aplicada).toBe(false);
    expect(r.aceptadas).toBe(0);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]!.numeroDeFila).toBe(3);
    // La clave: la fila 2 era válida y AUN ASÍ no se escribió.
    expect(registrar).not.toHaveBeenCalled();
  });

  it('aplica la carga completa cuando todas las filas son válidas', async () => {
    const r = await new CargarPadronDesdeArchivo(repoFalso(), vocabulario()).ejecutar(ctx, [
      { numeroDeFila: 2, vivienda: 'Casa 12', placa: 'abc-123' },
      { numeroDeFila: 3, vivienda: 'Casa 13', personaId: 'p1', esTitular: true },
    ]);
    expect(r).toMatchObject({ aplicada: true, aceptadas: 2, errores: [] });
  });

  it('un choque de placa a mitad aborta la carga entera', async () => {
    const registrar = vi
      .fn()
      .mockResolvedValueOnce({ tipo: 'registrado', id: 'v1' })
      .mockResolvedValueOnce({ tipo: 'placa_activa_duplicada' });
    const r = await new CargarPadronDesdeArchivo(repoFalso(registrar), vocabulario()).ejecutar(
      ctx,
      [
        { numeroDeFila: 2, vivienda: 'Casa 12', placa: 'ABC123' },
        { numeroDeFila: 3, vivienda: 'Casa 12', placa: 'XYZ987' },
      ],
    );
    expect(r.aplicada).toBe(false);
    expect(r.aceptadas).toBe(0);
    expect(r.errores[0]!.numeroDeFila).toBe(3);
  });

  it('rechaza la fila sin vivienda', async () => {
    const r = await new CargarPadronDesdeArchivo(repoFalso(), vocabulario()).ejecutar(ctx, [
      { numeroDeFila: 2, vivienda: '', placa: 'ABC123' },
    ]);
    expect(r.errores[0]!.motivo).toMatch(/vivienda/);
  });
});

/**
 * D-72 · lo que hace la hoja RELLENABLE. Sin esto, la única forma de cargar el
 * padrón era conocer los UUID internos, que solo existen dentro de la base:
 * nadie podía dar de alta un padrón desde cero.
 */
describe('carga de padrón · la hoja se rellena con lo que el conjunto tiene escrito', () => {
  it('resuelve la vivienda por su identificador y no la duplica entre filas', async () => {
    const buscar = vi.fn().mockResolvedValue({ id: 'viv-uuid' });
    const registrarVehiculo = vi.fn().mockResolvedValue({ tipo: 'registrado', id: 'v1' });
    const repo = repoFalso(registrarVehiculo);
    const r = await new CargarPadronDesdeArchivo(
      {
        ...repo,
        buscarViviendaPorIdentificador: buscar,
        enTransaccion: async (op) =>
          op({ ...repo, buscarViviendaPorIdentificador: buscar, registrarVehiculo }),
      },
      vocabulario(),
    ).ejecutar(ctx, [
      { numeroDeFila: 2, vivienda: 'Casa 12', placa: 'ABC123' },
      { numeroDeFila: 3, vivienda: 'Casa 12', placa: 'XYZ987' },
    ]);
    expect(r.aplicada).toBe(true);
    // Una sola resolución para dos filas de la misma casa.
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(registrarVehiculo.mock.calls[0]![0].viviendaId).toBe('viv-uuid');
  });

  it('crea la vivienda que no existe y LO DICE en el resumen', async () => {
    const registrarVivienda = vi.fn().mockResolvedValue({ tipo: 'registrada', id: 'viv-nueva' });
    const repo = {
      ...repoFalso(),
      buscarViviendaPorIdentificador: vi.fn().mockResolvedValue(null),
      registrarVivienda,
    };
    const r = await new CargarPadronDesdeArchivo(
      { ...repo, enTransaccion: async (op) => op(repo) },
      vocabulario(),
    ).ejecutar(ctx, [{ numeroDeFila: 2, vivienda: 'Casa 40' }]);
    expect(r).toMatchObject({ aplicada: true, aceptadas: 1, viviendasCreadas: 1 });
    expect(registrarVivienda.mock.calls[0]![0].identificador).toBe('Casa 40');
  });

  it('H-3 · «Casa 40» en la hoja se GUARDA como «40», y el recorte se cuenta', async () => {
    // Al revés que el alta individual, que lo rechaza. Aquí el archivo es el
    // que el conjunto ya tenía: negarse a leerlo por una palabra que sabemos
    // quitar convertiría la vía más rápida de cargar el padrón en la más lenta.
    const registrarVivienda = vi.fn().mockResolvedValue({ tipo: 'registrada', id: 'viv-nueva' });
    const repo = {
      ...repoFalso(),
      buscarViviendaPorIdentificador: vi.fn().mockResolvedValue(null),
      registrarVivienda,
    };
    const r = await new CargarPadronDesdeArchivo(
      { ...repo, enTransaccion: async (op) => op(repo) },
      vocabulario('Casa', 'Manzana'),
    ).ejecutar(ctx, [{ numeroDeFila: 2, vivienda: 'Casa 40', agrupacion: 'Manzana B' }]);
    expect(r).toMatchObject({ aplicada: true, identificadoresRecortados: 1 });
    expect(registrarVivienda.mock.calls[0]![0].identificador).toBe('40');
    // La agrupación también: «Manzana B» es la palabra y el valor juntos.
    expect(registrarVivienda.mock.calls[0]![0].agrupacion).toBe('B');
  });

  it('el 101 de la Torre 1 y el de la Torre 2 son DOS viviendas (H-2)', async () => {
    const registrarVivienda = vi
      .fn()
      .mockResolvedValueOnce({ tipo: 'registrada', id: 'viv-a' })
      .mockResolvedValueOnce({ tipo: 'registrada', id: 'viv-b' });
    const buscar = vi.fn().mockResolvedValue(null);
    const repo = {
      ...repoFalso(),
      buscarViviendaPorIdentificador: buscar,
      registrarVivienda,
    };
    const r = await new CargarPadronDesdeArchivo(
      { ...repo, enTransaccion: async (op) => op(repo) },
      vocabulario('Apartamento', 'Torre'),
    ).ejecutar(ctx, [
      { numeroDeFila: 2, vivienda: '101', agrupacion: '1' },
      { numeroDeFila: 3, vivienda: '101', agrupacion: '2' },
    ]);
    // Si la caché se guardara por número, la segunda fila reutilizaría la
    // primera y el padrón se cargaría con la mitad de las viviendas.
    expect(r).toMatchObject({ aplicada: true, viviendasCreadas: 2 });
    expect(buscar).toHaveBeenCalledTimes(2);
    expect(buscar.mock.calls[0]).toEqual(['cop-1', '1', '101']);
    expect(buscar.mock.calls[1]).toEqual(['cop-1', '2', '101']);
  });

  it('resuelve la persona por documento, sin duplicarla entre filas (RN-06)', async () => {
    const registrarPersona = vi
      .fn()
      .mockResolvedValue({ tipo: 'registrada', id: 'per-1', nombreCompleto: 'Ana Pérez' });
    const registrarResidente = vi.fn().mockResolvedValue({ id: 'r1' });
    const repo = { ...repoFalso(), registrarPersona, registrarResidente };
    const r = await new CargarPadronDesdeArchivo(
      { ...repo, enTransaccion: async (op) => op(repo) },
      vocabulario(),
    ).ejecutar(ctx, [
      { numeroDeFila: 2, vivienda: 'Casa 12', documento: '12.345.678', nombre: 'Ana Pérez' },
      // El mismo documento escrito de otra forma: es la MISMA persona.
      { numeroDeFila: 3, vivienda: 'Casa 13', documento: '12345678', nombre: 'Ana Pérez' },
    ]);
    expect(r).toMatchObject({ aplicada: true, aceptadas: 2, personasCreadas: 1 });
    expect(registrarPersona).toHaveBeenCalledTimes(1);
    expect(registrarPersona.mock.calls[0]![0].documento.numero).toBe('12345678');
    expect(registrarResidente.mock.calls[1]![0].personaId).toBe('per-1');
  });

  it('un documento con nombre ausente se rechaza con el motivo, no con un 500', async () => {
    const r = await new CargarPadronDesdeArchivo(repoFalso(), vocabulario()).ejecutar(ctx, [
      { numeroDeFila: 2, vivienda: 'Casa 12', documento: '12345678' },
    ]);
    expect(r.aplicada).toBe(false);
    expect(r.errores[0]!.motivo).toMatch(/nombre/);
  });

  it('un nombre sin documento tampoco pasa: sin documento no hay identidad', async () => {
    const r = await new CargarPadronDesdeArchivo(repoFalso(), vocabulario()).ejecutar(ctx, [
      { numeroDeFila: 2, vivienda: 'Casa 12', nombre: 'Ana Pérez' },
    ]);
    expect(r.errores[0]!.motivo).toMatch(/sin documento no hay identidad/);
  });
});
