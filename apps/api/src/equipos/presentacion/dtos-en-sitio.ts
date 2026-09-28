import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString, Length } from 'class-validator';

/** Por qué se toca el equipo: queda en la auditoría junto a quién y cuándo. */
export class MotivoDeConfiguracionDto {
  @ApiProperty({
    type: String,
    maxLength: 300,
    description: 'Por qué se cambia. Queda en la auditoría junto a quién y cuándo.',
  })
  @IsString()
  @Length(3, 300)
  motivo!: string;
}

export class VerificacionRemotaDto extends MotivoDeConfiguracionDto {
  @ApiProperty({
    type: Boolean,
    description:
      '`true` = la terminal reporta y espera el veredicto; `false` = decide sola (plan B)',
  })
  @IsBoolean()
  activar!: boolean;
}

/**
 * Lo que el equipo quedó haciendo, confirmado al LEERLO DE VUELTA. Nunca lleva
 * la ruta del servidor de alarmas: lleva el secreto de la cámara.
 */
export class ResultadoDeConfiguracionDto {
  @ApiProperty({ type: Boolean }) aplicada!: boolean;
  @ApiProperty({ type: String, nullable: true }) valorAnterior!: string | null;
  @ApiProperty({ type: String, nullable: true }) valorNuevo!: string | null;
  @ApiProperty({ type: String, description: 'Qué pasó, en palabras' }) detalle!: string;
}
