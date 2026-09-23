import { describe, expect, it, vi } from 'vitest';
import type { PlanDeGeneracion } from '@ncr/domain-core';
import { GenerarViviendas } from './generar-viviendas';
import { ExportarPadron } from './exportar-padron';
import { CargarPadronDesdeArchivo, COLUMNAS_DEL_PADRON, analizarCsv } from './carga-padron';
import type { FilaExportada, RepositorioPadron } from './puertos';
import type { LectorDeVocabulario } from './vocabulario';
import type { ContextoTenant } from '../../autenticacion';

const ctx: ContextoTenant = {
  usuarioId: 'u1',
  rol: 'administrador',
  copropiedadId: 'cop-1',
  copropiedadesAtendidas: [],
  mfaVerificado: true,
};

const repo = (parcial: Partial<RepositorioPadron> = {}): RepositorioPadron => {
  const base: RepositorioPadron = {
    resolverPlaca: vi.fn().mockResolvedValue(null),
    registrarVehiculo: vi.fn().mockResolvedValue({ tipo: 'registrado', id: 'v1' }),
    desactivarVehiculo: vi.fn().mockResolvedValue(true),
    registrarResidente: vi.fn().mockResolvedValue({ id: 'r1' }),
    desactivarVivienda: vi.fn().mockResolvedValue(true),
    contarVehiculosActivos: vi.fn().mockResolvedValue(0),
    registrarVivienda: vi.fn().mockResolvedValue({ tipo: 'registrada', id: 'viv-9' }),
    buscarPersonas: vi.fn().mockResolvedValue([]),
    registrarPersona: vi
      .fn()
      .mockResolvedValue({ tipo: 'registrada', id: 'per-1', nombreCompleto: 'Ana Pérez' }),
    buscarViviendaPorIdentificador: vi.fn().mockResolvedValue(null),
    listarViviendas: vi
      .fn()
      .mockResolvedValue({ totales: { activas: 0, inactivas: 0 }, viviendas: [] }),
    listarVehiculos: vi.fn().mockResolvedValue([]),
    generarViviendas: vi.fn().mockResolvedValue({ creadas: 0, colisiones: [] }),
    viviendasExistentes: vi.fn().mockResolvedValue([]),
    exportarPadron: vi.fn().mockResolvedValue([]),
    enTransaccion: async (op) => op(base),
    ...parcial,
  };
  return base;
};

/**
 * B.1 · dos agrupaciones de cuatro, numeradas por piso (2 por piso ⇒ 2 pisos).
 * Se describe como lo describiría alguien en voz alta: «dos torres de cuatro».
 */
const PLAN: PlanDeGeneracion = {
  agrupaciones: 2,
  estilo: 'numeros',
  cantidad: 4,
  porPiso: 2,
};

describe('vista previa · lo que se va a crear, antes de crearlo', () => {
  it('devuelve el total, los grupos y sus extremos', async () => {
    const caso = new GenerarViviendas(repo());
    const r = await caso.previsualizar(ctx, PLAN);
    expect(r.ok && r.valor.total).toBe(8);
    expect(r.ok && r.valor.grupos.map((g) => g.cantidad)).toEqual([4, 4]);
  });

  it('un plan inválido NO llega a la base', async () => {
    const existentes = vi.fn();
    const caso = new GenerarViviendas(repo({ viviendasExistentes: existentes }));
    const r = await caso.previsualizar(ctx, { ...PLAN, cantidad: 0 });
    expect(r.ok).toBe(false);
    expect(existentes).not.toHaveBeenCalled();
  });

  it('las colisiones se enseñan antes de confirmar', async () => {
    const caso = new GenerarViviendas(
      repo({
        viviendasExistentes: vi.fn().mockResolvedValue([{ agrupacion: '1', identificador: '101' }]),
      }),
    );
    const r = await caso.previsualizar(ctx, PLAN);
    expect(r.ok && r.valor.colisiones).toEqual([{ agrupacion: '1', identificador: '101' }]);
  });
});

