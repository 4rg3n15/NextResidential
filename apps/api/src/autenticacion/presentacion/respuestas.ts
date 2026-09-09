import { ApiProperty } from '@nestjs/swagger';
import { ROLES } from '../dominio/claims';

/**
 * DTOs de salida de sesión y segundo factor.
 *
 * La consola decide con estos tres datos qué superficie enseña y si debe
 * empujar al usuario al paso de MFA. Que estuvieran sin tipar obligaba a la
 * interfaz a adivinar la forma del token, que es justo el sitio donde una
 * suposición equivocada se convierte en un menú con opciones que el backend
 * va a rechazar (la interfaz oculta, no protege).
 */
export class SesionDto {
  @ApiProperty({ format: 'uuid' }) usuarioId!: string;

  @ApiProperty({ enum: [...ROLES], description: 'Rol derivado de los claims, no elegido' })
  rol!: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Copropiedad del usuario; null en el operador de central, que atiende varias',
  })
  copropiedadId!: string | null;

  @ApiProperty({
    type: [String],
    description: 'Alcance del operador de central, acotado a su turno activo (KPI-35)',
  })
  copropiedadesAtendidas!: string[];

  @ApiProperty({
    description:
      'aal2 en el token. Los roles administrativos no operan sin él (RN-20, CA-25): ' +
      'la consola debe llevar al paso de segundo factor mientras sea false.',
  })
  mfaVerificado!: boolean;
}

export class InscripcionMfaDto {
  @ApiProperty({
    description: 'URI otpauth:// para el código QR. No se vuelve a mostrar.',
    example: 'otpauth://totp/...',
  })
  uriOtpauth!: string;

  @ApiProperty({
    type: [String],
    description:
      'Códigos de recuperación de un solo uso. Se entregan UNA vez y se guardan ' +
      'en hash: si el usuario los pierde, hay que reinscribir.',
  })
  codigosDeRecuperacion!: string[];
}

export class VerificacionMfaDto {
  @ApiProperty({ example: true }) verificado!: boolean;
  @ApiProperty({ example: 7, description: 'Códigos de recuperación aún sin consumir' })
  codigosRestantes!: number;
}
