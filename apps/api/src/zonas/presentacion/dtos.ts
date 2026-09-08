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
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { POLITICAS_REINICIO } from '@ncr/domain-core';

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
}

export class AutorizarZonaDto {
  @ApiProperty() @IsUUID() autorizacionId!: string;
}
