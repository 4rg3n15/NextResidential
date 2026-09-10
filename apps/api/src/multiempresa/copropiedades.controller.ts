import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { Aislamiento } from './aislamiento';
import { PermiteServicio, Roles } from '../comun/decoradores';
import { Contexto } from '../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../autenticacion';
import { CopropiedadDto, IngestaAceptadaDto } from './respuestas';
import { ErrorApiDto } from '../comun/respuestas';

export class IngestaDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  copropiedadId!: string;
}

/**
 * La copropiedad es la frontera del tenant (RN-15), así que su lectura es el
 * recurso mínimo sobre el que la suite de aislamiento puede probar los DOS
 * caminos. El padrón y lo demás llegan en la ETAPA 04 y usarán exactamente
 * este mismo patrón: `exigirAlcance` antes de tocar nada.
 */
@ApiTags('multiempresa')
@ApiBearerAuth()
@Controller('copropiedades')
export class CopropiedadesController {
  constructor(@Inject(Aislamiento) private readonly aislamiento: Aislamiento) {}

  @Get(':id')
  @Roles('superadministrador', 'administrador', 'portero', 'operador_central', 'residente')
  @ApiOperation({ summary: 'Lee una copropiedad dentro del alcance del token' })
  @ApiOkResponse({ type: CopropiedadDto })
  @ApiNotFoundResponse({
    type: ErrorApiDto,
    description:
      '404 y no 403 a propósito: un 403 confirmaría que el identificador existe, y esa ' +
      'confirmación ya permite enumerar recursos ajenos contando respuestas.',
  })
  async leer(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CopropiedadDto> {
    await this.aislamiento.exigirAlcance(ctx, id, `copropiedades/${id}`);
    return { id, alcance: ctx.rol };
  }

  @Post('ingesta')
  @Roles('servicio', 'superadministrador')
  @PermiteServicio()
  @ApiOperation({ summary: 'Ruta de identidad de servicio: valida el tenant en la aplicación' })
  @ApiCreatedResponse({ type: IngestaAceptadaDto })
  @ApiForbiddenResponse({ type: ErrorApiDto, description: 'Copropiedad fuera del alcance' })
  async ingerir(
    @Contexto() ctx: ContextoTenant,
    @Body() dto: IngestaDto,
  ): Promise<IngestaAceptadaDto> {
    // La llave secreta OMITE la RLS: sin esta línea, el Edge podría escribir
    // en cualquier copropiedad. Es el segundo camino de §2.7.6.
    await this.aislamiento.exigirAlcanceDeServicio(ctx, dto.copropiedadId, 'copropiedades/ingesta');
    return { aceptado: true };
  }
}
