import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SincronizarPlantillaDto {
  @ApiProperty()
  @IsUUID()
  dispositivoId!: string;
}

export class ResultadoPorTerminalDto {
  @ApiProperty({ format: 'uuid' }) dispositivoId!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty() sincronizada!: boolean;
  @ApiProperty() detalle!: string;
}

export class EquipoOmitidoDto {
  @ApiProperty({ format: 'uuid' }) dispositivoId!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty({ description: 'Por qué no recibió la plantilla, en palabras' }) detalle!: string;
}

export class SincronizacionTotalDto {
  @ApiProperty({ format: 'uuid' }) plantillaId!: string;
  @ApiProperty({ description: 'Equipos activos con biblioteca de rostros' }) terminales!: number;
  @ApiProperty() sincronizadas!: number;
  @ApiProperty() fallidas!: number;
  @ApiProperty({ type: [ResultadoPorTerminalDto] }) porTerminal!: ResultadoPorTerminalDto[];
  @ApiProperty({
    type: [EquipoOmitidoDto],
    description:
      'A3 (15-L) · terminales y videoporteros sin biblioteca de rostros: se omiten y se dice',
  })
  omitidas!: EquipoOmitidoDto[];
}
