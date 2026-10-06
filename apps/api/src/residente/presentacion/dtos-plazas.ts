import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { OCUPANTES_MAXIMO } from '@ncr/domain-core';

/** RONDA 15-W (D4 bis) · el tope propio de una vivienda, siempre con motivo. */
export class CambioDeTopeDePlazasDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: OCUPANTES_MAXIMO,
    description: 'null = vuelve al tope de su copropiedad. Obligatorio: omitirlo es 400',
  })
  // Sin `@IsOptional`: un cuerpo sin `tope` —un cliente viejo o a medias— no
  // puede leerse como «vuelve al de la copropiedad». Sólo `null` lo dice.
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(OCUPANTES_MAXIMO)
  tope!: number | null;

  @ApiProperty({ minLength: 5, maxLength: 300 })
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  motivo!: string;
}

export class TopeDePlazasDto {
  @ApiProperty() tope!: number;
  @ApiProperty({ description: 'Plazas vivas, la del titular incluida' }) activas!: number;
  @ApiProperty({ description: 'El tope es de esta vivienda, no el de su copropiedad' })
  propio!: boolean;
}

export class CambioDeTopePorOmisionDto {
  @ApiProperty({ minimum: 1, maximum: OCUPANTES_MAXIMO })
  @IsInt()
  @Min(1)
  @Max(OCUPANTES_MAXIMO)
  tope!: number;

  @ApiProperty({ minLength: 5, maxLength: 300 })
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  motivo!: string;
}

export class TopePorOmisionDto {
  @ApiProperty({ description: 'Plazas por vivienda, contando al titular, salvo tope propio' })
  tope!: number;
}
