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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTOs de ENTRADA del padrón.
 *
 * **Dos decoradores por campo, y los dos hacen falta.** `class-validator`
 * decide qué se acepta en tiempo de ejecución; `@ApiProperty` decide qué sabe
 * el contrato. Sin el segundo, `openapi.json` describe el cuerpo como un objeto
 * SIN propiedades y el cliente generado lo traduce a `Record<string, never>`:
 * la consola no puede escribir ese cuerpo, y si lo fuerza con un `as`, el día
 * que un campo se renombre nadie se entera. Es exactamente el defecto que la
 * ETAPA 09-A encontró en las RESPUESTAS; aquí estaba en los cuerpos.
 *
 * El DTO valida FORMA; el agregado valida VERDAD (§2.7.3). Aquí no se normaliza
 * la placa: eso lo hace el VO `Placa`, el único punto donde puede hacerse sin
 * que dos caminos de entrada produzcan formas distintas.
 */
export class RegistrarVehiculoDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() viviendaId!: string;

  @ApiProperty({ type: String, minLength: 4, maxLength: 16, example: 'ABC123' })
  @IsString()
  @Length(4, 16)
  placa!: string;

  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  personaId?: string;

  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @Length(1, 60) marca?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @Length(1, 60) modelo?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @Length(1, 30) color?: string;

  /** Catálogo cerrado de la migración `0027`; sin valor, `automovil`. */
  @ApiPropertyOptional({ type: String, enum: ['automovil', 'motocicleta', 'bicicleta', 'otro'] })
  @IsOptional()
  @IsIn(['automovil', 'motocicleta', 'bicicleta', 'otro'])
  tipo?: 'automovil' | 'motocicleta' | 'bicicleta' | 'otro';
}

export class RegistrarViviendaDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 60, example: 'Casa 12' })
  @IsString()
  @Length(1, 60)
  identificador!: string;

  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @Length(1, 60) manzana?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  direccion?: string;
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
  @ApiProperty({
    type: String,
    format: 'byte',
    description: 'Hoja .xlsx en base64. Se valida el TIPO REAL por firma, nunca la extensión.',
  })
  @IsBase64()
  @Length(1, 340_000)
  xlsxBase64!: string;
}

export class DesactivarDto {
  /** RN-19: sin motivo no hay baja. El mínimo evita el «.» como motivo. */
  @ApiProperty({
    type: String,
    minLength: 3,
    maxLength: 300,
    description: 'Obligatorio (RN-19). Queda en la auditoría junto al actor y no se puede editar.',
  })
  @IsString()
  @Length(3, 300)
  motivo!: string;
}

export class CargarPadronDto {
  @ApiProperty({ type: String, description: 'Contenido CSV con cabecera; sin bytes nulos.' })
  @IsString()
  @Length(1, 1_000_000)
  @Matches(/^[^\0]*$/, { message: 'el contenido no admite bytes nulos' })
  csv!: string;
}

export class RegistrarResidenteDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() viviendaId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() personaId!: string;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() esTitular?: boolean;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  parentesco?: string;
}
