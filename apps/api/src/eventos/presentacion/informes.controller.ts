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
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../comun/decoradores';
import { Contexto } from '../../comun/decoradores/contexto.decorator';
import type { ContextoTenant } from '../../autenticacion';
import { Aislamiento } from '../../multiempresa/aislamiento';
import { REPOSITORIO_EVENTOS } from '../aplicacion/puertos';
import type { RepositorioEventos } from '../aplicacion/puertos';
import { GenerarInforme } from '../aplicacion/informes';
import type { TipoDeInforme } from '../aplicacion/informes';

const TIPOS: readonly TipoDeInforme[] = [
  'accesos_por_periodo',
  'visitantes_frecuentes',
  'uso_de_zonas',
  'auditoria_de_sistema',
];

export class FilaDeInformeDto {
  @ApiProperty({ type: String, format: 'date-time' }) momento!: string;
  @ApiProperty({ type: String }) titular!: string;
  @ApiProperty({ type: String }) vivienda!: string;
  @ApiProperty({ type: String }) dispositivo!: string;
  @ApiProperty({ type: String, description: 'Placa, rostro, tarjeta… (columna MÉTODO del mockup)' })
  metodo!: string;
  @ApiProperty({ type: String, enum: ['permitido', 'negado'] }) resultado!: string;
  @ApiProperty({ type: String }) detalle!: string;
}

export class PuntoDeFrecuenciaDto {
  @ApiProperty({ type: String, description: 'Lunes de la semana ISO, YYYY-MM-DD' })
  semana!: string;
  @ApiProperty({ type: Number }) total!: number;
}

export class InformeDto {
  @ApiProperty({ type: String, enum: TIPOS as unknown as string[] }) tipo!: string;
  @ApiProperty({ type: String, format: 'date-time' }) desde!: string;
  @ApiProperty({ type: String, format: 'date-time' }) hasta!: string;
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: [FilaDeInformeDto] }) filas!: FilaDeInformeDto[];
  @ApiProperty({ type: [PuntoDeFrecuenciaDto] }) frecuencia!: PuntoDeFrecuenciaDto[];
  @ApiProperty({
    type: Boolean,
    description: 'Se alcanzó el tope de la vista previa; la exportación trae el conjunto completo.',
  })
  truncado!: boolean;
  @ApiProperty({
    type: [String],
    description:
      'Limitaciones reales del informe, para mostrarlas en pantalla en vez de fingirlas.',
  })
  notas!: string[];
}

/**
 * Informes y auditoría — HU-32, W-10.
 *
 * **La exportación NO vive aquí**: es `GET /copropiedades/:id/eventos/exportacion`,
 * que la ETAPA 06 construyó con sus tres formatos. Duplicarla habría creado un
 * segundo generador de CSV que se desincroniza del primero en cuanto alguien
 * añada una columna. Esta ruta sirve la VISTA PREVIA y el gráfico.
 */
@ApiTags('informes')
@ApiBearerAuth()
@Controller('copropiedades/:id/informes')
export class InformesController {
  constructor(
    @Inject(REPOSITORIO_EVENTOS) private readonly repositorio: RepositorioEventos,
    @Inject(Aislamiento) private readonly aislamiento: Aislamiento,
  ) {}

  @Get()
  // «Auditoría de Sistema» es exclusiva de administración, como señaló el
  // análisis del mockup. Los cuatro tipos comparten ruta, así que la
  // restricción se aplica al conjunto: un portero no entra aquí.
  @Roles('administrador', 'superadministrador')
  @ApiOperation({ summary: 'Vista previa y frecuencia semanal de los cuatro informes (HU-32)' })
  @ApiQuery({ name: 'tipo', required: false, enum: TIPOS as unknown as string[] })
  @ApiQuery({ name: 'desde', required: true, type: String })
  @ApiQuery({ name: 'hasta', required: true, type: String })
  @ApiQuery({ name: 'viviendaId', required: false, type: String })
  @ApiQuery({ name: 'dispositivoId', required: false, type: String })
  @ApiOkResponse({ type: InformeDto })
  async generar(
    @Contexto() ctx: ContextoTenant,
    @Param('id', ParseUUIDPipe) copropiedadId: string,
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
    @Query('tipo') tipo?: string,
    @Query('viviendaId') viviendaId?: string,
    @Query('dispositivoId') dispositivoId?: string,
  ): Promise<InformeDto> {
    await this.aislamiento.exigirAlcance(ctx, copropiedadId, 'informes');

    const inicio = new Date(desde);
    const fin = new Date(hasta);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
      throw new BadRequestException('«desde» y «hasta» deben ser fechas ISO 8601');
    }
    const elegido = TIPOS.find((t) => t === tipo) ?? 'accesos_por_periodo';

    const r = await new GenerarInforme(this.repositorio).ejecutar({
      copropiedadId,
      tipo: elegido,
      desde: inicio,
      hasta: fin,
      viviendaId: viviendaId ?? null,
      dispositivoId: dispositivoId ?? null,
    });
    // El rango máximo y el tamaño de página los impone `FiltroDeEventos`, en el
    // dominio: un 400 aquí traduce esa decisión, no la toma.
    if (!r.ok) throw new BadRequestException(r.error.detalle);
    return {
      ...r.valor,
      filas: [...r.valor.filas],
      frecuencia: [...r.valor.frecuencia],
      notas: [...r.valor.notas],
    };
  }
}
