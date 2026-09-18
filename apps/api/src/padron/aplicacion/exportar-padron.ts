import type { FilaExportada, RepositorioPadron } from './puertos';
import { COLUMNAS_DEL_PADRON } from './carga-padron';
import type { ContextoTenant } from '../../autenticacion';

/**
 * Exportación del padrón a CSV.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL CÍRCULO TIENE QUE CERRAR
 *
 * Lo que sale por aquí tiene que poder volver a entrar por la carga **sin
 * editarlo**. Si no cerrara, una de las dos estaría mal, y el ciclo real de
 * trabajo —exportar, corregir en Excel, volver a importar— sería imposible.
 *
 * Por eso la cabecera no se escribe a mano: sale de `COLUMNAS_DEL_PADRON`, la
 * misma lista que entiende el lector. Una cabecera escrita dos veces son dos
 * formatos esperando a divergir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ CSV Y NO XLSX
 *
 * Escribir XLSX significa escribir un generador de ZIP y de XML. Excel abre CSV
 * desde el menú Archivo sin perder nada de lo que aquí importa, y el lector de
 * XLSX que ya existe —el de la carga— es de LECTURA y está acotado a propósito
 * porque un analizador binario es superficie de ataque (D-20t). Añadir un
 * escritor sería más código para contestar lo mismo.
 */

/**
 * **La marca de orden de bytes, y por qué no es un capricho.**
 *
 * Sin ella, Excel en Windows abre un CSV en UTF-8 como si fuera de la página de
 * códigos local: «Peña» se lee «PeÃ±a» y el administrador concluye que el
 * sistema corrompe los nombres. Tres bytes evitan esa conversación.
 */
export const BOM_UTF8 = '﻿';

/** Tope de filas. El mismo orden de magnitud que el lector (5 000 filas). */
export const TOPE_DE_EXPORTACION = 10_000;

const celda = (valor: string | null): string => {
  if (valor === null) return '';
  // Comillas si hay separador, comilla o salto: es el escape de RFC 4180, que
  // es el que Excel lee.
  const necesitaComillas = /[",\r\n]/.test(valor);
  const escapado = valor.replace(/"/g, '""');
  return necesitaComillas ? `"${escapado}"` : escapado;
};

const filaACeldas = (f: FilaExportada): readonly (string | null)[] => [
  f.identificador,
  f.agrupacion,
  f.documento,
  f.tipoDocumento,
  f.nombre,
  f.placa,
  f.esTitular === null ? null : String(f.esTitular),
];

export interface PadronExportado {
  readonly csv: string;
  readonly filas: number;
  /**
   * `true` si se alcanzó el tope. Se declara, como exige la lección de D-33: un
   * archivo corto que parece completo es peor que un error.
   */
  readonly truncado: boolean;
}

export class ExportarPadron {
  constructor(private readonly repo: RepositorioPadron) {}

  async ejecutar(ctx: ContextoTenant): Promise<PadronExportado> {
    if (!ctx.copropiedadId) {
      return { csv: BOM_UTF8 + COLUMNAS_DEL_PADRON.join(',') + '\r\n', filas: 0, truncado: false };
    }
    const filas = await this.repo.exportarPadron(ctx.copropiedadId);
    const lineas = [
      COLUMNAS_DEL_PADRON.join(','),
      ...filas.map((f) => filaACeldas(f).map(celda).join(',')),
    ];
    return {
      // CRLF, que es lo que Excel espera de un CSV; el lector admite los dos.
      csv: BOM_UTF8 + lineas.join('\r\n') + '\r\n',
      filas: filas.length,
      truncado: filas.length >= TOPE_DE_EXPORTACION,
    };
  }
}
