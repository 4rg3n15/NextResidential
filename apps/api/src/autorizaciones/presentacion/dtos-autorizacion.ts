import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTOs de ENTRADA de visitantes y autorizaciones.
 *
 * El DTO valida FORMA; el agregado valida VERDAD (§2.7.3). Aquí no se decide si
 * la vigencia nace expirada ni cuántos acompañantes caben: eso lo deciden
 * `Vigencia` y `Autorizacion`, y duplicarlo aquí produciría dos reglas que se
 * separan en la primera modificación.
 */
export class PatronDeEntradaDto {
  @ApiProperty({
    type: [Number],
    description: 'Días de la semana, 0..6 con domingo = 0 (RN-22).',
    example: [1, 2, 3, 4, 5],
  })
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  dias!: number[];

  @ApiProperty({ type: Number, minimum: 0, maximum: 1440, example: 480 })
  @IsInt()
  @Min(0)
  @Max(1440)
  minutoInicio!: number;

  @ApiProperty({ type: Number, minimum: 0, maximum: 1440, example: 1080 })
  @IsInt()
  @Min(0)
  @Max(1440)
  minutoFin!: number;

  @ApiProperty({
    type: Number,
    description: 'Desfase UTC en minutos de la copropiedad; el patrón es local, no UTC.',
    example: -300,
  })
  @IsInt()
  @Min(-840)
  @Max(840)
  desplazamientoUtcMinutos!: number;
}

export class CrearAutorizacionDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() viviendaId!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Persona que visita.' })
  @IsUUID()
  personaId!: string;

  @ApiProperty({ type: String, format: 'date-time' }) @IsISO8601() desde!: string;
  @ApiProperty({ type: String, format: 'date-time' }) @IsISO8601() hasta!: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  zonasPermitidas?: string[];

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  maximoAcompanantes?: number;

  @ApiPropertyOptional({
    type: PatronDeEntradaDto,
    description: 'Su presencia es lo único que distingue una recurrente de una única (HU-09).',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PatronDeEntradaDto)
  patron?: PatronDeEntradaDto;
}

export class RevocarAutorizacionDto {
  /** RN-19: sin motivo no hay revocación, y el mínimo evita el «.» como motivo. */
  @ApiProperty({ type: String, minLength: 3, maxLength: 300 })
  @IsString()
  @Length(3, 300)
  motivo!: string;
}

export class AgregarAcompananteDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description:
      'El acompañante entra por su PROPIA identidad, para que la lista negra lo alcance (D-01).',
  })
  @IsUUID()
  personaId!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 200 })
  @IsString()
  @Length(1, 200)
  nombre!: string;
}
