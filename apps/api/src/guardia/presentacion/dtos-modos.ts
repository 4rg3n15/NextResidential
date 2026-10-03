import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  LONGITUD_MAXIMA_DE_MOTIVO,
  LONGITUD_MINIMA_DE_MOTIVO,
} from '../aplicacion/apertura-manual';
import { TOPE_DE_PLATAFORMA_MIN } from '../aplicacion/modo-de-puerta';

/** 15-R · P-25 · dejar una puerta libre o bloqueada, con motivo y plazo. */
export class OrdenDeModoDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  dispositivoId!: string;

  @ApiProperty({ minimum: 1, maximum: 64 })
  @IsInt()
  @Min(1)
  @Max(64)
  numeroDePuerta!: number;

  @ApiProperty({ enum: ['libre', 'bloqueada'] })
  @IsIn(['libre', 'bloqueada'])
  modo!: 'libre' | 'bloqueada';

  @ApiProperty({
    minLength: LONGITUD_MINIMA_DE_MOTIVO,
    maxLength: LONGITUD_MAXIMA_DE_MOTIVO,
    description: 'Obligatorio (RN-08). Sin motivo la puerta no cambia de modo.',
  })
  @IsString()
  @MinLength(LONGITUD_MINIMA_DE_MOTIVO)
  @MaxLength(LONGITUD_MAXIMA_DE_MOTIVO)
  motivo!: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: TOPE_DE_PLATAFORMA_MIN,
    description: 'Minutos hasta la reversión; sin él, la duración máxima de la copropiedad.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(TOPE_DE_PLATAFORMA_MIN)
  minutos?: number;
}

export class ReversionDeModoDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  dispositivoId!: string;

  @ApiProperty({ minimum: 1, maximum: 64 })
  @IsInt()
  @Min(1)
  @Max(64)
  numeroDePuerta!: number;

  @ApiPropertyOptional({ maxLength: LONGITUD_MAXIMA_DE_MOTIVO })
  @IsOptional()
  @IsString()
  @MaxLength(LONGITUD_MAXIMA_DE_MOTIVO)
  motivo?: string;
}

export class OrdenDeModoCumplidaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['aceptada', 'rechazada', 'inalcanzable'] }) resultado!: string;
  @ApiProperty({ type: String, nullable: true }) detalle!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) revierteEn!: string | null;
}

export class ModoVigenteDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) dispositivoId!: string;
  @ApiProperty() numeroDePuerta!: number;
  @ApiProperty({ enum: ['libre', 'bloqueada'] }) modo!: string;
  @ApiProperty() motivo!: string;
  @ApiProperty({ format: 'uuid' }) operadorId!: string;
  @ApiProperty({ type: String, nullable: true }) operadorNombre!: string | null;
  @ApiProperty() rol!: string;
  @ApiProperty({ format: 'date-time' }) desde!: string;
  @ApiProperty({ format: 'date-time' }) revierteEn!: string;
  @ApiProperty({ type: String, nullable: true, enum: ['aceptada', 'rechazada', 'inalcanzable'] })
  resultado!: string | null;
  @ApiProperty({ description: 'Reversiones automáticas que no llegaron al equipo' })
  reversionesFallidas!: number;
}

export class ModosVigentesDto {
  @ApiProperty({ type: [ModoVigenteDto] }) modos!: ModoVigenteDto[];
}

export class AjustesDePuertasDto {
  @ApiProperty({ minimum: 15, maximum: TOPE_DE_PLATAFORMA_MIN })
  @IsInt()
  @Min(15)
  @Max(TOPE_DE_PLATAFORMA_MIN)
  duracionMaximaMinutos!: number;
}
