import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

/**
 * DTOs de PETICIÓN del segundo factor.
 *
 * `class-validator` valida; `@ApiProperty` describe. Son cosas distintas y hacen
 * falta las dos: sin el decorador de Swagger el esquema sale vacío y el cliente
 * generado recibe `Record<string, never>` como cuerpo, con lo que la consola
 * podría enviar cualquier cosa y compilar igual.
 *
 * Los DTOs se importan como VALOR en el controlador —nunca `import type`—:
 * borrar la clase al compilar deja `design:paramtypes` en `Object` y el
 * `ValidationPipe` desiste en silencio. Es el defecto de la ETAPA 03.
 */
export class InscribirMfaDto {
  @ApiProperty({
    type: String,
    minLength: 5,
    maxLength: 254,
    description: 'Correo del titular; aparece en la aplicación de autenticación',
    example: 'admin@copropiedad.example',
  })
  @IsString()
  @Length(5, 254)
  @Matches(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, { message: 'correo con formato no válido' })
  correo!: string;
}

export class VerificarMfaDto {
  /** TOTP de 6 dígitos o código de recuperación `XXXXX-XXXXX`. */
  @ApiProperty({
    type: String,
    minLength: 6,
    maxLength: 11,
    description: 'TOTP de 6 dígitos, o código de recuperación con la forma XXXXX-XXXXX',
    example: '123456',
  })
  @IsString()
  @Length(6, 11)
  @Matches(/^(\d{6}|[A-Fa-f0-9]{5}-[A-Fa-f0-9]{5})$/, { message: 'código con formato no válido' })
  codigo!: string;
}
