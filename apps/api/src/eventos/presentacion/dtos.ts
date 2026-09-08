import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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
} from 'class-validator';
import { Type } from 'class-transformer';
import { MOTIVOS_ACCESO, TAMANO_PAGINA_MAXIMO, TIPOS_DE_EVENTO } from '@ncr/domain-core';

/**
 * El DTO valida FORMA; el objeto de valor `FiltroDeEventos` valida VERDAD
 * (§2.7.3). Aquí no se comprueba que el rango sea coherente ni que quepa en el
 * tope de días: eso es del dominio, y duplicarlo crearía dos verdades que se
 * separan en la primera corrección que se haga solo en un sitio.
 */
export class ConsultaEventosDto {
  @ApiProperty({ description: 'Inicio del rango, ISO-8601 con zona' })
  @IsISO8601()
  desde!: string;

  @ApiProperty({ description: 'Fin del rango, EXCLUIDO' })
  @IsISO8601()
  hasta!: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() viviendaId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() personaId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(128) dispositivoId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() zonaId?: string;

  @ApiPropertyOptional({ enum: TIPOS_DE_EVENTO })
  @IsOptional()
  @IsIn([...TIPOS_DE_EVENTO])
  tipo?: (typeof TIPOS_DE_EVENTO)[number];

  @ApiPropertyOptional({ enum: ['permitido', 'negado'] })
  @IsOptional()
  @IsIn(['permitido', 'negado'])
  resultado?: 'permitido' | 'negado';

  @ApiPropertyOptional({ enum: MOTIVOS_ACCESO })
  @IsOptional()
  @IsIn([...MOTIVOS_ACCESO])
  motivo?: (typeof MOTIVOS_ACCESO)[number];

  @ApiPropertyOptional({ minimum: 1, maximum: TAMANO_PAGINA_MAXIMO })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(TAMANO_PAGINA_MAXIMO)
  tamanoPagina?: number;

  @ApiPropertyOptional({ description: 'Cursor opaco devuelto por la página anterior' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  cursor?: string;
}

export class ExportacionEventosDto extends ConsultaEventosDto {
  @ApiProperty({ enum: ['csv', 'excel', 'pdf'] })
  @IsIn(['csv', 'excel', 'pdf'])
  formato!: 'csv' | 'excel' | 'pdf';
}

export class NotasDeAlertaDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  notas!: string;
}

/**
 * Latido de un dispositivo (CA-26, RN-12). Llega por la ingesta firmada, no por
 * una sesión de usuario: el emisor es un equipo.
 */
export class LatidoDto {
  @ApiProperty() @IsUUID() copropiedadId!: string;
  @ApiProperty() @IsString() @MaxLength(128) dispositivoId!: string;
}
