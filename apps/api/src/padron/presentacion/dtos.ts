import { IsBoolean, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

/**
 * El DTO valida FORMA; el agregado valida VERDAD (§2.7.3). Aquí no se
 * normaliza la placa: eso lo hace el VO `Placa`, que es el único punto donde
 * puede hacerse sin que dos caminos de entrada produzcan formas distintas.
 */
export class RegistrarVehiculoDto {
  @IsUUID() viviendaId!: string;
  @IsString() @Length(4, 16) placa!: string;
  @IsOptional() @IsUUID() personaId?: string;
  @IsOptional() @IsString() @Length(1, 60) marca?: string;
  @IsOptional() @IsString() @Length(1, 60) modelo?: string;
  @IsOptional() @IsString() @Length(1, 30) color?: string;
}

export class DesactivarDto {
  /** RN-19: sin motivo no hay baja. El mínimo evita el «.» como motivo. */
  @IsString() @Length(3, 300) motivo!: string;
}

export class CargarPadronDto {
  @IsString()
  @Length(1, 1_000_000)
  @Matches(/^[^\0]*$/, { message: 'el contenido no admite bytes nulos' })
  csv!: string;
}

export class RegistrarResidenteDto {
  @IsUUID() viviendaId!: string;
  @IsUUID() personaId!: string;
  @IsOptional() @IsBoolean() esTitular?: boolean;
  @IsOptional() @IsString() @Length(1, 60) parentesco?: string;
}
