import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * El DTO valida FORMA; el agregado valida VERDAD (§2.7.3). Aquí no se comprueba
 * que la vigencia sea coherente ni que el patrón tenga sentido: eso es del
 * objeto de valor, y duplicarlo aquí crearía dos verdades que se separan.
 */
export class PatronDto {
  @ApiProperty({ type: [Number], description: '0=domingo … 6=sábado' })
  @IsArray()
  @IsInt({ each: true })
  dias!: number[];

  @ApiProperty() @IsInt() @Min(0) @Max(1440) minutoInicio!: number;
  @ApiProperty() @IsInt() @Min(0) @Max(1440) minutoFin!: number;
  @ApiProperty({ description: 'Minutos respecto de UTC; Bogotá: -300' })
  @IsInt()
  @Min(-840)
  @Max(840)
  desplazamientoUtcMinutos!: number;
}

export class CrearAutorizacionDto {
  @ApiProperty() @IsUUID() viviendaId!: string;
  @ApiProperty() @IsUUID() personaId!: string;
  @ApiProperty({ description: 'Inicio de la vigencia, ISO-8601 con zona' })
  @IsISO8601()
  desde!: string;
  @ApiProperty({ description: 'Fin de la vigencia, EXCLUIDO' }) @IsISO8601() hasta!: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  zonasPermitidas?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  maximoAcompanantes?: number;

  @ApiProperty({ required: false, type: PatronDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PatronDto)
  patron?: PatronDto;
}

export class AcompananteDto {
  @ApiProperty() @IsUUID() personaId!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) nombre!: string;
}

export class MotivoDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(500) motivo!: string;
}

export class VetarDto {
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() personaId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(16) placa?: string;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(500) motivo!: string;
}

/**
 * Evento normalizado del Alarm Server. La ETAPA 15 traduce el XML del
 * fabricante a ESTA forma; la ingesta no conoce ninguna otra.
 */
export class EventoIngestaDto {
  @ApiProperty() @IsUUID() copropiedadId!: string;
  @ApiProperty() @IsString() @MaxLength(128) dispositivoId!: string;
  @ApiProperty({ enum: ['placa', 'facial', 'manual', 'remoto', 'tarjeta'] })
  @IsIn(['placa', 'facial', 'manual', 'remoto', 'tarjeta'])
  metodo!: 'placa' | 'facial' | 'manual' | 'remoto' | 'tarjeta';
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() personaId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(16) placaLeida?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() zonaId?: string;
  @ApiProperty({ description: 'Confianza de la lectura, 0..1' })
  @IsInt({ message: 'confianza se envía en centésimas enteras: 95 = 0,95' })
  @Min(0)
  @Max(100)
  confianzaCentesimas!: number;
  @ApiProperty({ description: 'Identificador del evento en el equipo (RN-17)' })
  @IsString()
  @MaxLength(128)
  referenciaExterna!: string;
}
