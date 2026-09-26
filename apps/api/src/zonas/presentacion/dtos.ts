import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { POLITICAS_REINICIO, TIPOS_DE_ZONA } from '@ncr/domain-core';

/**
 * Una franja del horario semanal (CA-15).
 *
 * `minutoFin` admite 1440 —las 24:00— porque S-09 modela el horario que cruza
 * la medianoche con dos franjas: la del día que termina a las 24:00 y la del
 * siguiente que arranca a las 00:00 marcada como continuación.
 */
export class FranjaDto {
  @ApiProperty({ description: '0 = domingo … 6 = sábado' })
  @IsInt()
  @Min(0)
  @Max(6)
  dia!: number;

  @ApiProperty() @IsInt() @Min(0) @Max(1440) minutoInicio!: number;
  @ApiProperty() @IsInt() @Min(0) @Max(1440) minutoFin!: number;

  @ApiPropertyOptional({ description: 'Continúa la franja del día anterior tras la medianoche' })
  @IsOptional()
  @IsBoolean()
  continuaDelDiaAnterior?: boolean;
}

export class ConfigurarZonaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(100) nombre?: string;

  @ApiPropertyOptional({ description: 'Aforo máximo simultáneo (RN-14)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  aforoMaximo?: number;

  @ApiPropertyOptional({ type: [FranjaDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => FranjaDto)
  horario?: FranjaDto[];

  @ApiPropertyOptional({ enum: POLITICAS_REINICIO })
  @IsOptional()
  @IsIn([...POLITICAS_REINICIO])
  politicaReinicio?: (typeof POLITICAS_REINICIO)[number];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  normas?: string[];

  @ApiPropertyOptional({ description: 'Cierre manual del operador, sin presencia física (PB-04)' })
  @IsOptional()
  @IsBoolean()
  abierta?: boolean;

  /** Icono de la tarjeta (ADR-013). `null` lo quita. Presentación, no dominio. */
  @ApiPropertyOptional({ type: String, nullable: true, example: 'waves' })
  @IsOptional()
  @Matches(/^[a-z0-9-]{1,40}$/, { message: 'el icono es un nombre en minúsculas y guiones' })
  icono?: string | null;
}

/**
 * ETAPA 15-H (C-32) · abrir o cerrar la zona a mano, con motivo. Es lo único
 * de la configuración que alcanza el portero: horario, aforo y normas siguen
 * siendo de administración.
 */
export class AperturaDeZonaDto {
  @ApiProperty({ type: Boolean, description: 'false cierra la zona; true la vuelve a abrir' })
  @IsBoolean()
  abierta!: boolean;

  @ApiProperty({ type: String, minLength: 5, maxLength: 300 })
  @IsString()
  @Length(5, 300)
  motivo!: string;
}

/** O3 · alta de zona desde la consola. Horario y normas se configuran después. */
export class CrearZonaDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre!: string;

  @ApiProperty({ type: String, enum: TIPOS_DE_ZONA })
  @IsIn([...TIPOS_DE_ZONA])
  tipo!: (typeof TIPOS_DE_ZONA)[number];

  @ApiProperty({ description: 'Aforo máximo simultáneo (RN-14). 0 = sin límite práctico.' })
  @IsInt()
  @Min(0)
  @Max(100000)
  aforoMaximo!: number;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'dumbbell' })
  @IsOptional()
  @Matches(/^[a-z0-9-]{1,40}$/, { message: 'el icono es un nombre en minúsculas y guiones' })
  icono?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  normas?: string[];
}

export class BajaDeZonaDto {
  @ApiProperty({ type: String, minLength: 3, maxLength: 300 })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  motivo!: string;
}

export class AutorizarZonaDto {
  @ApiProperty() @IsUUID() autorizacionId!: string;
}
