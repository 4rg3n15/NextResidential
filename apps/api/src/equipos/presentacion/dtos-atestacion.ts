import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * D-11 · lo que el superadministrador escribe tras la prueba FÍSICA. El DTO
 * valida forma; el caso de uso normaliza las placas y sanea la evidencia.
 */
export class AtestacionDeEquipoEntradaDto {
  @ApiProperty({ description: 'Una placa que ESTÁ en la lista blanca del equipo', maxLength: 12 })
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  placaEnListaBlanca!: string;

  @ApiProperty({ description: 'Una placa que NO está en ninguna lista del equipo', maxLength: 12 })
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  placaDesconocida!: string;

  @ApiProperty({
    type: Boolean,
    description: 'Lo que se atesta: ninguna de las dos abrió. Sólo `true`; lo demás es 400.',
  })
  @IsBoolean()
  @Equals(true)
  ningunaAbrio!: boolean;

  @ApiProperty({
    description: 'Lo que vio el instalador: hora, carril, qué pasó con cada placa',
    minLength: 20,
    maxLength: 2000,
  })
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  evidencia!: string;
}

/**
 * La atestación tal como la ve la consola, con su VIGENCIA ya calculada contra
 * el firmware que el equipo declaró en su último sondeo. `vigente` nunca
 * significa «verde»: significa «se opera por una firma, no por la API».
 */
export class AtestacionDeEquipoDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) firmware!: string;
  @ApiProperty({ type: String }) placaEnListaBlanca!: string;
  @ApiProperty({ type: String }) placaDesconocida!: string;
  @ApiProperty({ type: String }) evidencia!: string;
  @ApiProperty({ type: String }) registradaEn!: string;
  @ApiProperty({ type: String }) registradaPor!: string;
  @ApiProperty({ type: Boolean }) vigente!: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Por qué no vale (p. ej. el firmware cambió). `null` si está vigente.',
  })
  motivoSinEfecto!: string | null;
}
