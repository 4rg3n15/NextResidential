import { Controller, Get, Header, Inject, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { ErrorApiDto } from '../../comun/respuestas';
import { SERVIDORES_ICE } from '../aplicacion/servidores-ice';
import type { ServidoresIce } from '../aplicacion/servidores-ice';

export class ServidorIceDto {
  @ApiProperty({ type: [String], example: ['stun:stun.ejemplo.invalid:3478'] })
  urls!: string[];

  @ApiPropertyOptional({ description: 'Usuario EFÍMERO del TURN: `<expira>:<usuario>`' })
  username?: string;

  @ApiPropertyOptional({ description: 'Credencial EFÍMERA del TURN (caduca sola)' })
  credential?: string;
}

export class ServidoresIceDto {
  @ApiProperty({ type: [ServidorIceDto], description: 'Vacía sin STUN/TURN configurados' })
  iceServers!: ServidorIceDto[];

  @ApiProperty({ description: 'Vida de la credencial del TURN; pedir otra antes de que caduque' })
  ttlSegundos!: number;
}

/**
 * 15-Q2 · E2 · los STUN/TURN con los que la consola negocia el video de un
 * equipo cuyo go2rtc está en el conjunto. Misma ruta y mismos roles que el
 * WHEP: quien no puede ver el video no recibe credencial de TURN. Sin caché:
 * lo que sale es una credencial, aunque efímera.
 */
@ApiTags('guardia')
@ApiBearerAuth()
@Controller('copropiedades/:id/guardia/video')
export class IceController {
  constructor(
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
    @Inject(SERVIDORES_ICE) private readonly servidores: ServidoresIce,
  ) {}

  @Get('ice')
  @Header('Cache-Control', 'no-store')
  @Roles('operador_central', 'portero', 'administrador', 'superadministrador')
  @ApiOperation({
    summary:
      'Los servidores STUN/TURN para negociar la vista en vivo (TURN con credencial efímera)',
  })
  @ApiOkResponse({ type: ServidoresIceDto })
  @ApiNotFoundResponse({ type: ErrorApiDto, description: 'Copropiedad fuera del alcance' })
  async ice(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<ServidoresIceDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'guardia/video');
    const { iceServers, ttlSegundos } = this.servidores.para(ctx.usuarioId);
    return {
      iceServers: iceServers.map((s) => ({
        urls: [...s.urls],
        ...(s.username === undefined ? {} : { username: s.username }),
        ...(s.credential === undefined ? {} : { credential: s.credential }),
      })),
      ttlSegundos,
    };
  }
}
