import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { PerfilDeResidentePorSuperadmin } from '../aplicacion/perfil';
import { PerfilDto } from './dtos-hogar';
import { PerfilDelResidenteDto, ResultadoDePerfilDto } from './respuestas-hogar';

const SIN_ALTA = 'Residente no encontrado, o aún no completó su alta';

/**
 * G (15-L) · EL SUPERADMINISTRADOR VE Y EDITA EL PERFIL DE UN RESIDENTE: los
 * mismos campos que el residente edita en la app, con las mismas reglas, y el
 * rastro de quién cambió qué campos. Sólo cuentas de residente de ESTA
 * copropiedad: cualquier otra responde lo mismo que una inexistente.
 */
@ApiTags('residentes')
@ApiBearerAuth()
@Roles('superadministrador')
@Controller('copropiedades/:id/residentes/cuentas/:usuarioId/perfil')
export class PerfilDeResidentesController {
  constructor(
    @Inject(PerfilDeResidentePorSuperadmin)
    private readonly perfiles: PerfilDeResidentePorSuperadmin,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Perfil de un residente (datos personales y de contacto)' })
  @ApiOkResponse({ type: PerfilDelResidenteDto })
  async ver(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
  ): Promise<PerfilDelResidenteDto> {
    await this.aislamiento.exigirAlcance(ctx, id, 'residentes/perfil');
    const p = await this.perfiles.ver(id, usuarioId);
    if (p === null) throw new NotFoundException(SIN_ALTA);
    return { ...p };
  }

  @Put()
  @ApiOperation({ summary: 'Edita el perfil de un residente; queda en su bitácora con el autor' })
  @ApiOkResponse({ type: ResultadoDePerfilDto })
  async editar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @Body() dto: PerfilDto,
  ): Promise<ResultadoDePerfilDto> {
    await this.aislamiento.exigirAlcance(ctx, id, 'residentes/perfil');
    const r = await this.perfiles.editar(ctx, id, usuarioId, {
      ...dto,
      fechaNacimiento: dto.fechaNacimiento ?? null,
    });
    if (r.guardado) return { guardado: true, perfil: { ...r.perfil }, motivo: null, campos: [] };
    if ('campos' in r) {
      throw new BadRequestException({ mensaje: 'Revise los datos', campos: [...r.campos] });
    }
    if (r.motivo === 'SIN_VINCULO') throw new NotFoundException(SIN_ALTA);
    return { guardado: false, perfil: null, motivo: r.motivo, campos: [] };
  }
}
