import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * RONDA 15-W (D-W5, D5) · lo que el residente puede cambiar de un vehículo
 * propio. Sin `tipo` (no se edita) ni `viviendaId` (sale del ámbito): 400.
 */
export class EdicionDeVehiculoPropioDto {
  @ApiProperty({ maxLength: 40 }) @IsString() @MinLength(1) @MaxLength(40) color!: string;
  @ApiProperty({ maxLength: 60 }) @IsString() @MinLength(1) @MaxLength(60) modelo!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  marca?: string | null;

  @ApiPropertyOptional({
    type: [String],
    nullable: true,
    description: '`residenteId` de su vivienda',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  ocupantes?: string[] | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 12,
    description: 'Sólo si el vehículo no tiene historial',
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(12)
  placa?: string | null;
}

export class VehiculoEditadoDto {
  @ApiProperty({ description: 'Siempre true' }) editado!: boolean;
}

export class VehiculoEliminadoDto {
  @ApiProperty({ enum: ['borrado', 'dado_de_baja'] }) resultado!: 'borrado' | 'dado_de_baja';
}
