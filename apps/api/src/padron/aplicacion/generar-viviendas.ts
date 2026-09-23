import { agruparParaVistaPrevia, errorDominio, exito, fallo, generarPlan } from '@ncr/domain-core';
import type {
  ErrorDominio,
  GrupoProyectado,
  PlanDeGeneracion,
  Resultado,
  ViviendaProyectada,
} from '@ncr/domain-core';
import type { RepositorioPadron } from './puertos';
import type { ContextoTenant } from '../../autenticacion';

/**
 * Generar el padrón de una copropiedad: HU-01, y la corrección del alta que
 * obligaba a repetir torre y dirección en cada una de 300 unidades.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOS OPERACIONES, UNA SOLA VERDAD
 *
 * `previsualizar` y `confirmar` llaman a `generarPlan`, la misma función pura
 * del dominio. Lo que el usuario aprueba y lo que se crea salen del mismo
 * cálculo; si cada una tuviera el suyo, el día que discrepen el usuario aprueba
 * una cosa y recibe otra, y lo descubre con 300 viviendas dentro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DÓNDE ESTÁ LA GARANTÍA DE UNICIDAD, Y DÓNDE NO
 *
 * La vista previa **lee** para informar: enseña qué identificadores del plan ya
 * existen. Esa lectura puede quedarse obsoleta en el minuto que pasa hasta la
 * confirmación, así que no garantiza nada. La garantía es el índice único
 * parcial de la base (ADR-04), que decide en la misma sentencia que inserta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO HAY CLAVE DE IDEMPOTENCIA
 *
 * El diseño aprobado la proponía. Al construirlo resultó innecesaria y, de
 * hecho, más débil que lo que ya hay: un segundo envío del mismo plan choca
 * contra las viviendas que el primero acaba de crear y se rechaza entero,
 * nombrándolas. Un doble clic no crea 600 viviendas — recibe «estas 300 ya
 * existen», que además es la verdad. Una clave de idempotencia habría añadido
 * almacenamiento para contestar peor.
 */

export interface VistaPreviaDeGeneracion {
  readonly total: number;
  readonly grupos: readonly GrupoProyectado[];
  /** Las que ya existen activas. Con una sola, la confirmación se negará. */
  readonly colisiones: readonly ViviendaProyectada[];
}

export interface GeneracionAplicada {
  readonly creadas: number;
}

const excepcionesDe = (plan: PlanDeGeneracion): readonly string[] =>
  (plan.excepciones ?? []).map((e) => e.agrupacion);

/**
 * Resumen del plan para el rastro de auditoría. Corto y legible por un humano.
 *
 * B.1 · con un solo plan, el resumen dice lo que de verdad se preguntó: cuántas
 * viviendas, y si hay denominador, cuántas por cada uno. Antes había tres
 * redacciones —una por tipo— y la de apartamentos ni siquiera nombraba la
 * cantidad, que es el dato que alguien busca cuando lee esta auditoría.
 */
export const resumenDelPlan = (plan: PlanDeGeneracion, total: number): string => {
  const denominador =
    plan.agrupaciones === 0
      ? 'sin agrupación'
      : `${String(plan.agrupaciones)} agrupaciones (${plan.estilo}) de ${String(plan.cantidad)}`;
  const numeracion =
    (plan.porPiso ?? 0) > 0
      ? `numeración por piso (${String(plan.porPiso)} por piso)`
      : plan.agrupaciones > 0 && (plan.reiniciarNumeracion ?? false)
        ? 'numeración reiniciada por agrupación'
        : 'numeración correlativa';
  const excepciones = (plan.excepciones ?? []).length;
  return (
    `${denominador}, ${numeracion}` +
    (excepciones === 0 ? '' : `, ${String(excepciones)} excepciones`) +
    ` → ${String(total)} viviendas`
  );
};

const listar = (colisiones: readonly ViviendaProyectada[]): string =>
  colisiones
    .slice(0, 10)
    .map((c) => (c.agrupacion === null ? c.identificador : `${c.agrupacion} · ${c.identificador}`))
    .join(', ') + (colisiones.length > 10 ? `, … (${String(colisiones.length)} en total)` : '');

export class GenerarViviendas {
  constructor(private readonly repo: RepositorioPadron) {}

  async previsualizar(
    ctx: ContextoTenant,
    plan: PlanDeGeneracion,
  ): Promise<Resultado<VistaPreviaDeGeneracion, ErrorDominio>> {
    if (!ctx.copropiedadId) {
      return fallo(errorDominio('OPERACION_NO_PERMITIDA', 'La identidad no tiene copropiedad'));
    }
    const proyectadas = generarPlan(plan);
    if (!proyectadas.ok) return proyectadas;

    const colisiones = await this.repo.viviendasExistentes(ctx.copropiedadId, proyectadas.valor);
    return exito({
      total: proyectadas.valor.length,
      grupos: agruparParaVistaPrevia(proyectadas.valor, excepcionesDe(plan)),
      colisiones,
    });
  }

  /**
   * `totalEsperado` es el número que la vista previa enseñó. Si el servidor
   * recalcula el plan y le sale otro, no crea nada.
   *
   * Cierra la ventana en que el formulario cambió después de previsualizar —una
   * torre añadida, un piso corregido— sin obligar al usuario a teclear una
   * confirmación que acabaría escribiendo sin leer.
   */
  async confirmar(
    ctx: ContextoTenant,
    plan: PlanDeGeneracion,
    totalEsperado: number,
  ): Promise<Resultado<GeneracionAplicada, ErrorDominio>> {
    if (!ctx.copropiedadId) {
      return fallo(errorDominio('OPERACION_NO_PERMITIDA', 'La identidad no tiene copropiedad'));
    }
    const proyectadas = generarPlan(plan);
    if (!proyectadas.ok) return proyectadas;

    if (proyectadas.valor.length !== totalEsperado) {
      return fallo(
        errorDominio(
          'CONFLICTO_DE_CONCURRENCIA',
          `El plan genera ${String(proyectadas.valor.length)} viviendas y usted aprobó ` +
            `${String(totalEsperado)}. Vuelva a previsualizar antes de confirmar`,
          'HU-01',
        ),
      );
    }

    const resultado = await this.repo.generarViviendas({
      copropiedadId: ctx.copropiedadId,
      viviendas: proyectadas.valor,
      actorId: ctx.usuarioId,
      resumenDelPlan: resumenDelPlan(plan, proyectadas.valor.length),
    });

    if (resultado.colisiones.length > 0) {
      // Ni una sola se creó: el repositorio revierte la transacción entera. Se
      // nombran todas —no la primera— porque quien corrige un plan necesita
      // verlas de una vez, no descubrirlas de una en una.
      return fallo(
        errorDominio(
          'CONFLICTO_DE_CONCURRENCIA',
          `No se creó ninguna vivienda: ya existen ${listar(resultado.colisiones)}`,
          'ADR-04',
        ),
      );
    }
    return exito({ creadas: resultado.creadas });
  }
}
