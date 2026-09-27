import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * D-10 · lo que escribe el TITULAR en la pantalla de la portería. Ningún campo
 * lo rellena la consola: si viniera precargado, «aceptar» sería otra vez una
 * casilla del operador.
 */
export class AceptacionPresencialDto {
  @ApiProperty({ description: 'Nombre completo, escrito por el propio titular', maxLength: 200 })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nombreCompleto!: string;

  @ApiProperty({ description: 'Número de documento, escrito por el propio titular', maxLength: 30 })
  @IsString()
  @MinLength(4)
  @MaxLength(30)
  numeroDocumento!: string;

  @ApiProperty({ description: 'Versión de la política que se le mostró y aceptó', maxLength: 50 })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  versionPolitica!: string;

  @ApiProperty({
    type: Boolean,
    description: 'Declaración expresa del titular: leyó y acepta. Sólo `true`; lo demás es 400.',
  })
  @Equals(true)
  aceptaPolitica!: boolean;
}

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

export class RespuestaDeConsentimientoDto {
  @ApiProperty({ description: 'Estado resultante del consentimiento' }) estado!: string;
  @ApiProperty({
    type: [SincronizacionTotalDto],
    description:
      'Si el titular aceptó: el resultado de empujar cada plantilla a todas las terminales. ' +
      'Vacío si rechazó o si no había plantilla pendiente.',
  })
  propagacion!: SincronizacionTotalDto[];
}
