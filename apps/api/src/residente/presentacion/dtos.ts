import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
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

export const PERIODOS_DE_HISTORIAL = ['hoy', 'semana', 'mes', 'todo'] as const;

/**
 * Filtros del historial — los cuatro chips del mockup M-6.
 *
 * Se valida aunque venga por `query`: el `ValidationPipe` global corre con
 * `forbidNonWhitelisted`, así que un parámetro inventado es un 400 y no un
 * valor ignorado en silencio. Y `limite` tiene tope: sin él, `?limite=999999`
 * sería una lectura sin cota sobre una tabla particionada (§2.7.5).
 */
export class HistorialQueryDto {
  @ApiPropertyOptional({ enum: PERIODOS_DE_HISTORIAL, default: 'mes' })
  @IsOptional()
  @IsIn(PERIODOS_DE_HISTORIAL)
  periodo?: (typeof PERIODOS_DE_HISTORIAL)[number];

  @ApiPropertyOptional({ type: Number, default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limite?: number;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * M-4 · Nuevo visitante
 *
 * El DTO valida FORMA; el agregado y `puedeAutorizar` validan VERDAD (§2.7.3).
 * Aquí no se comprueba que la vigencia sea coherente ni que el patrón tenga
 * sentido: eso son objetos de valor del dominio, y duplicarlo crearía dos
 * verdades que se separan a la tercera corrección.
 *
 * Lo que sí se acota aquí es el TAMAÑO, que es defensa de superficie (§2.7.3):
 * veinte acompañantes, mil caracteres de observaciones, ocho de placa. Sin
 * topes, un cliente cualquiera envía un arreglo de cien mil nombres y la
 * transacción los inserta uno a uno.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export class PatronDeVisitaDto {
  @ApiProperty({ type: [Number], description: '0=domingo … 6=sábado' })
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  dias!: number[];

  @ApiProperty({ minimum: 0, maximum: 1440 }) @IsInt() @Min(0) @Max(1440) minutoInicio!: number;
  @ApiProperty({ minimum: 0, maximum: 1440 }) @IsInt() @Min(0) @Max(1440) minutoFin!: number;

  @ApiProperty({ description: 'Minutos respecto de UTC; Bogotá: -300' })
  @IsInt()
  @Min(-840)
  @Max(840)
  desplazamientoUtcMinutos!: number;
}

export class NuevaVisitaDto {
  @ApiProperty({ minLength: 3, maxLength: 120 })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  visitante!: string;

  @ApiPropertyOptional({ maxLength: 32, description: 'Documento; sin él, RN-06 solo cruza placa' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  documento?: string;

  @ApiProperty({ description: 'Inicio de la vigencia, ISO-8601 con zona' })
  @IsISO8601()
  desde!: string;

  @ApiProperty({ description: 'Fin de la vigencia, EXCLUIDO' })
  @IsISO8601()
  hasta!: string;

  @ApiPropertyOptional({ maxLength: 8, description: 'Placa; se normaliza en la base' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  placa?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  permiteAccesoVehicular?: boolean;

  @ApiPropertyOptional({ type: [String], maxItems: 20, description: 'Nombres, no un contador' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(2, { each: true })
  @MaxLength(120, { each: true })
  acompanantes?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  zonasPermitidas?: string[];

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;

  @ApiPropertyOptional({ type: PatronDeVisitaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PatronDeVisitaDto)
  patron?: PatronDeVisitaDto;

  /**
   * La clave la genera la APP antes del primer intento y la repite en cada
   * reintento (RN-17). Es obligatoria: dejarla opcional habría hecho que el
   * cliente que más la necesita —el que está sin cobertura— fuera justo el que
   * puede olvidarla.
   */
  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  claveDeIdempotencia!: string;
}

/** M-7 · HU-34 · el token del aparato para las notificaciones. */
export class TokenDeNotificacionDto {
  @ApiProperty({ minLength: 8, maxLength: 128, description: 'Identificador estable del aparato' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  instalacionId!: string;

  @ApiProperty({ minLength: 8, maxLength: 4096 })
  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  token!: string;

  @ApiProperty({ enum: ['ios', 'android', 'web'] })
  @IsIn(['ios', 'android', 'web'])
  plataforma!: 'ios' | 'android' | 'web';
}
