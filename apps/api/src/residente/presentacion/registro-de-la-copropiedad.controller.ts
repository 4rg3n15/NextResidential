import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { RegistroDeResidentesDelSuperadmin } from '../aplicacion/titulares-y-registro';
import {
  EstadoDelRegistroDto,
  ReanudacionDelRegistroDto,
  RegistroReanudadoDto,
} from './dtos-titulares';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * «CREAR CUENTA» DE UNA COPROPIEDAD, VISTO POR EL SUPERADMINISTRADOR · 15-W (§7)
 *
 * Treinta códigos fallidos en una hora suspenden su registro una hora. Aquí se
 * ve (Configuración muestra «Registro suspendido por intentos») y se reanuda
 * antes, con motivo: la reanudación queda en la bitácora y en la auditoría.
 * ═════════════════════════════════════════════════════════════════════════════
 */
@ApiTags('residentes')
@ApiBearerAuth()
@Roles('superadministrador')
@Controller('copropiedades/:id/residentes/registro')
export class RegistroDeLaCopropiedadController {
  constructor(
    @Inject(RegistroDeResidentesDelSuperadmin)
    private readonly registro: RegistroDeResidentesDelSuperadmin,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get()
  @ApiOperation({ summary: '¿Está suspendido «Crear cuenta» por intentos? (§7)' })
  @ApiOkResponse({ type: EstadoDelRegistroDto })
  async estado(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EstadoDelRegistroDto> {
    await this.aislamiento.exigirAlcance(ctx, id, 'residentes/registro');
    const e = await this.registro.estado(id);
    return { ...e, hasta: e.hasta === null ? null : e.hasta.toISOString() };
  }

  @Post('reanudacion')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Reanuda «Crear cuenta» antes de la hora, con motivo (§7)' })
  @ApiOkResponse({ type: RegistroReanudadoDto })
  async reanudar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReanudacionDelRegistroDto,
  ): Promise<RegistroReanudadoDto> {
    const destino = await this.aislamiento.exigirAlcance(ctx, id, 'residentes/registro');
    if (!(await this.registro.reanudar(destino, id, dto.motivo.trim()))) {
      throw new ConflictException('El registro no está suspendido');
    }
    return { reanudado: true };
  }
}
