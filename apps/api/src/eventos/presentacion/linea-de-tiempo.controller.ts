import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { ErrorApiDto } from '../../comun/respuestas';
import { ConsultarLineaDeTiempo } from '../aplicacion/linea-de-tiempo';
import type { ElementoDeLineaDeTiempo } from '../aplicacion/linea-de-tiempo';

/**
 * B2 (15-L) · la consola de eventos pide UNA línea de tiempo: accesos y
 * eventos de equipo juntos, filtrables por equipo, tipo y fecha. Los mismos
 * roles que el historial de accesos (HU-32); el residente no.
 */
export class ConsultaLineaDeTiempoDto {
  @ApiProperty({ description: 'Inicio del rango, ISO-8601 con zona' }) @IsISO8601() desde!: string;
  @ApiProperty({ description: 'Fin del rango, EXCLUIDO' }) @IsISO8601() hasta!: string;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() dispositivoId?: string;

  @ApiPropertyOptional({
    description:
      '`acceso` para sólo accesos, o un tipo de evento de equipo (p. ej. `puerta_forzada`)',
  })
  @IsOptional()
  @Matches(/^[a-z_]{1,60}$/)
  tipo?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limite?: number;
}

export class CodigoDelEquipoDto {
  @ApiProperty() mayor!: number;
  @ApiProperty() menor!: number;
}

export class ElementoDeLineaDeTiempoDto {
  @ApiProperty({ enum: ['acceso', 'equipo', 'plataforma'] }) origen!:
    | 'acceso'
    | 'equipo'
    | 'plataforma';
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'date-time' }) ocurridoEn!: string;
  @ApiProperty({ format: 'uuid' }) dispositivoId!: string;
  @ApiProperty({ description: '`acceso` o el tipo normalizado del evento de equipo' })
  tipo!: string;
  @ApiProperty({ description: 'Lo que la consola enseña, en español' }) titulo!: string;
  @ApiProperty({ enum: ['permitido', 'negado'], nullable: true }) resultado!:
    | 'permitido'
    | 'negado'
    | null;
  @ApiProperty({ description: '`false` para lo que el equipo declaró histórico' }) enVivo!: boolean;
  @ApiProperty({ type: String, nullable: true }) eventoId!: string | null;
  @ApiProperty({ type: CodigoDelEquipoDto, nullable: true }) codigo!: CodigoDelEquipoDto | null;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'R2 (15-N) · con el reloj del equipo desviado, la hora que DIJO el equipo; `ocurridoEn` es ' +
      'entonces la de recepción de la plataforma',
  })
  horaDelEquipo!: string | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Segundos que el reloj del equipo iba por delante (negativo: atrasado)',
  })
  relojDesviadoSegundos!: number | null;
}

export class LineaDeTiempoDto {
  @ApiProperty({ type: [ElementoDeLineaDeTiempoDto] }) elementos!: ElementoDeLineaDeTiempoDto[];
}

@ApiTags('eventos')
@ApiBearerAuth()
@Controller('copropiedades/:id/eventos')
export class LineaDeTiempoController {
  constructor(
    @Inject(ConsultarLineaDeTiempo) private readonly consultar: ConsultarLineaDeTiempo,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get('linea-de-tiempo')
  @Roles('administrador', 'superadministrador', 'portero', 'operador_central')
  @ApiOperation({
    summary: 'Accesos y eventos de equipo en una sola línea de tiempo, con filtros (Bloque B)',
  })
  @ApiOkResponse({ type: LineaDeTiempoDto })
  @ApiNotFoundResponse({ type: ErrorApiDto, description: 'Copropiedad fuera del alcance' })
  async lineaDeTiempo(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Query() dto: ConsultaLineaDeTiempoDto,
  ): Promise<{ elementos: readonly ElementoDeLineaDeTiempo[] }> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'eventos/linea-de-tiempo');
    const r = await this.consultar.ejecutar({
      copropiedadId,
      desde: new Date(dto.desde),
      hasta: new Date(dto.hasta),
      dispositivoId: dto.dispositivoId ?? null,
      tipo: dto.tipo ?? null,
      limite: dto.limite ?? 200,
    });
    if (r.ok) return r.valor;
    throw new BadRequestException(r.error.detalle);
  }
}
