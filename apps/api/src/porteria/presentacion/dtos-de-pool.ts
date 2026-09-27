import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';

/** H1 · H2 (15-L) · el pool de identificadores de la copropiedad y su cupo. */
export class PoolDePorterosDto {
  @ApiProperty() inicio!: number;
  @ApiProperty() fin!: number;
  @ApiProperty({ description: 'El próximo número que se asignará' }) siguiente!: number;
  @ApiProperty({ description: 'Porteros activos que admite (máximo 999)' }) cupo!: number;
  @ApiProperty({ description: 'Porteros activos ahora' }) activos!: number;
}

export class CupoDePorterosDto {
  @ApiProperty({ minimum: 0, maximum: 999 })
  @IsInt()
  @Min(0)
  @Max(999)
  cupo!: number;
}

/** H2 (15-L) · la baja de un portero: su número queda ocupado para siempre. */
export class BajaDePorteroDto {
  @ApiProperty({ type: String, minLength: 3, maxLength: 300 })
  @IsString()
  @Length(3, 300)
  motivo!: string;
}
