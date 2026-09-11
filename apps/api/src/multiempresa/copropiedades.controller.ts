import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Aislamiento } from './aislamiento';
import { AlcanceDelLlamante, PermiteServicio, Roles } from '../comun/decoradores';
import { Contexto } from '../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../autenticacion';
import {
  AlcanceDeCopropiedadesDto,
  ConfiguracionDeCopropiedadDto,
  ConfiguracionRechazadaDto,
  CopropiedadDto,
  IngestaAceptadaDto,
} from './respuestas';
import { CLAVES_EDITABLES, puedeEditar, validarCambios } from './configuracion';
import type { CambiosDeConfiguracion, ConfiguracionDeCopropiedad } from './configuracion';
import { REPOSITORIO_COPROPIEDADES } from './repositorio-copropiedades';
import type { RepositorioCopropiedades } from './repositorio-copropiedades';
import { ErrorApiDto } from '../comun/respuestas';

export class IngestaDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  copropiedadId!: string;
}

/**
 * Cuerpo del PATCH. **Valida forma, no verdad** (§2.7.3): que `umbralLatido`
 * sea un entero entre 1 y 60 lo dice aquí; que ESTE rol pueda cambiarlo lo dice
 * `validarCambios`, que es donde vive la regla de negocio. Con
 * `forbidNonWhitelisted` global, un campo no declarado —`nit`, `estado`— se
 * rechaza con 400 antes de llegar al controlador.
 */
export class CambiosDeConfiguracionDto {
  @ApiProperty({ required: false, example: 'Urbanización Mira' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nombre?: string;

  @ApiProperty({ required: false, example: 'America/Bogota' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  zonaHoraria?: string;

  @ApiProperty({ required: false, example: 0.85 })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(1)
  umbralConfianzaPlaca?: number;

  @ApiProperty({ required: false, enum: ['denegar', 'escalar_portero'] })
  @IsOptional()
  @IsEnum(['denegar', 'escalar_portero'])
  politicaContingenciaEdge?: 'denegar' | 'escalar_portero';

  @ApiProperty({ required: false, example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  umbralLatidoMinutos?: number;
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

  /**
   * Configuración de la copropiedad activa.
   *
   * Exclusiva de los dos roles administrativos. Un recurso fuera del alcance
   * responde **404 y no 403**: un 403 confirmaría que el identificador existe,
   * y esa confirmación ya permite enumerar copropiedades ajenas contando
   * respuestas.
   */
  @Get(':id/configuracion')
  @Roles('superadministrador', 'administrador')
  @ApiOperation({ summary: 'Lee la configuración de una copropiedad del alcance' })
  @ApiOkResponse({ type: ConfiguracionDeCopropiedadDto })
  @ApiNotFoundResponse({ type: ErrorApiDto, description: 'Fuera del alcance del token' })
  async leerConfiguracion(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConfiguracionDeCopropiedadDto> {
    const configuracion = await this.catalogo.leerConfiguracion(ctx, id);
    if (configuracion === null) throw new NotFoundException('copropiedad no encontrada');
    return this.aDto(ctx, configuracion);
  }

  /**
   * Cambia lo que este rol puede cambiar, **y deja constancia**.
   *
   * La comprobación de permiso por ajuste vive en `validarCambios` y no aquí: la
   * misma regla la consulta la consola para deshabilitar el campo, así que
   * duplicarla en un `if` del controlador garantizaría que las dos se
   * separaran. Lo que el controlador hace es traducirla a 422 con TODOS los
   * motivos, que es lo que un formulario necesita.
   */
  @Patch(':id/configuracion')
  @HttpCode(200)
  @Roles('superadministrador', 'administrador')
  @ApiOperation({ summary: 'Cambia la configuración editable y lo anota en auditoria_seguridad' })
  @ApiOkResponse({ type: ConfiguracionDeCopropiedadDto })
  @ApiNotFoundResponse({ type: ErrorApiDto, description: 'Fuera del alcance del token' })
  @ApiUnprocessableEntityResponse({
    type: ConfiguracionRechazadaDto,
    description: 'Ajuste no editable por este rol, o valor fuera de los límites de negocio',
  })
  async cambiarConfiguracion(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CambiosDeConfiguracionDto,
  ): Promise<ConfiguracionDeCopropiedadDto> {
    const rechazos = validarCambios(ctx.rol, { ...dto });
    if (rechazos.length > 0) {
      throw new UnprocessableEntityException({ codigo: 422, rechazos: [...rechazos] });
    }
    const guardada = await this.catalogo.guardarConfiguracion(
      ctx,
      id,
      dto as CambiosDeConfiguracion,
    );
    if (guardada === null) throw new NotFoundException('copropiedad no encontrada');
    return this.aDto(ctx, guardada);
  }

  private aDto(
    ctx: ContextoTenant,
    configuracion: ConfiguracionDeCopropiedad,
  ): ConfiguracionDeCopropiedadDto {
    return {
      ...configuracion,
      editables: CLAVES_EDITABLES.filter((c) => puedeEditar(ctx.rol, c)),
    };
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
