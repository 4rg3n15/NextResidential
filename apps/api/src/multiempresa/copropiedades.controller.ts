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
import { AlcanceDelLlamante, PermiteServicio, Roles } from '../comun/decoradores';
import { Contexto } from '../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../autenticacion';
import { AlcanceDeCopropiedadesDto, CopropiedadDto, IngestaAceptadaDto } from './respuestas';
import { REPOSITORIO_COPROPIEDADES } from './repositorio-copropiedades';
import type { RepositorioCopropiedades } from './repositorio-copropiedades';
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
  constructor(
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
    @Inject(REPOSITORIO_COPROPIEDADES) private readonly catalogo: RepositorioCopropiedades,
  ) {}

  /**
   * Enumera el alcance del token. **La ruta va ANTES que `:id`**: Express
   * resuelve por orden de declaración y `@Get(':id')` capturaría la cadena
   * «copropiedades» como identificador, devolviendo 400 del `ParseUUIDPipe`.
   *
   * Existe porque el superadministrador no pertenece a ninguna copropiedad —su
   * `copropiedad_id` es nulo por diseño— y sin enumerar no había forma de
   * ofrecerle elegir. La consola trataba ese nulo como «sin permiso» y dejaba
   * inutilizado al único rol capaz de administrarlo todo.
   */
  @Get()
  @Roles('superadministrador', 'administrador', 'portero', 'operador_central', 'residente')
  @AlcanceDelLlamante()
  @ApiOperation({ summary: 'Enumera las copropiedades que el token alcanza, y solo esas' })
  @ApiOkResponse({ type: AlcanceDeCopropiedadesDto })
  async listar(@Contexto() ctx: ContextoTenant): Promise<AlcanceDeCopropiedadesDto> {
    const copropiedades = await this.catalogo.listarParaElAlcance(ctx);
    return {
      copropiedades: [...copropiedades],
      alcanceGlobal: ctx.rol === 'superadministrador',
    };
  }

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
