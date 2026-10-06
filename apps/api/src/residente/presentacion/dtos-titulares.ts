import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Entradas y salidas de la titularidad y del registro · RONDA 15-W (D1, D2).
 * Todas de plataforma: sólo el superadministrador las usa.
 */
export class AsignacionDeViviendaDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') viviendaId!: string;
  @ApiProperty({ minLength: 5, maxLength: 300 })
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  motivo!: string;
}

export class ReanudacionDelRegistroDto {
  @ApiProperty({ minLength: 5, maxLength: 300 })
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  motivo!: string;
}

export class ViviendaSinTitularDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() identificador!: string;
  @ApiProperty({ type: String, nullable: true }) agrupacion!: string | null;
}

export class ViviendaAsignadaDto {
  @ApiProperty({ description: 'Siempre true' }) asignada!: boolean;
}

export class EstadoDelRegistroDto {
  @ApiProperty() suspendido!: boolean;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) hasta!: string | null;
  @ApiProperty({ description: 'Códigos fallidos en la última hora' }) fallosRecientes!: number;
}

export class RegistroReanudadoDto {
  @ApiProperty({ description: 'Siempre true' }) reanudado!: boolean;
}
