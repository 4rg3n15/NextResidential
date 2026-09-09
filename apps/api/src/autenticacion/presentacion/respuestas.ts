import { ApiProperty } from '@nestjs/swagger';
import { ROLES } from '../dominio/claims';

/**
 * DTO de salida de la sesión.
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
    type: String,
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

/**
 * El registro de restablecimiento responde **204 sin cuerpo**: no hay nada que
 * devolver, y devolver algo invitaría a que la consola lo interpretara. Se
 * declara igualmente para que el contrato no tenga una operación sin tipo.
 */
export class RestablecimientoRegistradoDto {
  @ApiProperty({
    type: Boolean,
    example: true,
    description: 'Siempre true; la respuesta es 204 sin cuerpo',
  })
  registrado!: boolean;
}
