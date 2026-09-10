import {
  IsBase64,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

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
  /** Catálogo cerrado de la migración `0027`; sin valor, `automovil`. */
  @IsOptional()
  @IsIn(['automovil', 'motocicleta', 'bicicleta', 'otro'])
  tipo?: 'automovil' | 'motocicleta' | 'bicicleta' | 'otro';
}

export class RegistrarViviendaDto {
  @IsString() @Length(1, 60) identificador!: string;
  @IsOptional() @IsString() @Length(1, 60) manzana?: string;
  @IsOptional() @IsString() @Length(1, 200) direccion?: string;
}

/**
 * La hoja llega en base64 dentro del JSON, no como `multipart`.
 *
 * Motivo: el límite de payload, el `ValidationPipe` y el registro de
 * correlación de esta API operan sobre JSON; abrir una segunda tubería de
 * subida obligaría a duplicar los cuatro controles en ella, y el que se olvide
 * será el que importe.
 *
 * **El tope que manda es `LIMITE_PAYLOAD` (256 kB por defecto), no este.** Se
 * dice aquí porque si no, el síntoma es un `413` sin explicación en mitad de
 * una carga: 256 kB de JSON dan para unos 180 kB de hoja, que son miles de
 * filas de padrón. `Length` acota ANTES de decodificar, así que un envío
 * desproporcionado se rechaza sin reservar memoria para él.
 */
export class CargarPadronXlsxDto {
  @IsBase64()
  @Length(1, 340_000)
  xlsxBase64!: string;
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
