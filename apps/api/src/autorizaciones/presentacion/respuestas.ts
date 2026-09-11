import { ApiProperty } from '@nestjs/swagger';

/** DTOs de salida de visitantes y autorizaciones — HU-07 a HU-10, HU-16, HU-17. */
export class PatronDto {
  @ApiProperty({
    type: [Number],
    description: 'Días de la semana, 0..6 con domingo = 0 (el vocabulario del dominio).',
  })
  dias!: number[];
  @ApiProperty({ type: String, example: '08:00' }) horaInicio!: string;
  @ApiProperty({ type: String, example: '18:00' }) horaFin!: string;
}

export class AutorizacionDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) viviendaId!: string;
  @ApiProperty({ type: String }) vivienda!: string;
  @ApiProperty({ type: String }) visitante!: string;
  @ApiProperty({ type: String }) documento!: string;
  @ApiProperty({ type: String, format: 'date-time' }) desde!: string;
  @ApiProperty({ type: String, format: 'date-time' }) hasta!: string;
  @ApiProperty({ type: String, enum: ['unica', 'recurrente'] }) tipo!: string;
  @ApiProperty({ type: String, enum: ['activa', 'revocada'] }) estado!: string;
  @ApiProperty({ type: String, nullable: true }) placa!: string | null;
  @ApiProperty({ type: [String] }) acompanantes!: string[];
  @ApiProperty({ type: PatronDto, nullable: true }) patron!: PatronDto | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) revocadaEn!: string | null;
  @ApiProperty({ type: String, nullable: true }) motivoRevocacion!: string | null;
}

export class IdAutorizacionDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
}

export class RevocacionDto {
  @ApiProperty({ type: Boolean }) revocada!: boolean;
}

export class AcompananteAgregadoDto {
  @ApiProperty({ type: Boolean }) agregado!: boolean;
}
