import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, MaxLength, ValidateIf } from 'class-validator';

/**
 * Entrada de la consola y de la app: por correo, por CÓDIGO corto y usuario
 * (D1) o por NIT y usuario (ADR-023, C-34; sólo lo ofrece la consola).
 *
 * El DTO valida FORMA: longitudes y presencia. La verdad —si el usuario tiene
 * el formato del objeto de valor, si el NIT existe— la decide el caso de uso,
 * y un fallo ahí responde lo mismo que una contraseña equivocada.
 */
export class AccesoDto {
  @ApiPropertyOptional({ type: String, maxLength: 254, description: 'Cuentas por correo' })
  @ValidateIf(
    (o: AccesoDto) => o.usuario === undefined && o.nit === undefined && o.codigo === undefined,
  )
  @IsEmail()
  @MaxLength(254)
  correo?: string;

  @ApiPropertyOptional({
    type: String,
    maxLength: 8,
    description: 'Código corto de la copropiedad (D1): 3 a 8 letras o números',
  })
  @ValidateIf((o: AccesoDto) => o.correo === undefined && o.nit === undefined)
  @IsString()
  @Length(3, 8)
  codigo?: string;

  @ApiPropertyOptional({ type: String, maxLength: 20, description: 'NIT de la copropiedad' })
  @ValidateIf((o: AccesoDto) => o.correo === undefined && o.codigo === undefined)
  @IsString()
  @Length(5, 20)
  nit?: string;

  @ApiPropertyOptional({ type: String, maxLength: 32, description: 'Nombre de usuario' })
  @ValidateIf((o: AccesoDto) => o.correo === undefined)
  @IsString()
  @Length(1, 32)
  usuario?: string;

  @ApiProperty({ type: String, maxLength: 256, format: 'password' })
  @IsString()
  @Length(1, 256)
  contrasena!: string;
}

export class CambioDeContrasenaDto {
  @ApiProperty({ type: String, maxLength: 256, format: 'password' })
  @IsString()
  @Length(1, 256)
  actual!: string;

  @ApiProperty({ type: String, maxLength: 256, format: 'password' })
  @IsString()
  @Length(1, 256)
  nueva!: string;
}

export class RestablecimientoDeContrasenaDto {
  @ApiProperty({
    type: String,
    maxLength: 256,
    format: 'password',
    description:
      'Contraseña temporal que ESCRIBE quien restablece (S-51). No se devuelve nunca; ' +
      'la cuenta queda obligada a cambiarla en su siguiente ingreso.',
  })
  @IsString()
  @Length(1, 256)
  temporal!: string;

  @ApiPropertyOptional({ type: String, maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;
}

export class SesionDeAccesoDto {
  @ApiProperty({ type: String }) accessToken!: string;
  @ApiProperty({ type: String }) refreshToken!: string;
  @ApiProperty({ type: Number, description: 'Segundos Unix' }) expiraEn!: number;
  @ApiProperty({ type: Boolean }) debeCambiarContrasena!: boolean;
}

export class HechoDeCuentaDto {
  @ApiProperty({
    type: String,
    enum: ['contrasena_cambiada', 'contrasena_restablecida', 'sesion_cerrada'],
  })
  hecho!: 'contrasena_cambiada' | 'contrasena_restablecida' | 'sesion_cerrada';
}