describe('confirmación · la vista previa y la creación salen del MISMO cálculo', () => {
  it('lo que se inserta es exactamente lo que la vista previa enseñó', async () => {
    const generar = vi.fn().mockResolvedValue({ creadas: 8, colisiones: [] });
    const caso = new GenerarViviendas(repo({ generarViviendas: generar }));
    const vista = await caso.previsualizar(ctx, PLAN);
    const aplicada = await caso.confirmar(ctx, PLAN, vista.ok ? vista.valor.total : 0);

    expect(aplicada.ok && aplicada.valor.creadas).toBe(8);
    const enviadas = generar.mock.calls[0]![0].viviendas as { identificador: string }[];
    expect(enviadas).toHaveLength(vista.ok ? vista.valor.total : -1);
    expect(enviadas.map((v) => v.identificador).slice(0, 2)).toEqual(['101', '102']);
  });

  it('si el total aprobado no coincide, no se crea NADA', async () => {
    // La ventana que cierra: el formulario cambió entre previsualizar y
    // confirmar —una torre más—, y el usuario aprobó otro número.
    const generar = vi.fn();
    const caso = new GenerarViviendas(repo({ generarViviendas: generar }));
    const r = await caso.confirmar(ctx, PLAN, 4);
    expect(r.ok).toBe(false);
    expect(generar).not.toHaveBeenCalled();
  });

  it('una sola colisión anula la generación entera, y se nombran todas', async () => {
    const caso = new GenerarViviendas(
      repo({
        generarViviendas: vi.fn().mockResolvedValue({
          creadas: 0,
          colisiones: [
            { agrupacion: '1', identificador: '101' },
            { agrupacion: '2', identificador: '202' },
          ],
        }),
      }),
    );
    const r = await caso.confirmar(ctx, PLAN, 8);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.detalle).toMatch(/No se creó ninguna vivienda/);
    expect(!r.ok && r.error.detalle).toMatch(/1 · 101/);
    expect(!r.ok && r.error.detalle).toMatch(/2 · 202/);
  });

  it('el plan queda en el rastro de auditoría, no solo el número', async () => {
    const generar = vi.fn().mockResolvedValue({ creadas: 8, colisiones: [] });
    await new GenerarViviendas(repo({ generarViviendas: generar })).confirmar(ctx, PLAN, 8);
    // El resumen dice CUÁNTAS, que es el dato que alguien busca al leer esta
    // auditoría; antes, con tres redacciones, la de apartamentos ni lo nombraba.
    expect(generar.mock.calls[0]![0].resumenDelPlan).toMatch(/2 agrupaciones/);
    expect(generar.mock.calls[0]![0].resumenDelPlan).toMatch(/de 4/);
    expect(generar.mock.calls[0]![0].resumenDelPlan).toMatch(/8 viviendas/);
  });

  it('una identidad sin copropiedad no genera nada (RN-15)', async () => {
    const generar = vi.fn();
    const r = await new GenerarViviendas(repo({ generarViviendas: generar })).confirmar(
      { ...ctx, rol: 'superadministrador', copropiedadId: null },
      PLAN,
      8,
    );
    expect(r.ok).toBe(false);
    expect(generar).not.toHaveBeenCalled();
  });
});

const FILAS: readonly FilaExportada[] = [
  {
    identificador: '101',
    agrupacion: '1',
    documento: '12345678',
    tipoDocumento: 'cedula',
    nombre: 'Ana Pérez',
    placa: null,
    esTitular: true,
  },
  {
    identificador: '101',
    agrupacion: '2',
    documento: null,
    tipoDocumento: null,
    nombre: null,
    placa: 'ABC123',
    esTitular: null,
  },
  {
    identificador: '102',
    agrupacion: '1',
    documento: null,
    tipoDocumento: null,
    nombre: null,
    placa: null,
    esTitular: null,
  },
];

describe('exportación · el círculo tiene que cerrar', () => {
  it('la cabecera es la MISMA lista que entiende el lector', async () => {
    const r = await new ExportarPadron(repo({ exportarPadron: vi.fn().mockResolvedValue(FILAS) })) //
      .ejecutar(ctx);
    const primeraLinea = r.csv.replace('﻿', '').split('\r\n')[0];
    expect(primeraLinea).toBe(COLUMNAS_DEL_PADRON.join(','));
  });

  it('lleva marca de orden de bytes: sin ella Excel destroza «Peña»', async () => {
    const r = await new ExportarPadron(repo({ exportarPadron: vi.fn().mockResolvedValue(FILAS) })) //
      .ejecutar(ctx);
    expect(r.csv.startsWith('﻿')).toBe(true);
  });

  it('lo exportado vuelve a entrar por la carga SIN editarlo', async () => {
    // La condición que el usuario puso: si el círculo no cerrara, una de las
    // dos estaría mal. Se comprueba de verdad —exportar, analizar, cargar— y no
    // comparando dos listas de nombres de columna.
    const exportado = await new ExportarPadron(
      repo({ exportarPadron: vi.fn().mockResolvedValue(FILAS) }),
    ).ejecutar(ctx);

    const filas = analizarCsv(exportado.csv);
    expect(filas).toHaveLength(3);
    expect(filas[0]).toMatchObject({
      vivienda: '101',
      agrupacion: '1',
      documento: '12345678',
      nombre: 'Ana Pérez',
      esTitular: true,
    });

    const registrarVivienda = vi.fn().mockResolvedValue({ tipo: 'registrada', id: 'viv-x' });
    const base = repo({
      registrarVivienda,
      buscarViviendaPorIdentificador: vi.fn().mockResolvedValue(null),
    });
    const vocabulario: LectorDeVocabulario = {
      leer: vi.fn().mockResolvedValue({
        tipo: 'apartamentos',
        etiquetaVivienda: 'Apartamento',
        etiquetaAgrupacion: 'Torre',
      }),
    };
    const carga = await new CargarPadronDesdeArchivo(base, vocabulario).ejecutar(ctx, filas);

    expect(carga.aplicada).toBe(true);
    expect(carga.errores).toEqual([]);
    expect(carga.aceptadas).toBe(3);
    // Y las dos «101» se crean por separado: son Torre 1 y Torre 2.
    expect(carga.viviendasCreadas).toBe(3);
  });

  it('un nombre con coma no parte la fila al volver a leerla', async () => {
    const conComa: readonly FilaExportada[] = [
      {
        identificador: '7',
        agrupacion: null,
        documento: '999',
        tipoDocumento: 'cedula',
        nombre: 'Pérez Gómez, Ana María',
        placa: null,
        esTitular: false,
      },
    ];
    const exportado = await new ExportarPadron(
      repo({ exportarPadron: vi.fn().mockResolvedValue(conComa) }),
    ).ejecutar(ctx);
    const filas = analizarCsv(exportado.csv);
    expect(filas[0]?.nombre).toBe('Pérez Gómez, Ana María');
    expect(filas[0]?.vivienda).toBe('7');
  });
});
