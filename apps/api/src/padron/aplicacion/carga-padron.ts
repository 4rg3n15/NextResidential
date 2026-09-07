import { Placa } from '@ncr/domain-core';
import { esExito } from '@ncr/domain-core';
import type { RepositorioPadron } from './puertos';
import type { ContextoTenant } from '../../autenticacion/dominio/claims';

/**
 * Carga de padrón desde archivo (HU-03).
 *
 * El caso de uso trabaja sobre FILAS ya extraídas, no sobre bytes. El análisis
 * del formato es un adaptador: hoy hay uno de CSV, y XLSX entra como otro sin
 * tocar esta lógica. Separarlo importa por seguridad además de por diseño —
 * un analizador binario es superficie de ataque y merece su propia revisión
 * (§2.7.8, validación por tipo real).
 */
export interface FilaPadron {
  readonly numeroDeFila: number;
  readonly viviendaId: string;
  readonly placa?: string;
  readonly personaId?: string;
  readonly esTitular?: boolean;
}

export interface ErrorDeFila {
  readonly numeroDeFila: number;
  readonly motivo: string;
}

export interface ResultadoCarga {
  readonly aceptadas: number;
  readonly errores: readonly ErrorDeFila[];
  readonly aplicada: boolean;
}

export class CargarPadronDesdeArchivo {
  constructor(private readonly repo: RepositorioPadron) {}

  /**
   * Valida **todas** las filas antes de escribir ninguna, y aborta la
   * transacción entera si alguna falla. Una carga parcial es peor que ninguna:
   * el administrador no sabe qué entró, y reintentar duplica lo que sí pasó.
   */
  async ejecutar(ctx: ContextoTenant, filas: readonly FilaPadron[]): Promise<ResultadoCarga> {
    const errores: ErrorDeFila[] = [];
    const validas: { fila: FilaPadron; placa?: Placa }[] = [];

    for (const fila of filas) {
      if (!fila.viviendaId) {
        errores.push({ numeroDeFila: fila.numeroDeFila, motivo: 'vivienda_id vacío' });
        continue;
      }
      if (fila.placa !== undefined) {
        const r = Placa.crear(fila.placa);
        if (!esExito(r)) {
          errores.push({ numeroDeFila: fila.numeroDeFila, motivo: r.error.detalle });
          continue;
        }
        validas.push({ fila, placa: r.valor });
        continue;
      }
      if (fila.personaId) {
        validas.push({ fila });
        continue;
      }
      errores.push({
        numeroDeFila: fila.numeroDeFila,
        motivo: 'la fila no aporta placa ni persona',
      });
    }

    if (errores.length > 0 || !ctx.copropiedadId) {
      return { aceptadas: 0, errores, aplicada: false };
    }

    const copropiedadId = ctx.copropiedadId;
    try {
      const aceptadas = await this.repo.enTransaccion(async (repo) => {
        let n = 0;
        for (const { fila, placa } of validas) {
          if (placa) {
            const r = await repo.registrarVehiculo({
              copropiedadId,
              viviendaId: fila.viviendaId,
              personaId: fila.personaId ?? null,
              placa,
              actorId: ctx.usuarioId,
            });
            // Un choque de placa dentro de una carga masiva aborta la carga:
            // aceptar el resto dejaría al operador creyendo que entró completa.
            if (r.tipo !== 'registrado') {
              throw new ErrorDeCarga(fila.numeroDeFila, `placa ${placa} ya activa`);
            }
          } else {
            const r = await repo.registrarResidente({
              copropiedadId,
              viviendaId: fila.viviendaId,
              personaId: fila.personaId!,
              esTitular: fila.esTitular ?? false,
              actorId: ctx.usuarioId,
            });
            if (!r) throw new ErrorDeCarga(fila.numeroDeFila, 'residente duplicado');
          }
          n += 1;
        }
        return n;
      });
      return { aceptadas, errores: [], aplicada: true };
    } catch (e) {
      if (e instanceof ErrorDeCarga) {
        return {
          aceptadas: 0,
          errores: [{ numeroDeFila: e.fila, motivo: e.motivo }],
          aplicada: false,
        };
      }
      throw e;
    }
  }
}

export class ErrorDeCarga extends Error {
  constructor(
    readonly fila: number,
    readonly motivo: string,
  ) {
    super(`fila ${fila}: ${motivo}`);
    this.name = 'ErrorDeCarga';
  }
}

/**
 * Analizador CSV. Deliberadamente pequeño y sin dependencias: admite comillas
 * dobles y separador `,`, y **rechaza** lo que no entiende en vez de adivinar.
 * Un CSV mal interpretado mete placas en la columna equivocada sin avisar.
 */
export const analizarCsv = (contenido: string): FilaPadron[] => {
  const lineas = contenido
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (lineas.length < 2) return [];
  const cabeceras = partir(lineas[0]!).map((c) => c.trim().toLowerCase());
  const idx = (n: string): number => cabeceras.indexOf(n);
  const filas: FilaPadron[] = [];
  for (let i = 1; i < lineas.length; i++) {
    const celdas = partir(lineas[i]!);
    const leer = (n: string): string | undefined => {
      const j = idx(n);
      const v = j >= 0 ? celdas[j]?.trim() : undefined;
      return v && v.length > 0 ? v : undefined;
    };
    filas.push({
      numeroDeFila: i + 1,
      viviendaId: leer('vivienda_id') ?? '',
      ...(leer('placa') ? { placa: leer('placa')! } : {}),
      ...(leer('persona_id') ? { personaId: leer('persona_id')! } : {}),
      ...(leer('es_titular') ? { esTitular: leer('es_titular')!.toLowerCase() === 'true' } : {}),
    });
  }
  return filas;
};

const partir = (linea: string): string[] => {
  const celdas: string[] = [];
  let actual = '';
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]!;
    if (entreComillas) {
      if (c === '"' && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else if (c === '"') entreComillas = false;
      else actual += c;
    } else if (c === '"') entreComillas = true;
    else if (c === ',') {
      celdas.push(actual);
      actual = '';
    } else actual += c;
  }
  celdas.push(actual);
  return celdas;
};
