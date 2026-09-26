import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OCUPANTES_MAXIMO, TIPOS_DE_VEHICULO } from '@ncr/domain-core';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ENTRADAS DEL HOGAR DEL RESIDENTE Y DE SU SUPERVISIÓN · ETAPA 15-I
 *
 * El DTO valida FORMA y TAMAÑO (§2.7.3); la verdad —que la vivienda exista, que
 * el código sea de una plaza libre, que el documento no sea de otro, que el tope
 * no se rebase— la deciden el dominio y la base. El documento de identidad se
 * acota aquí y se normaliza allí, y nunca aparece en un mensaje de error.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export const TIPOS_DE_DOCUMENTO_DTO = [
  'cedula',
  'cedula_extranjeria',
  'pasaporte',
  'otro',
] as const;

export class PerfilDto {
  @ApiProperty({ maxLength: 100 }) @IsString() @MinLength(1) @MaxLength(100) nombres!: string;
  @ApiProperty({ maxLength: 100 }) @IsString() @MinLength(1) @MaxLength(100) apellidos!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 10, example: '1990-05-17' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaNacimiento?: string | null;

  @ApiProperty({ enum: TIPOS_DE_DOCUMENTO_DTO })
  @IsIn(TIPOS_DE_DOCUMENTO_DTO)
  tipoDocumento!: (typeof TIPOS_DE_DOCUMENTO_DTO)[number];

  @ApiProperty({ maxLength: 24 }) @IsString() @MinLength(4) @MaxLength(24) numeroDocumento!: string;

  @ApiProperty({ maxLength: 254, description: 'Canal de CONTACTO, no de acceso' })
  @IsString()
  @MaxLength(254)
  correo!: string;

  @ApiProperty({ maxLength: 24, description: 'Canal de CONTACTO, no de acceso' })
  @IsString()
  @MaxLength(24)
  telefono!: string;
}

/** 3.2 · el formulario obligatorio del primer ingreso (y el cambio de vivienda, 3.5). */
export class AltaDeMiViviendaDto {
  @ApiProperty({ type: PerfilDto })
  @ValidateNested()
  @Type(() => PerfilDto)
  perfil!: PerfilDto;

  @ApiProperty({ maxLength: 60, description: 'El número de la vivienda, que tiene que EXISTIR' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  identificador!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 60,
    description: 'La agrupación (torre, manzana…): obligatoria en un conjunto de apartamentos',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  agrupacion?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 12,
    description: 'Código de ocupante. Nulo = «no lo tengo» (sólo si la vivienda no tiene cuenta)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  codigo?: string | null;
}

/** D6 · la declaración, con la confirmación explícita de que es definitiva. */
export class DeclaracionDeOcupantesDto {
  @ApiProperty({ minimum: 1, maximum: OCUPANTES_MAXIMO })
  @IsInt()
  @Min(1)
  @Max(OCUPANTES_MAXIMO)
  numero!: number;

  @ApiProperty({ description: 'El residente confirmó que el número es DEFINITIVO' })
  @IsBoolean()
  confirmoQueEsDefinitivo!: boolean;
}

/** D5 a · un vehículo propio; uno o más ocupantes de la vivienda. */
export class VehiculoPropioDto {
  @ApiProperty({ maxLength: 12 }) @IsString() @MinLength(5) @MaxLength(12) placa!: string;
  @ApiProperty({ maxLength: 40 }) @IsString() @MinLength(1) @MaxLength(40) color!: string;
  @ApiProperty({ maxLength: 60 }) @IsString() @MinLength(1) @MaxLength(60) modelo!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  marca?: string | null;

  @ApiProperty({ enum: TIPOS_DE_VEHICULO })
  @IsIn(TIPOS_DE_VEHICULO)
  tipo!: (typeof TIPOS_DE_VEHICULO)[number];

  @ApiProperty({ type: [String], description: '`residenteId` de los ocupantes vinculados' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  ocupantes!: string[];
}

/** 3.1 · alta de la cuenta del residente por el superadministrador. */
export class AltaDeCuentaDeResidenteDto {
  @ApiProperty({ minLength: 3, maxLength: 32, example: 'casa42.ana' })
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  usuario!: string;

  @ApiProperty({ format: 'password', maxLength: 256 })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  contrasenaInicial!: string;

  @ApiProperty({ maxLength: 200 }) @IsString() @MinLength(1) @MaxLength(200) nombre!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 24 })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  telefono?: string | null;
}

/** D6 · el superadministrador añade plazas, siempre con motivo. */
export class AnadirOcupantesDto {
  @ApiProperty({ minimum: 1, maximum: 10 }) @IsInt() @Min(1) @Max(10) cantidad!: number;
  @ApiProperty({ maxLength: 300 }) @IsString() @MinLength(3) @MaxLength(300) motivo!: string;
}

export class RetiroDeOcupanteDto {
  @ApiProperty({ maxLength: 300 }) @IsString() @MinLength(3) @MaxLength(300) motivo!: string;
}
