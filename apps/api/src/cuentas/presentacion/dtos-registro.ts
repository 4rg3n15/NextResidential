import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * «CREAR CUENTA» · LOS SEIS CAMPOS Y LA ACEPTACIÓN · RONDA 15-W (D-W8, D2)
 *
 * Todos obligatorios. El DTO valida FORMA; la verdad —que el código sea de una
 * plaza libre, que la persona sea mayor de edad, que el usuario esté libre— la
 * deciden el caso de uso, el dominio y la base.
 *
 * Lo que NO está aquí no se puede mandar: `rol`, `copropiedadId`, `viviendaId`,
 * `plazaId` o `esTitular` dan 400 por el `forbidNonWhitelisted` global. Quien
 * crea su cuenta no elige su conjunto, ni su vivienda, ni su papel: los dice el
 * código.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export class RegistroDeResidenteDto {
  @ApiProperty({ minLength: 3, maxLength: 32, example: 'ana.perez' })
  @IsString()
  @Length(3, 32)
  usuario!: string;

  @ApiProperty({
    maxLength: 254,
    description: 'Contacto NO verificado: no sirve para entrar ni para recuperar la contraseña',
  })
  @IsEmail()
  @MaxLength(254)
  correo!: string;

  @ApiProperty({ format: 'password', maxLength: 256 })
  @IsString()
  @Length(1, 256)
  contrasena!: string;

  @ApiProperty({ format: 'password', maxLength: 256, description: 'Igual a `contrasena`' })
  @IsString()
  @Length(1, 256)
  confirmacion!: string;

  @ApiProperty({
    maxLength: 40,
    example: 'MIRA-K7PQ-2XWZ',
    description:
      'El código de una plaza: `<código corto>-XXXX-XXXX`; guiones y espacios opcionales',
  })
  @IsString()
  @Length(8, 40)
  codigoDeInvitacion!: string;

  @ApiProperty({ maxLength: 10, example: '1990-05-17' })
  @IsString()
  @MaxLength(10)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha va como AAAA-MM-DD' })
  fechaNacimiento!: string;

  // Booleano llano en el contrato, sin `enum: [true]`: el generador de Dart no
  // sabe emitir un enum booleano y el cliente no compilaría. La verdad la pone
  // `@Equals(true)`: un `false` es un 400.
  @ApiProperty({
    type: Boolean,
    description: 'Acepta la política de tratamiento de datos: debe ser true',
  })
  @IsBoolean()
  @Equals(true, { message: 'Hay que aceptar la política de tratamiento de datos' })
  aceptaTratamientoDeDatos!: boolean;

  @ApiProperty({ maxLength: 50, description: 'La versión de la política que se mostró' })
  @IsString()
  @Length(1, 50)
  versionPolitica!: string;
}

export class RegistroCreadoDto {
  @ApiProperty({ description: 'Siempre true: la cuenta nació con su plaza' }) creada!: boolean;
}
