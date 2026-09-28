import { Body, Controller, Get, HttpCode, Inject, Put, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import type { Request } from 'express';
import type { ContextoTenant } from '../../autenticacion';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import { Roles, SinRecursoDeTenant } from '../../comun/decoradores';
import { ModoPruebas } from '../aplicacion/modo-pruebas';

export class ModoPruebasDto {
  @ApiProperty({
    description:
      'Con el modo pruebas activo, las restricciones de porteros se evalúan y se registran sin ' +
      'bloquear, no hay bloqueo por intentos fallidos y el límite de peticiones es más alto',
  })
  @IsBoolean()
  activo!: boolean;
}

/**
 * H5 (15-L) · el interruptor del modo pruebas. Lo LEE todo el que tiene sesión
 * —la consola pinta la franja para todos—; lo CAMBIA sólo el
 * superadministrador, y cada cambio queda en `auditoria_seguridad`. Surte
 * efecto sin reiniciar.
 */
@ApiTags('plataforma')
@Controller('plataforma')
@SinRecursoDeTenant()
export class PlataformaController {
  constructor(@Inject(ModoPruebas) private readonly modo: ModoPruebas) {}

  @Get('modo-pruebas')
  @Roles('superadministrador', 'administrador', 'operador_central', 'portero', 'residente')
  @ApiOperation({ summary: 'Si el modo pruebas está activo' })
  @ApiOkResponse({ type: ModoPruebasDto })
  async leer(): Promise<ModoPruebasDto> {
    return { activo: await this.modo.activo() };
  }

  @Put('modo-pruebas')
  @HttpCode(200)
  @Roles('superadministrador')
  @ApiOperation({ summary: 'Activa o desactiva el modo pruebas (sólo superadministrador)' })
  @ApiOkResponse({ type: ModoPruebasDto })
  async cambiar(
    @Contexto() ctx: ContextoTenant,
    @Body() dto: ModoPruebasDto,
    @Req() peticion: Request,
  ): Promise<ModoPruebasDto> {
    await this.modo.cambiar(dto.activo, ctx.usuarioId, peticion.ip ?? null);
    return { activo: dto.activo };
  }
}
