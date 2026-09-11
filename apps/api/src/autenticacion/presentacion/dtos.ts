import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

/**
 * DTO de PETICIÓN de la recuperación del segundo factor.
 *
 * `class-validator` valida; `@ApiProperty` describe. Hacen falta los dos: sin el
 * decorador de Swagger el esquema sale vacío y el cliente generado recibe
 * `Record<string, never>` como cuerpo.
 *
 * Se importa como VALOR en el controlador —nunca `import type`—: borrar la
 * clase al compilar deja `design:paramtypes` en `Object` y el `ValidationPipe`
 * desiste en silencio. Es el defecto de la ETAPA 03.
 */
export class RecuperarFactorDto {
  @ApiProperty({
    type: String,
    minLength: 11,
    maxLength: 11,
    description: 'Código de recuperación con la forma XXXXX-XXXXX',
    example: 'A1B2C-D3E4F',
  })
  @IsString()
  @Length(11, 11)
  @Matches(/^[A-Fa-f0-9]{5}-[A-Fa-f0-9]{5}$/, { message: 'código de recuperación con formato no válido' })
  codigo!: string;
}
