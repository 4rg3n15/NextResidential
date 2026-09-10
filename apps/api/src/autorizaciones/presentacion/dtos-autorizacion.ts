import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** El DTO valida FORMA; el agregado valida VERDAD (§2.7.3). */
export class PatronDeEntradaDto {
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  dias!: number[];

  @IsInt() @Min(0) @Max(1440) minutoInicio!: number;
  @IsInt() @Min(0) @Max(1440) minutoFin!: number;
  @IsInt() @Min(-840) @Max(840) desplazamientoUtcMinutos!: number;
}

export class CrearAutorizacionDto {
  @IsUUID() viviendaId!: string;
  @IsUUID() personaId!: string;
  @IsISO8601() desde!: string;
  @IsISO8601() hasta!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  zonasPermitidas?: string[];
  @IsOptional() @IsInt() @Min(0) @Max(50) maximoAcompanantes?: number;
  @IsOptional() @ValidateNested() @Type(() => PatronDeEntradaDto) patron?: PatronDeEntradaDto;
}

export class RevocarAutorizacionDto {
  /** RN-19: sin motivo no hay revocación, y el mínimo evita el «.» como motivo. */
  @IsString() @Length(3, 300) motivo!: string;
}

export class AgregarAcompananteDto {
  @IsUUID() personaId!: string;
  @IsString() @Length(1, 200) nombre!: string;
}
