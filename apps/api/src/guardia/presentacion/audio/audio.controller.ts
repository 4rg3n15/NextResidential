import {
  ConflictException,
  Controller,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { SoloGuardiaRemota } from '../../../plataforma';
import { Aislamiento } from '../../../multiempresa/aislamiento';
import { ALCANCE_DE_EQUIPOS } from '../../../equipos';
import type { AlcanceDeEquipos } from '../../../equipos';
import { Roles } from '../../../comun/decoradores';
import { Contexto } from '../../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../../autenticacion';
import { ErrorApiDto } from '../../../comun/respuestas';
import { CONFIGURACION } from '../../../configuracion/configuracion.module';
import type { Configuracion } from '../../../configuracion/esquema';
import { CANAL_DE_INTERCOM } from '../../aplicacion/puertos';
import type { CanalDeIntercom } from '../../aplicacion/puertos';
import { BilleteDeAudioDto } from '../dtos';
import { BilletesDeAudio, VIGENCIA_DEL_BILLETE_S } from './billetes-de-audio';
import { RUTA_DEL_AUDIO } from './puerta-de-audio';

/**
 * 15-P · P2 · EL BILLETE DEL AUDIO. Es la ÚNICA puerta al WebSocket, y es una
 * ruta HTTP corriente bajo `copropiedades/:id`: pasa por sesión, rol, guardia
 * remota, alcance de la copropiedad y del equipo, y entra sola en el barrido de
 * aislamiento. Sólo se emite a quien TIENE la palabra con el canal del equipo
 * abierto. Límite propio: 30 por minuto y por IP (§2.7.5).
 */
@ApiTags('guardia')
@ApiBearerAuth()
@Controller('copropiedades/:id/guardia/intercom')
export class AudioController {
  constructor(
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
    @Inject(ALCANCE_DE_EQUIPOS) private readonly equiposDeLaRuta: AlcanceDeEquipos,
    @Inject(CANAL_DE_INTERCOM) private readonly intercom: CanalDeIntercom,
    @Inject(BilletesDeAudio) private readonly billetes: BilletesDeAudio,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  @SoloGuardiaRemota()
  @Post(':dispositivoId/billete')
  @HttpCode(201)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Roles('operador_central', 'portero', 'administrador', 'superadministrador')
  @ApiOperation({
    summary: 'Billete de un solo uso para abrir el WebSocket de audio (ADR-01, 15-P)',
  })
  @ApiCreatedResponse({ type: BilleteDeAudioDto })
  @ApiConflictResponse({ type: ErrorApiDto, description: 'Sin la palabra o transporte HTTP' })
  @ApiNotFoundResponse({ type: ErrorApiDto, description: 'Copropiedad o equipo fuera del alcance' })
  async billete(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('dispositivoId', ParseUUIDPipe) dispositivoId: string,
    @Req() peticion: Request,
  ): Promise<BilleteDeAudioDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'guardia/intercom/billete');
    await this.equiposDeLaRuta.exigir(
      ctx,
      copropiedadId,
      dispositivoId,
      'guardia/intercom/billete',
    );
    if (this.configuracion.GUARDIA_AUDIO_TRANSPORTE !== 'websocket') {
      throw new ConflictException(
        'El audio de esta API va por HTTP (GUARDIA_AUDIO_TRANSPORTE=http)',
      );
    }
    const estado = await this.intercom.estado(copropiedadId, dispositivoId, ctx.usuarioId);
    if (estado.estado !== 'abierta' || estado.transporte !== 'equipo') {
      throw new ConflictException(
        estado.detalleTransporte ?? 'Sin la palabra: pida el canal antes de abrir el audio',
      );
    }
    const ip = typeof peticion.ip === 'string' && peticion.ip !== '' ? peticion.ip : null;
    return {
      billete: this.billetes.emitir({
        copropiedadId,
        dispositivoId,
        operadorId: ctx.usuarioId,
        ip,
      }),
      caducaEnSegundos: VIGENCIA_DEL_BILLETE_S,
      ruta: RUTA_DEL_AUDIO,
    };
  }
}
