import { IsString, Length, Matches } from 'class-validator';

export class InscribirMfaDto {
  @IsString()
  @Length(5, 254)
  @Matches(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, { message: 'correo con formato no válido' })
  correo!: string;
}

export class VerificarMfaDto {
  /** TOTP de 6 dígitos o código de recuperación `XXXXX-XXXXX`. */
  @IsString()
  @Length(6, 11)
  @Matches(/^(\d{6}|[A-Fa-f0-9]{5}-[A-Fa-f0-9]{5})$/, { message: 'código con formato no válido' })
  codigo!: string;
}
