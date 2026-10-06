import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Entradas y salidas de «Mi familia» · RONDA 15-W (D-W2, D4). El DTO valida
 * FORMA; la edad, el documento y la plaza los deciden el dominio y la base.
 * Sin `viviendaId`, `personaId`, `estado` ni `es_titular`: 400 (§6).
 */
export const TIPOS_DE_DOCUMENTO_DE_MENOR_DTO = ['tarjeta_identidad', 'registro_civil'] as const;

export class EdicionDeMenorDto {
  @ApiProperty({ maxLength: 100 }) @IsString() @MinLength(1) @MaxLength(100) nombres!: string;
  @ApiProperty({ maxLength: 100 }) @IsString() @MinLength(1) @MaxLength(100) apellidos!: string;

  @ApiProperty({ maxLength: 10, example: '2015-08-21' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha va como AAAA-MM-DD' })
  fechaNacimiento!: string;

  @ApiProperty({ maxLength: 60, example: 'Hija' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  parentesco!: string;
}

export class MenorDto extends EdicionDeMenorDto {
  @ApiProperty({ enum: TIPOS_DE_DOCUMENTO_DE_MENOR_DTO })
  @IsIn(TIPOS_DE_DOCUMENTO_DE_MENOR_DTO)
  tipoDocumento!: (typeof TIPOS_DE_DOCUMENTO_DE_MENOR_DTO)[number];

  @ApiProperty({ maxLength: 24 }) @IsString() @MinLength(4) @MaxLength(24) numeroDocumento!: string;

  @ApiProperty({ format: 'uuid', description: 'Una plaza LIBRE de su vivienda' })
  @IsUUID('4')
  plazaId!: string;
}

export class BajaDeMenorDto {
  @ApiProperty({ minLength: 5, maxLength: 300 })
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  motivo!: string;
}

export class MenorDelHogarDto {
  @ApiProperty({ format: 'uuid' }) residenteId!: string;
  @ApiProperty({ type: String, nullable: true }) nombres!: string | null;
  @ApiProperty({ type: String, nullable: true }) apellidos!: string | null;
  @ApiProperty() nombreCompleto!: string;
  @ApiProperty({ type: String, nullable: true }) fechaNacimiento!: string | null;
  @ApiProperty({ type: Number, nullable: true }) edad!: number | null;
  @ApiProperty() tipoDocumento!: string;
  @ApiProperty({ description: 'Enmascarado: ••••5678' }) documento!: string;
  @ApiProperty({ type: String, nullable: true }) parentesco!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) plazaId!: string | null;
  @ApiProperty({ type: Number, nullable: true }) plazaNumero!: number | null;
  @ApiProperty() tieneRostro!: boolean;
}

export class MenorRegistradoDto {
  @ApiProperty({ format: 'uuid' }) residenteId!: string;
}

export class CodigoDeTraspasoDto {
  @ApiProperty({ example: 'MIRA-K7PQ-2XWZ', description: 'Un solo uso: para «Crear cuenta»' })
  codigo!: string;
}
