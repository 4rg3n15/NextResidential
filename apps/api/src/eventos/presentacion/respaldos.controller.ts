import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { ConsultarRespaldos } from '../aplicacion/respaldo/consultar-respaldos';
import { RespaldarEventos } from '../aplicacion/respaldo/respaldar-eventos';

const ESTADOS = ['enviado', 'error', 'sin_configurar', 'pendiente'];

export class RespaldoDiarioDto {
  @ApiProperty({ type: String, description: 'Día de la copropiedad, AAAA-MM-DD (hora de Bogotá)' })
  fecha!: string;
  @ApiProperty({ type: Number }) numeroDeEventos!: number;
  @ApiProperty({ type: Number }) permitidos!: number;
  @ApiProperty({ type: Number }) negados!: number;
  @ApiProperty({ type: String, description: 'Huella SHA-256 del fichero, en hexadecimal' })
  sha256!: string;
  @ApiProperty({ type: Number }) tamanoBytes!: number;
  @ApiProperty({ type: String, format: 'date-time' }) generadoEn!: string;
  @ApiProperty({ type: String, enum: ESTADOS }) estadoDelEnvio!: string;
  @ApiProperty({ type: Number, description: 'Superadministradores a los que llegó' })
  enviadosA!: number;
  @ApiProperty({ type: String, nullable: true, description: 'Último fallo, sin direcciones' })
  ultimoError!: string | null;
}

export class DescargaDeRespaldoDto {
  @ApiProperty({ type: String, description: 'URL firmada del bucket privado (RN-21)' })
  url!: string;
  @ApiProperty({ type: Number }) segundosDeVida!: number;
}

export class ParteDelRespaldoDto {
  @ApiProperty({ type: Number }) generados!: number;
  @ApiProperty({ type: Number }) fallidosAlGenerar!: number;
  @ApiProperty({ type: Number }) enviados!: number;
  @ApiProperty({ type: Number }) fallidosAlEnviar!: number;
  @ApiProperty({ type: Number }) sinConfigurar!: number;
}

const FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * D-147 · LOS RESPALDOS DIARIOS EN INFORMES
 *
 * Sólo superadministración y la administración de SU copropiedad (el
 * aislamiento lo exige antes de tocar nada; la RLS de la 0061 es la segunda
 * barrera). La descarga es una URL firmada de vida corta, firmada al pedirla.
 *
 * La ejecución a mano es sólo del superadministrador y con límite estricto:
 * es la prueba en sitio («ejecutar el trabajo a mano») y la recuperación tras
 * configurar el SMTP, no una forma de mandar correos a voluntad. Es idempotente
 * como el trabajo programado.
 */
@ApiTags('informes')
@ApiBearerAuth()
@Controller('copropiedades/:id/respaldos')
export class RespaldosController {
  constructor(
    @Inject(ConsultarRespaldos) private readonly consultar: ConsultarRespaldos,
    @Inject(RespaldarEventos) private readonly respaldar: RespaldarEventos,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get()
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Respaldos diarios de los eventos, del más reciente al más antiguo' })
  @ApiOkResponse({ type: [RespaldoDiarioDto] })
  async listar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<RespaldoDiarioDto[]> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'respaldos');
    return (await this.consultar.listar(copropiedadId)).map((r) => ({
      ...r,
      generadoEn: r.generadoEn.toISOString(),
    }));
  }

  @Get(':fecha/descarga')
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'URL firmada de vida corta para descargar el respaldo de un día' })
  @ApiOkResponse({ type: DescargaDeRespaldoDto })
  @ApiNotFoundResponse({ description: 'Ese día no tiene respaldo en esta copropiedad' })
  async descargar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Param('fecha') fecha: string,
  ): Promise<DescargaDeRespaldoDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'respaldos');
    if (!FECHA.test(fecha)) throw new BadRequestException('La fecha va como AAAA-MM-DD');
    const descarga = await this.consultar.descarga(copropiedadId, fecha);
    if (descarga === null) throw new NotFoundException('Ese día no tiene respaldo');
    return { ...descarga };
  }

  @Post('ejecucion')
  @HttpCode(200)
  @Roles('superadministrador')
  // 10/min, como las rutas sensibles de sitio: idempotente y sólo del superadministrador.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Ejecuta el respaldo de esta copropiedad a mano (idempotente; superadministración)',
  })
  @ApiOkResponse({ type: ParteDelRespaldoDto })
  async ejecutar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
  ): Promise<ParteDelRespaldoDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'respaldos');
    return { ...(await this.respaldar.ejecutar(copropiedadId, ctx.usuarioId)) };
  }
}
