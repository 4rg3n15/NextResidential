import {
  ArrayMaxSize,
  IsArray,
  IsBase64,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ESTADOS_ADMINISTRATIVOS } from '../aplicacion/puertos';
import type { EstadoAdministrativo } from '../aplicacion/puertos';

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
  /**
   * Solo el número. La palabra —«Casa», «Apartamento»— es de la copropiedad y
   * se pinta al mostrar; el caso de uso rechaza el identificador que la traiga
   * dentro, y explica por qué (H-3).
   */
  @ApiProperty({ type: String, minLength: 1, maxLength: 60, example: '42' })
  @IsString()
  @Length(1, 60)
  identificador!: string;

  /** Torre, bloque, manzana, sección o sector. Forma parte de la identidad. */
  @ApiPropertyOptional({ type: String, example: 'B' })
  @IsOptional()
  @IsString()
  @Length(1, 24)
  agrupacion?: string;
}

/**
 * Una excepción del plan: la agrupación que no tiene la cantidad general. Un
 * conjunto real casi nunca es homogéneo.
 */
export class ExcepcionDeAgrupacionDto {
  @ApiProperty({ type: String, maxLength: 24 })
  @IsString()
  @Length(1, 24)
  agrupacion!: string;

  @ApiProperty({ type: Number }) @IsInt() @Min(0) @Max(2000) cantidad!: number;
}

/**
 * El plan de generación — **uno solo, para todos los tipos de copropiedad**
 * (B.1, ETAPA 15-B).
 *
 * Antes había un DTO con los campos de tres planes distintos y un discriminador
 * `tipo`. Se retira: el tipo de copropiedad decide las PALABRAS de la pantalla,
 * no la forma del plan, y mezclarlos hacía que el formulario de apartamentos no
 * preguntara nunca cuántas viviendas hay.
 *
 * Los mínimos de aquí son de FORMA (§2.7.3). La verdad —que una excepción
 * apunte a una agrupación que existe, que el total quepa en la cota— la decide
 * `generarPlan` en el dominio.
 */
export class PlanDeGeneracionDto {
  /** `0` = el conjunto no se divide. El denominador es OPCIONAL. */
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(0)
  @Max(99)
  agrupaciones!: number;

  @ApiPropertyOptional({ type: String, enum: ['letras', 'numeros'] })
  @IsOptional()
  @IsIn(['letras', 'numeros'])
  estilo?: 'letras' | 'numeros';

  /** Sin agrupaciones, el total. Con agrupaciones, la cantidad por cada una. */
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(1)
  @Max(2000)
  cantidad!: number;

  /** Numeración por piso (101, 102, 201…). Ausente: correlativa. */
  @ApiPropertyOptional({ type: Number }) @IsOptional() @IsInt() @Min(0) @Max(99) porPiso?: number;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  reiniciarNumeracion?: boolean;

  @ApiPropertyOptional({ type: [ExcepcionDeAgrupacionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(99)
  @ValidateNested({ each: true })
  @Type(() => ExcepcionDeAgrupacionDto)
  excepciones?: ExcepcionDeAgrupacionDto[];
}

/** O3 · edición de vivienda. Lo ausente no se toca; `null` vacía el campo. */
export class EditarViviendaDto {
  @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 60 })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  identificador?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 24 })
  @IsOptional()
  @IsString()
  @Length(0, 24)
  agrupacion?: string | null;

  @ApiPropertyOptional({ type: String, enum: ESTADOS_ADMINISTRATIVOS })
  @IsOptional()
  @IsIn([...ESTADOS_ADMINISTRATIVOS])
  estadoAdministrativo?: EstadoAdministrativo;
}

/** O3 · edición de vehículo. Lo ausente no se toca; `null` vacía el campo. */
export class EditarVehiculoDto {
  @ApiPropertyOptional({ type: String, minLength: 4, maxLength: 16 })
  @IsOptional()
  @IsString()
  @Length(4, 16)
  placa?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  personaId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 60)
  marca?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 60)
  modelo?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 30)
  color?: string | null;

  @ApiPropertyOptional({ type: String, enum: ['automovil', 'motocicleta', 'bicicleta', 'otro'] })
  @IsOptional()
  @IsIn(['automovil', 'motocicleta', 'bicicleta', 'otro'])
  tipo?: 'automovil' | 'motocicleta' | 'bicicleta' | 'otro';
}

export class ConfirmarGeneracionDto extends PlanDeGeneracionDto {
  /**
   * O3 · qué hacer con las que ya existen. `estricto` (por omisión) no crea
   * ninguna si hay una colisión; `conservar` las deja y crea las demás;
   * `sobrescribir` además reactiva las de baja cuya identidad está en el plan.
   * Todos en UNA transacción.
   */
  @ApiPropertyOptional({ type: String, enum: ['estricto', 'conservar', 'sobrescribir'] })
  @IsOptional()
  @IsIn(['estricto', 'conservar', 'sobrescribir'])
  modo?: 'estricto' | 'conservar' | 'sobrescribir';

  /**
   * El total que la vista previa enseñó. Si el servidor recalcula el plan y le
   * sale otro número, no crea nada: cierra la ventana en que el formulario
   * cambió entre previsualizar y confirmar, sin pedirle al usuario que teclee
   * una confirmación que acabaría escribiendo sin leer.
   */
  @ApiProperty({ type: Number })
  @IsInt()
  @Min(1)
  @Max(2000)
  totalEsperado!: number;
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

/**
 * Alta de persona en el mismo paso en que se la autoriza (D-72, HU-07).
 *
 * **El DTO valida FORMA y nada más.** Aquí no se normaliza el documento ni el
 * nombre: eso lo hacen los objetos de valor `Documento` y `NombreDePersona`,
 * que son el único punto por el que pasan los dos caminos de entrada —este y la
 * carga de padrón—. Normalizar en el DTO produciría dos reglas que se separan.
 */
export class RegistrarPersonaDto {
  @ApiProperty({
    type: String,
    enum: ['cedula', 'cedula_extranjeria', 'pasaporte', 'nit', 'otro'],
    description: 'Catálogo del enumerado `tipo_documento` de la migración 0002.',
  })
  @IsIn(['cedula', 'cedula_extranjeria', 'pasaporte', 'nit', 'otro'])
  tipoDocumento!: 'cedula' | 'cedula_extranjeria' | 'pasaporte' | 'nit' | 'otro';

  @ApiProperty({
    type: String,
    minLength: 4,
    maxLength: 30,
    example: '12.345.678',
    description: 'Se admite con puntos o espacios: el objeto de valor lo normaliza.',
  })
  @IsString()
  @Length(4, 30)
  numeroDocumento!: string;

  @ApiProperty({ type: String, minLength: 2, maxLength: 200, example: 'Ana María Pérez' })
  @IsString()
  @Length(2, 200)
  nombreCompleto!: string;

  @ApiPropertyOptional({ type: String, maxLength: 40 })
  @IsOptional()
  @IsString()
  @Length(3, 40)
  telefono?: string;

  @ApiPropertyOptional({ type: String, maxLength: 200 })
  @IsOptional()
  @IsEmail()
  @Length(3, 200)
  correo?: string;
}
