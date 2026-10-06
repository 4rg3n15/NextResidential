import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** 15-W (D6) · la revocación de una visita propia: motivo obligatorio, ≤ 200, saneado. */
export class RevocacionDeMiVisitaDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  motivo!: string;
}

export class VisitaRevocadaDto {
  @ApiProperty({ description: 'Siempre true' }) revocada!: boolean;
  @ApiProperty({ description: 'Rostros del visitante suprimidos (RN-11)' })
  rostrosSuprimidos!: number;
  @ApiProperty({ description: 'Equipos de los que ya salió el rostro' }) equiposRetirados!: number;
  @ApiProperty({ description: 'Equipos que lo retirarán al reintentar' })
  equiposPendientes!: number;
}
