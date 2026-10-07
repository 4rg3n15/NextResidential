import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL PRIMER INGRESO · RONDA 15-W (D3)
 *
 * Sin vivienda ni código: la cuenta ya trae su vivienda. Documento de ADULTO
 * (cédula, cédula de extranjería o pasaporte) y fecha de nacimiento
 * obligatoria. El correo es opcional: la app lleva el de «Crear cuenta». Nada
 * de `viviendaId`, `personaId`, `rol`, `estado`, `origen` ni `es_titular`: el
 * `forbidNonWhitelisted` global los rechaza con 400 (§6).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const TIPOS_DE_DOCUMENTO_DE_ADULTO_DTO = [
  'cedula',
  'cedula_extranjeria',
  'pasaporte',
] as const;

export class PrimerIngresoDto {
  @ApiProperty({ maxLength: 100 }) @IsString() @MinLength(1) @MaxLength(100) nombres!: string;
  @ApiProperty({ maxLength: 100 }) @IsString() @MinLength(1) @MaxLength(100) apellidos!: string;

  @ApiProperty({ enum: TIPOS_DE_DOCUMENTO_DE_ADULTO_DTO })
  @IsIn(TIPOS_DE_DOCUMENTO_DE_ADULTO_DTO)
  tipoDocumento!: (typeof TIPOS_DE_DOCUMENTO_DE_ADULTO_DTO)[number];

  @ApiProperty({ maxLength: 24 }) @IsString() @MinLength(4) @MaxLength(24) numeroDocumento!: string;

  @ApiProperty({ maxLength: 24, description: 'Canal de CONTACTO, no de acceso' })
  @IsString()
  @MaxLength(24)
  telefono!: string;

  @ApiProperty({ maxLength: 10, example: '1990-05-17' })
  @IsString()
  @MaxLength(10)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha va como AAAA-MM-DD' })
  fechaNacimiento!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 254,
    description: 'Contacto NO verificado (S-15W-04)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  correo?: string | null;
}
