import { errorDominio, esFallo, exito, fallo } from '@ncr/domain-core';
import type { Bitacora, ErrorDominio, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { SincronizarPlantilla } from './casos-de-uso';
import type { CatalogoDeTerminales, RepositorioPlantillas } from './puertos';

/**
 * `SincronizarPlantillaEnTerminales` — A3 (ETAPA 15-E) · RN-09, CA-09.
 *
 * «A TODAS las terminales y videoporteros con biblioteca de rostros» es una
 * consulta al catálogo por CAPACIDAD (ADR-019) y una llamada a
 * `SincronizarPlantilla` por cada uno. No se reimplementa nada de aquel caso
 * de uso: es él quien vuelve a preguntar por el consentimiento en el instante
 * de empujar y quien registra la sincronización; esto sólo lo repite por
 * equipo y cuenta.
 *
 * Dos clases de fallo, tratadas distinto a propósito:
 *   · Una PROHIBICIÓN (RN-09: sin consentimiento vigente, plantilla suprimida)
 *     no es «de esta terminal»: vale para todas y se devuelve como fallo.
 *   · Un equipo que no responde es un hecho de ESA terminal: se anota, se
 *     sigue con la siguiente y el resumen dice cuál falló. La plantilla queda
 *     donde sí llegó; la consola puede volver a lanzar la total y el
 *     `ON CONFLICT` de la fila de sincronización no duplica nada.
 */
export interface ResultadoPorTerminal {
  readonly dispositivoId: string;
  readonly nombre: string;
  readonly sincronizada: boolean;
  readonly detalle: string;
}

export interface ResultadoDeSincronizacionTotal {
  readonly plantillaId: string;
  readonly terminales: number;
  readonly sincronizadas: number;
  readonly fallidas: number;
  readonly porTerminal: readonly ResultadoPorTerminal[];
}

const noEncontrado = (que: string): ErrorDominio =>
  errorDominio('ENTIDAD_NO_ENCONTRADA', `${que} no existe en esta copropiedad`, 'RN-15');

export class SincronizarPlantillaEnTerminales {
  constructor(
    private readonly plantillas: RepositorioPlantillas,
    private readonly catalogo: CatalogoDeTerminales,
    private readonly sincronizar: SincronizarPlantilla,
    private readonly bitacora: Bitacora,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    entrada: { readonly plantillaId: string },
  ): Promise<Resultado<ResultadoDeSincronizacionTotal, ErrorDominio>> {
    const copropiedadId = ctx.copropiedadId;
    if (copropiedadId === null) return fallo(noEncontrado('La copropiedad'));

    const plantilla = await this.plantillas.porId(copropiedadId, entrada.plantillaId);
    if (plantilla === null) return fallo(noEncontrado('La plantilla'));

    const terminales = await this.catalogo.conBibliotecaDeRostros(ctx, copropiedadId);
    if (terminales.length === 0) {
      this.bitacora.registrar('aviso', 'sincronización total sin destino', {
        copropiedadId,
        plantillaId: plantilla.id,
        motivo:
          'ningún equipo activo declara biblioteca de rostros: sondee la terminal desde su ficha',
      });
    }

    const porTerminal: ResultadoPorTerminal[] = [];
    for (const terminal of terminales) {
      const r = await this.sincronizar.ejecutar(ctx, {
        plantillaId: plantilla.id,
        dispositivoId: terminal.dispositivoId,
      });
      if (esFallo(r)) {
        // Una prohibición de RN-09 no depende del equipo: se devuelve entera.
        if (r.error.codigo !== 'CONFLICTO_DE_CONCURRENCIA') return r;
        porTerminal.push({ ...terminal, sincronizada: false, detalle: r.error.detalle });
        this.bitacora.registrar('aviso', 'una terminal no aceptó la plantilla', {
          copropiedadId,
          plantillaId: plantilla.id,
          dispositivoId: terminal.dispositivoId,
          detalle: r.error.detalle,
        });
        continue;
      }
      porTerminal.push({
        ...terminal,
        sincronizada: true,
        detalle: 'el proveedor confirmó la plantilla en la biblioteca del equipo',
      });
    }

    const sincronizadas = porTerminal.filter((t) => t.sincronizada).length;
    return exito({
      plantillaId: plantilla.id,
      terminales: terminales.length,
      sincronizadas,
      fallidas: porTerminal.length - sincronizadas,
      porTerminal,
    });
  }
}

/**
 * `PropagarConsentimientoAceptado` — lo que ocurre justo después de que el
 * TITULAR acepte: cada plantilla que esperaba ese consentimiento sale hacia
 * todas las terminales.
 *
 * **No falla nunca hacia fuera.** La aceptación es un acto del titular que ya
 * quedó escrito; que una terminal esté apagada no lo deshace ni lo esconde.
 * Lo que no llegó queda en bitácora y se relanza desde la consola.
 */
export class PropagarConsentimientoAceptado {
  constructor(
    private readonly plantillas: RepositorioPlantillas,
    private readonly enTerminales: SincronizarPlantillaEnTerminales,
    private readonly bitacora: Bitacora,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    entrada: { readonly consentimientoId: string },
  ): Promise<readonly ResultadoDeSincronizacionTotal[]> {
    const copropiedadId = ctx.copropiedadId;
    if (copropiedadId === null) return [];

    const resultados: ResultadoDeSincronizacionTotal[] = [];
    for (const p of await this.plantillas.deConsentimiento(
      copropiedadId,
      entrada.consentimientoId,
    )) {
      if (p.estado !== 'pendiente_sincronizacion') continue;
      try {
        const r = await this.enTerminales.ejecutar(ctx, { plantillaId: p.id });
        if (esFallo(r)) {
          this.bitacora.registrar('aviso', 'la plantilla aceptada no se pudo propagar', {
            copropiedadId,
            plantillaId: p.id,
            detalle: r.error.detalle,
          });
          continue;
        }
        resultados.push(r.valor);
      } catch (error) {
        this.bitacora.registrar('error', 'fallo al propagar la plantilla aceptada', {
          copropiedadId,
          plantillaId: p.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return resultados;
  }
}
