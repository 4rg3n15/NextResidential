import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EventoReconciliadoDto } from '../../autorizaciones';

/**
 * Los DTO del módulo `edge` (15-Q). La instantánea viaja tal como la compone
 * `aplicacion/instantanea.ts`; aquí sólo se describe para el contrato OpenAPI.
 */

export class ConsultaDeInstantaneaDto {
  @ApiProperty({
    required: false,
    minimum: 0,
    description: 'La versión que el Edge ya tiene. 0 (o ausente): no tiene ninguna.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  desde?: number;
}

class PatronEnLaInstantaneaDto {
  @ApiProperty({ type: [Number] }) dias!: number[];
  @ApiProperty() minutoInicio!: number;
  @ApiProperty() minutoFin!: number;
  @ApiProperty() desplazamientoUtcMinutos!: number;
}

class AcompananteEnLaInstantaneaDto {
  @ApiProperty({ format: 'uuid' }) personaId!: string;
  @ApiProperty({ description: 'Siempre vacío: el motor no lee nombres (minimización)' })
  nombre!: string;
}

class AutorizacionEnLaInstantaneaDto {
  @ApiProperty({ description: 'UUID, o `residente:<vehículo>` para el derecho del residente' })
  id!: string;
  @ApiProperty({ format: 'uuid' }) viviendaId!: string;
  @ApiProperty() personaId!: string;
  @ApiProperty({ format: 'date-time' }) desde!: string;
  @ApiProperty({ format: 'date-time' }) hasta!: string;
  @ApiProperty({ enum: ['vigente', 'revocada'] }) estado!: 'vigente' | 'revocada';
  @ApiProperty({ type: [String] }) zonasPermitidas!: string[];
  @ApiProperty({ type: [AcompananteEnLaInstantaneaDto] })
  acompanantes!: AcompananteEnLaInstantaneaDto[];
  @ApiProperty() maximoAcompanantes!: number;
  @ApiProperty({ type: PatronEnLaInstantaneaDto, nullable: true })
  patron!: PatronEnLaInstantaneaDto | null;
  @ApiProperty({ type: String, nullable: true }) placa!: string | null;
}

class VehiculoEnLaInstantaneaDto {
  @ApiProperty() placa!: string;
  @ApiProperty() personaId!: string;
  @ApiProperty({ format: 'uuid' }) viviendaId!: string;
}

class FranjaEnLaInstantaneaDto {
  @ApiProperty() dia!: number;
  @ApiProperty() minutoInicio!: number;
  @ApiProperty() minutoFin!: number;
  @ApiProperty() continuaDelDiaAnterior!: boolean;
}

class ZonaEnLaInstantaneaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: [true] }) restringida!: true;
  @ApiProperty() abierta!: boolean;
  @ApiProperty() aforoMaximo!: number;
  @ApiProperty() ocupacionActual!: number;
  @ApiProperty() desplazamientoUtcMinutos!: number;
  @ApiProperty({ type: [FranjaEnLaInstantaneaDto] }) franjas!: FranjaEnLaInstantaneaDto[];
}

class PlantillaEnLaInstantaneaDto {
  @ApiProperty({ description: 'Identificador de la plantilla en la terminal; NUNCA el vector' })
  plantillaId!: string;
  @ApiProperty({ format: 'uuid' }) personaId!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  reconocibleHasta!: string | null;
}

export class InstantaneaDeReglasDto {
  @ApiProperty({ format: 'uuid' }) copropiedadId!: string;
  @ApiProperty({ description: 'VersiónDeReglas publicada (0010): la que sella cada decisión' })
  version!: number;
  @ApiProperty({ description: 'SHA-256 del contenido: el Edge puede verificar su caché' })
  hash!: string;
  @ApiProperty({ format: 'date-time', description: 'Desde aquí se mide KPI-31' })
  generadaEn!: string;
  @ApiProperty({ type: [AutorizacionEnLaInstantaneaDto] })
  autorizaciones!: AutorizacionEnLaInstantaneaDto[];
  @ApiProperty({ type: [String] }) personasEnListaNegra!: string[];
  @ApiProperty({ type: [String] }) placasEnListaNegra!: string[];
  @ApiProperty({ type: [String] }) viviendasActivas!: string[];
  @ApiProperty({ type: [VehiculoEnLaInstantaneaDto] }) vehiculos!: VehiculoEnLaInstantaneaDto[];
  @ApiProperty({ type: [ZonaEnLaInstantaneaDto] }) zonas!: ZonaEnLaInstantaneaDto[];
  @ApiProperty({ type: [String] }) personasConConsentimiento!: string[];
  @ApiProperty({ type: [PlantillaEnLaInstantaneaDto] })
  plantillas!: PlantillaEnLaInstantaneaDto[];
  @ApiProperty() umbralDeConfianza!: number;
}

export class InstantaneaSinCambiosDto {
  @ApiProperty({ format: 'uuid' }) copropiedadId!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ enum: [true] }) sinCambios!: true;
  @ApiProperty({ format: 'date-time', description: 'La nube da fe de la versión AHORA' })
  generadaEn!: string;
}

/** 15-Q · Q4 · lo que el Edge hizo con el equipo tras decidir sin WAN. */
export class AccionamientoDelEdgeDto {
  @ApiProperty({ enum: ['apertura', 'veredicto'] })
  @IsIn(['apertura', 'veredicto'])
  tipo!: 'apertura' | 'veredicto';

  @ApiProperty({ enum: ['aceptada', 'rechazada', 'inalcanzable'] })
  @IsIn(['aceptada', 'rechazada', 'inalcanzable'])
  estado!: 'aceptada' | 'rechazada' | 'inalcanzable';

  @ApiProperty() @IsInt() @Min(0) @Max(600_000) latenciaMs!: number;

  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(200) motivo?: string;

  @ApiProperty({ description: 'Cuándo se accionó, en el reloj del Edge' })
  @IsISO8601({ strict: true })
  ocurridoEn!: string;
}

export class EventoDelEdgeDto extends EventoReconciliadoDto {
  @ApiProperty({ type: AccionamientoDelEdgeDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => AccionamientoDelEdgeDto)
  accionamiento?: AccionamientoDelEdgeDto;
}

export class LoteDelEdgeDto {
  @ApiProperty({ type: [EventoDelEdgeDto], maxItems: 500 })
  @IsArray()
  @ArrayMaxSize(500, { message: 'El lote no puede superar 500 eventos' })
  @ValidateNested({ each: true })
  @Type(() => EventoDelEdgeDto)
  eventos!: EventoDelEdgeDto[];
}

export class AltaDeEdgeDto {
  @ApiProperty({ minLength: 1, maxLength: 80, description: 'Cómo lo verá el operador' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  // eslint-disable-next-line no-control-regex
  @Matches(/^[^\u0000-\u001F]+$/u, { message: 'el nombre no admite caracteres de control' })
  nombre!: string;
}

export class CredencialDelEdgeDto {
  @ApiProperty({ format: 'uuid' }) edgeId!: string;
  @ApiProperty({ format: 'uuid' }) copropiedadId!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty({ description: 'Lo único que queda en la base (RN-21)' }) credencialRef!: string;
  @ApiProperty({
    description:
      'La credencial del Edge, para su `EDGE_INGESTA_SECRETO`. Se muestra UNA vez: la API no la guarda',
  })
  secreto!: string;
}
