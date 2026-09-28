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

/** A3 (15-L) · un equipo que no recibió la plantilla porque no puede tenerla. */
export interface EquipoOmitido {
  readonly dispositivoId: string;
  readonly nombre: string;
  readonly detalle: string;
}

export interface ResultadoDeSincronizacionTotal {
  readonly plantillaId: string;
  readonly terminales: number;
  readonly sincronizadas: number;
  readonly fallidas: number;
  readonly porTerminal: readonly ResultadoPorTerminal[];
  readonly omitidas: readonly EquipoOmitido[];
}

const POR_QUE_SE_OMITE = {
  no_admite: 'este equipo no admite rostros',
  sin_comprobar: 'aún no se sabe si admite rostros: use «Probar conexión» en su ficha',
} as const;

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
    // A3 (15-L) · lo que se omite se dice: en el resultado y en la bitácora.
    const omitidas: EquipoOmitido[] = (
      (await this.catalogo.sinBibliotecaDeRostros?.(ctx, copropiedadId)) ?? []
    ).map((e) => ({
      dispositivoId: e.dispositivoId,
      nombre: e.nombre,
      detalle: POR_QUE_SE_OMITE[e.motivo],
    }));
    for (const omitida of omitidas) {
      this.bitacora.registrar('info', 'equipo omitido en la sincronización de rostros', {
        copropiedadId,
        plantillaId: plantilla.id,
        dispositivoId: omitida.dispositivoId,
        motivo: omitida.detalle,
      });
    }
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
        // F3 (15-L) · queda escrito por equipo: la consola lo enseña y lo reintenta.
        await this.plantillas.registrarFallo(
          { copropiedadId, plantillaId: plantilla.id, dispositivoId: terminal.dispositivoId },
          r.error.detalle,
          ctx.usuarioId,
        );
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
      omitidas,
    });
  }
}
