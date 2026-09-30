import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { ErrorApiDto } from '../../comun/respuestas';
import { ConsultarColaDeAtencion } from '../aplicacion/consultar-cola';
import {
  PREFERENCIAS_DE_ATENCION,
  mezclarPreferencias,
} from '../aplicacion/preferencias-de-atencion';
import type { RepositorioDePreferenciasDeAtencion } from '../aplicacion/preferencias-de-atencion';
import { ColaDeAtencionDto, PreferenciasDeAtencionDto } from './dtos';

/**
 * G1 · G2 (15-N) · LA COLA DE ATENCIÓN Y SUS PREFERENCIAS
 *
 * Controlador aparte del de guardia por SRP (§2.3): aquél carga las órdenes,
 * el intercom, el audio y la emergencia; éste, qué necesita a una persona
 * (P-22) y cómo quiere la copropiedad que se le avise. La ruta de la cola no
 * cambia (`…/guardia/cola`): la consola y la suite de aislamiento la
 * encuentran donde siempre.
 *
 * SIN `@SoloGuardiaRemota`, como desde la 15-M: la pantalla de Portería vive
 * de esta cola.
 */
@ApiTags('guardia')
@ApiBearerAuth()
@Controller('copropiedades/:id/guardia')
export class AtencionController {
  constructor(
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
    @Inject(ConsultarColaDeAtencion) private readonly cola: ConsultarColaDeAtencion,
    @Inject(PREFERENCIAS_DE_ATENCION)
    private readonly preferencias: RepositorioDePreferenciasDeAtencion,
  ) {}

  /**
   * HU-25 · CU-03 · la cola, ordenada por ESPERA y no por recencia, con SÓLO
   * lo que necesita a una persona y llegó en vivo (P-22). La espera se calcula
   * en cada consulta: guardarla la haría envejecer.
   */
  @Get('cola')
  @Roles('operador_central', 'portero', 'administrador', 'superadministrador')
  @ApiOperation({ summary: 'Cola de atención: lo que necesita a una persona (CU-03, P-22)' })
  @ApiOkResponse({ type: ColaDeAtencionDto })
  @ApiNotFoundResponse({ type: ErrorApiDto, description: 'Copropiedad fuera del alcance' })
  async consultar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<ColaDeAtencionDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'guardia/cola');
    const r = await this.cola.ejecutar(copropiedadId);
    return {
      cola: r.cola.map((e) => ({
        eventoId: e.id,
        origen: e.origen,
        disparador: e.disparador,
        titulo: e.titulo,
        ocurridoEn: e.llegoEn.toISOString(),
        motivo: e.motivo,
        resultado: e.resultado,
        dispositivoId: e.dispositivoId,
        viviendaId: e.viviendaId,
        placaDetectada: e.placaDetectada,
        conEvidencia: e.conEvidencia,
        esperaSegundos: e.esperaSegundos,
        urgencia: e.urgencia,
        demorado: e.demorado,
      })),
      total: r.total,
      criticos: r.criticos,
      esperaMaxima: r.esperaMaxima,
      vigenciaSegundos: r.vigenciaSegundos,
      preferencias: r.preferencias,
    };
  }

  /** G2 (15-N) · qué abre sola la Atención y qué suena, por disparador. */
  @Get('preferencias')
  @Roles('operador_central', 'portero', 'administrador', 'superadministrador')
  @ApiOperation({ summary: 'Preferencias de atención de la copropiedad (G2)' })
  @ApiOkResponse({ type: PreferenciasDeAtencionDto })
  @ApiNotFoundResponse({ type: ErrorApiDto, description: 'Copropiedad fuera del alcance' })
  async leer(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<PreferenciasDeAtencionDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'guardia/preferencias');
    return mezclarPreferencias(await this.preferencias.leer(copropiedadId));
  }

  /** G2 (15-N) · las cambia quien administra la copropiedad; todas a la vez. */
  @Put('preferencias')
  @HttpCode(200)
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Cambia las preferencias de atención (G2)' })
  @ApiOkResponse({ type: PreferenciasDeAtencionDto })
  @ApiNotFoundResponse({ type: ErrorApiDto, description: 'Copropiedad fuera del alcance' })
  async guardar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Body() dto: PreferenciasDeAtencionDto,
  ): Promise<PreferenciasDeAtencionDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'guardia/preferencias');
    const limpias = mezclarPreferencias(dto);
    await this.preferencias.guardar(copropiedadId, limpias, ctx.usuarioId);
    return limpias;
  }
}
