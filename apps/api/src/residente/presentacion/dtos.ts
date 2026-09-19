import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
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
