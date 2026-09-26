import {
  ArrayMaxSize,
  IsArray,
  IsBase64,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TIPOS_DE_IMAGEN_ADMITIDOS } from '../../comun/archivos/tipo-real';
import { MAX_BASE64_FOTOGRAFIA } from '../aplicacion/fotografia-de-visitante';

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

  /**
   * H-15I-05 · el desplazamiento del CLIENTE no decide nada. La franja se guarda
   * en hora local de la copropiedad y al leerla manda `copropiedades.zona_horaria`
   * en el instante del reloj de la API. Se sigue aceptando —acotado— para no
   * romper a los clientes que ya lo envían; no se persiste.
   */
  @ApiProperty({
    type: Number,
    description:
      'Informativo: se valida y se descarta. La franja es hora local de la copropiedad y ' +
      'se evalúa con SU zona horaria, no con la del navegador.',
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

  /** O3 · placa del vehículo del visitante; el objeto de valor la normaliza. */
  @ApiPropertyOptional({ type: String, nullable: true, minLength: 5, maxLength: 12 })
  @IsOptional()
  @IsString()
  @Length(5, 12)
  placa?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string | null;
}

/**
 * O3 · lo que se puede cambiar de una autorización viva. Cada campo es
 * opcional; `null` en placa u observaciones las QUITA, ausente las deja.
 */
export class ModificarAutorizacionDto {
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  hasta?: string;

  @ApiPropertyOptional({ type: String, nullable: true, minLength: 5, maxLength: 12 })
  @IsOptional()
  @IsString()
  @Length(5, 12)
  placa?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string | null;
}

/**
 * O3 · la fotografía de identificación, en base64 dentro del JSON. El tope de
 * la cadena se valida aquí (forma) y el de los bytes reales en el caso de uso
 * (verdad); el tipo declarado se contrasta con los bytes de cabecera.
 */
export class FotografiaDeVisitanteDto {
  @ApiProperty({ type: String, enum: TIPOS_DE_IMAGEN_ADMITIDOS })
  @IsIn(TIPOS_DE_IMAGEN_ADMITIDOS)
  tipoMime!: string;

  @ApiProperty({ type: String, description: 'Imagen JPEG o PNG en base64, máximo 1,5 MiB.' })
  @IsString()
  @MaxLength(MAX_BASE64_FOTOGRAFIA)
  @IsBase64()
  contenidoBase64!: string;
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

/**
 * 15-I · HU-35 · un veto: una placa, o el documento de la persona, y siempre
 * el motivo (RN-07). El caso de uso exige al menos una de las dos.
 */
export class VetoDto {
  @ApiPropertyOptional({ type: String, nullable: true, minLength: 5, maxLength: 12 })
  @IsOptional()
  @IsString()
  @Length(5, 12)
  placa?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    minLength: 4,
    maxLength: 32,
    description: 'Documento de la persona a vetar; se resuelve en ESTA copropiedad',
  })
  @IsOptional()
  @IsString()
  @Length(4, 32)
  documento?: string | null;

  @ApiProperty({ type: String, minLength: 3, maxLength: 300 })
  @IsString()
  @Length(3, 300)
  motivo!: string;
}
