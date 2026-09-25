import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Controller,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { ErrorApiDto } from '../../comun/respuestas';
import { MideKpi } from '../../observabilidad';
import { TIPO_SDP } from '../../comun/ruta-de-video';
import { NegociarVistaEnVivo } from '../aplicacion/vista-en-vivo';
import {
  PuenteDeVideoFallo,
  PuenteDeVideoNoConfigurado,
  SinOrigenDeVideo,
} from '../aplicacion/puertos';

/**
 * A5 (15-E) · VISTA EN VIVO POR WHEP, A TRAVÉS DE LA API.
 *
 * Controlador aparte del de guardia por SRP (§2.3): aquél ya carga la cola, las
 * órdenes, el intercom y el audio. Cuelga de `copropiedades/:id` por la misma
 * razón que todo lo demás —la suite de aislamiento lo recorre solo— y el orden
 * de las comprobaciones es deliberado: alcance (404 hacia fuera), cuerpo (400),
 * y sólo entonces puente y equipo. Un 503 por falta de puente ANTES del
 * alcance revelaría a un tercero que el recurso existe.
 *
 * El navegador manda su oferta SDP como `application/sdp` y recibe la
 * respuesta con el mismo tipo y `201`, que es lo que WHEP (RFC 9725) espera;
 * lo que hay detrás —qué puente, qué RTSP, qué credencial— no viaja en ninguna
 * dirección.
 */
@ApiTags('guardia')
@ApiBearerAuth()
@Controller('copropiedades/:id/guardia/video')
export class VideoController {
  constructor(
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
    @Inject(NegociarVistaEnVivo) private readonly negociar: NegociarVistaEnVivo,
  ) {}

  @Post(':dispositivoId/whep')
  @HttpCode(201)
  // RNF-01.4 · establecimiento de vídeo, < 2 s (CA-19, KPI-33). Mide la
  // negociación en la API; el primer cuadro lo mide la consola.
  @MideKpi('KPI-33')
  @Roles('operador_central', 'portero', 'administrador', 'superadministrador')
  @ApiOperation({
    summary: 'Negocia la vista en vivo del equipo (WHEP): oferta SDP dentro, respuesta SDP fuera',
  })
  @ApiConsumes(TIPO_SDP)
  @ApiProduces(TIPO_SDP)
  @ApiBody({ schema: { type: 'string' }, description: 'Oferta SDP del navegador (`v=0…`)' })
  @ApiCreatedResponse({ description: 'Respuesta SDP del puente', schema: { type: 'string' } })
  @ApiNotFoundResponse({ type: ErrorApiDto, description: 'Copropiedad fuera del alcance' })
  @ApiConflictResponse({ type: ErrorApiDto, description: 'El equipo no ofrece video' })
  @ApiServiceUnavailableResponse({
    type: ErrorApiDto,
    description: 'La vista en vivo no está configurada (GO2RTC_URL)',
  })
  async whep(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('dispositivoId', ParseUUIDPipe) dispositivoId: string,
    @Req() peticion: Request,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<string> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'guardia/video');
    const oferta: unknown = peticion.body;
    if (typeof oferta !== 'string' || !oferta.startsWith('v=0')) {
      throw new BadRequestException(`La oferta viaja como ${TIPO_SDP} y empieza por «v=0»`);
    }
    try {
      const vista = await this.negociar.ejecutar({
        copropiedadId,
        dispositivoId,
        operadorId: ctx.usuarioId,
        ofertaSdp: oferta,
      });
      respuesta.setHeader('Content-Type', TIPO_SDP);
      respuesta.setHeader('Cache-Control', 'no-store');
      respuesta.setHeader('X-Flujo-De-Video', vista.flujo);
      respuesta.setHeader('X-Latencia-Negociacion-Ms', String(vista.latenciaMs));
      return vista.respuestaSdp;
    } catch (error) {
      if (error instanceof PuenteDeVideoNoConfigurado)
        throw new ServiceUnavailableException(error.message);
      if (error instanceof SinOrigenDeVideo) throw new ConflictException(error.message);
      if (error instanceof PuenteDeVideoFallo) throw new BadGatewayException(error.message);
      throw error;
    }
  }
}
