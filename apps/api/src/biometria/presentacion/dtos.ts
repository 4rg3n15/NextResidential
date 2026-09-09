import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBase64,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
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
import { CANALES } from '@ncr/domain-core';

/**
 * Medidas de la captura. Las produce quien tiene la cámara —el móvil de la
 * ETAPA 11 o la consola de la 09—, porque analizar el encuadre en el servidor
 * exigiría subir la imagen antes de saber si sirve, y la imagen de un rostro es
 * precisamente lo que no conviene subir de más (minimización, Ley 1581 art. 4).
 *
 * Que las aporte el cliente no las hace de fiar: el DTO acota rangos y el
 * dominio decide. Un cliente que mienta consigue una plantilla mala, no una
 * plantilla sin consentimiento.
 */
export class MedidasDto {
  @ApiProperty({ minimum: 0, maximum: 10 })
  @IsInt()
  @Min(0)
  @Max(10)
  rostrosDetectados!: number;

  @ApiProperty({ minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  nitidez!: number;

  @ApiProperty({ minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  iluminacion!: number;

  @ApiProperty({ minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  proporcionRostro!: number;
}

export class CapturarRostroDto {
  @ApiProperty({ description: 'El TITULAR del dato: el visitante (RN-10)' })
  @IsUUID()
  titularId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  autorizacionId?: string;

  @ApiProperty({ type: MedidasDto })
  @ValidateNested()
  @Type(() => MedidasDto)
  medidas!: MedidasDto;

  @ApiProperty({ description: 'Vector biométrico en base64. No es la fotografía.' })
  @IsBase64()
  @MaxLength(16384)
  vector!: string;

  @ApiProperty({ description: 'Versión de la política de tratamiento aceptada' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  versionPolitica!: string;

  @ApiProperty({ enum: CANALES })
  @IsIn(CANALES)
  canal!: (typeof CANALES)[number];

  @ApiProperty({ description: 'Instante de supresión programada (RN-11)' })
  @IsISO8601()
  suprimirEn!: string;
}

export class ResponderConsentimientoDto {
  @ApiProperty({ description: 'true acepta, false rechaza. Lo responde el TITULAR.' })
  @IsBoolean()
  acepta!: boolean;

  @ApiPropertyOptional({ description: 'Evidencia de la aceptación (RN-09)' })
  @IsOptional()
  @IsUUID()
  evidenciaId?: string;
}

export class SincronizarPlantillaDto {
  @ApiProperty()
  @IsUUID()
  dispositivoId!: string;
}
