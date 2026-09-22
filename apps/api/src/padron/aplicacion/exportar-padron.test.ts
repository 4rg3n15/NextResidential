import { describe, expect, it } from 'vitest';
import { BOM_UTF8, ExportarPadron } from './exportar-padron';
import type { FilaExportada, RepositorioPadron } from './puertos';

/**
 * H-13-15 · el CSV del padrón no puede salir con fórmulas vivas.
 *
 * Medido de punta a punta antes del arreglo, contra la base real: una vivienda
 * cuyo identificador era `=HYPERLINK("http://malo.example","ver")` llegaba al
 * fichero entrecomillada —y sólo entrecomillada—, y Excel la evaluaba al abrir.
 */
const repoCon = (filas: readonly FilaExportada[]): RepositorioPadron =>
  ({
    exportarPadron: async () => filas,
  }) as unknown as RepositorioPadron;

const CTX = { copropiedadId: 'c1', rol: 'administrador', usuarioId: 'u1' } as never;

describe('ExportarPadron · inyección de fórmulas (H-13-15)', () => {
  it('neutraliza el campo que empezaría siendo fórmula', async () => {
    const fila: FilaExportada = {
      identificador: '=HYPERLINK("http://malo.example","ver")',
      agrupacion: null,
      documento: null,
      tipoDocumento: null,
      nombre: '@SUM(1+1)',
      placa: null,
      esTitular: null,
    };
    const { csv } = await new ExportarPadron(repoCon([fila])).ejecutar(CTX);
    const lineas = csv.replace(BOM_UTF8, '').trim().split('\r\n');
    const datos = lineas[1] ?? '';
    expect(datos).toContain(`'=HYPERLINK`);
    expect(datos).toContain(`'@SUM(1+1)`);
    // Y no queda ninguna celda que empiece por `=` tras deshacer el
    // entrecomillado, que es lo que hace Excel al abrir.
    for (const celda of datos.split(',')) {
      expect(celda.replace(/^"|"$/g, '').startsWith('=')).toBe(false);
    }
  });

  it('y no estropea un padrón normal', async () => {
    const fila: FilaExportada = {
      identificador: '101',
      agrupacion: 'Torre 1',
      documento: '12345678',
      tipoDocumento: 'CC',
      nombre: 'Ana Pérez',
      placa: 'ABC123',
      esTitular: true,
    };
    const { csv } = await new ExportarPadron(repoCon([fila])).ejecutar(CTX);
    expect(csv).toContain('101,Torre 1,12345678,CC,Ana Pérez,ABC123,true');
  });
});
