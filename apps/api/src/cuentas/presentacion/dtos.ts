import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, MaxLength, ValidateIf } from 'class-validator';

/**
 * Entrada de la consola y de la app: por correo, por CÓDIGO corto y usuario
 * (D1, el residente) o por el NÚMERO del portero sin nada más (H3, ADR-031).
 * El NIT ya no entra.
 *
 * El DTO valida FORMA: longitudes y presencia. La verdad —si el usuario tiene
 * el formato del objeto de valor, si el código existe— la decide el caso de uso,
 * y un fallo ahí responde lo mismo que una contraseña equivocada.
 */
/**
 * Nulo cuenta como AUSENTE. El cliente Dart generado (app, 15-I) serializa los
 * opcionales como `null`; si aquí se comparara con `undefined`, un acceso por
 * código llegaría como «correo: null» y se trataría como acceso por correo.
 */
const ausente = (v: unknown): boolean => v === undefined || v === null;

export class AccesoDto {
  @ApiPropertyOptional({ type: String, maxLength: 254, description: 'Cuentas por correo' })
  @ValidateIf((o: AccesoDto) => ausente(o.usuario) && ausente(o.codigo))
  @IsEmail()
  @MaxLength(254)
  correo?: string | null;

  @ApiPropertyOptional({
    type: String,
    maxLength: 8,
    description:
      'Código corto de la copropiedad (D1): 3 a 8 letras o números. Con él, el usuario es el ' +
      'del residente; sin él, el usuario es el NÚMERO del portero (ADR-031)',
  })
  @ValidateIf((o: AccesoDto) => !ausente(o.codigo))
  @IsString()
  @Length(3, 8)
  codigo?: string | null;

  @ApiPropertyOptional({
    type: String,
    maxLength: 32,
    description: 'Usuario del residente (con código) o número del portero (sin código)',
  })
  @ValidateIf((o: AccesoDto) => ausente(o.correo))
  @IsString()
  @Length(1, 32)
  usuario?: string | null;

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
