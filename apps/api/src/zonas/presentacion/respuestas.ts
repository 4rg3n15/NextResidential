import { ApiProperty } from '@nestjs/swagger';

/**
 * DTOs de salida de zonas comunes — HU-18, HU-19, HU-20, CU-05.
 *
 * **La interfaz refleja; no calcula.** Todo lo que sale de aquí ya está
 * decidido: el aforo lo garantiza la base y `dentroDeHorario` lo resuelve el
 * objeto de valor `HorarioDeZona` con el reloj inyectado. Si la consola
 * recalculara el aforo restando ingresos de salidas, tendría una segunda
 * verdad que se separaría de la primera en la primera carrera.
 */
export class FranjaDto {
  @ApiProperty({ type: Number, description: 'Día 0..6 con domingo = 0.' }) dia!: number;
  @ApiProperty({ type: Number }) minutoInicio!: number;
  @ApiProperty({ type: Number }) minutoFin!: number;
  @ApiProperty({
    type: Boolean,
    description:
      'La franja viene del día anterior: una zona abierta de 22:00 a 02:00 son DOS franjas ' +
      'encadenadas, no una que reinicia a medianoche. El contador de aforo no se reinicia ' +
      'con el cambio de día (CU-05).',
  })
  continuaDelDiaAnterior!: boolean;
}

export class ReservaDelDiaDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) titular!: string;
  @ApiProperty({ type: String, format: 'date-time' }) desde!: string;
  @ApiProperty({ type: String, format: 'date-time' }) hasta!: string;
  @ApiProperty({ type: Number }) personas!: number;
}

export class ZonaDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) nombre!: string;
  @ApiProperty({ type: String }) tipo!: string;
  @ApiProperty({ type: Boolean }) abierta!: boolean;
  @ApiProperty({ type: String }) politicaReinicio!: string;
  @ApiProperty({ type: [String] }) normas!: string[];
  @ApiProperty({ type: Number }) aforoMaximo!: number;
  @ApiProperty({ type: Number }) aforoActual!: number;
  @ApiProperty({ type: Number }) aforoDisponible!: number;
  @ApiProperty({ type: Boolean }) dentroDeHorario!: boolean;
  @ApiProperty({ type: Boolean }) aforoCompleto!: boolean;
  @ApiProperty({ type: [FranjaDto] }) horario!: FranjaDto[];
  @ApiProperty({ type: Number, description: 'Minutos de desfase UTC del horario de la zona.' })
  desplazamientoUtcMinutos!: number;
  @ApiProperty({
    type: [ReservaDelDiaDto],
    description:
      'Reservas del día. Vacío mientras no exista el módulo de reservas (P-15): la pantalla ' +
      'muestra el estado vacío, que es información honesta, y no un número inventado.',
  })
  reservasDelDia!: ReservaDelDiaDto[];
}

export class VeredictoDeIngresoDto {
  @ApiProperty({ type: Boolean }) admitido!: boolean;
  @ApiProperty({ type: Number, nullable: true }) conteo!: number | null;
  @ApiProperty({ type: String, nullable: true }) motivo!: string | null;
}

export class ConteoDto {
  @ApiProperty({ type: Number }) conteo!: number;
}

export class PermisoDeZonaDto {
  @ApiProperty({ type: String, format: 'uuid' }) zonaId!: string;
}
