import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
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
import { MAX_BASE64_FOTOGRAFIA } from '../aplicacion/foto';
import { DURACION_MAXIMA_MINUTOS, DURACION_MINIMA_MINUTOS } from '../aplicacion/generar-visita';
import { ESTADOS_DE_VISITA, ESTADOS_EN_EQUIPO, TIPOS_DE_DOCUMENTO } from '../aplicacion/puertos';

/**
 * C9 (15-M) · el DTO rechaza CON PALABRAS una visita sin duración: «de 02:33
 * a 02:33» no autoriza a nadie. La capa de aplicación (`revisarForma`) lo
 * vuelve a comprobar por si alguien llega sin pasar por aquí.
 */
export const MENSAJE_DURACION_MINIMA =
  'La visita debe durar más de cero minutos (mínimo 15): la hora de fin tiene que ser posterior a la de inicio';

/**
 * El DTO valida FORMA; la casilla, la duración y la calidad de la foto las
 * juzga el caso de uso, y la vigencia el agregado (§2.7.3). Aquí se acota el
 * TAMAÑO de todo lo que entra.
 */
export class MedidasDeFotoDto {
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

export class FotoDeVisitaDto {
  @ApiProperty({
    description: 'La foto frontal, JPEG o PNG, en base64',
    maxLength: MAX_BASE64_FOTOGRAFIA,
  })
  @IsString()
  @MinLength(16)
  @MaxLength(MAX_BASE64_FOTOGRAFIA)
  contenidoBase64!: string;

  @ApiProperty({ enum: ['image/jpeg', 'image/png'] })
  @IsIn(['image/jpeg', 'image/png'])
  tipoMime!: string;

  @ApiProperty({ type: MedidasDeFotoDto })
  @ValidateNested()
  @Type(() => MedidasDeFotoDto)
  medidas!: MedidasDeFotoDto;
}

/** Lo común a la consola y a la app: cuándo, cuánto, placa, notas, foto y casilla. */
class FormaDeVisitaDto {
  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha y hora de la visita' })
  @IsISO8601()
  inicio!: string;

  @ApiProperty({ minimum: DURACION_MINIMA_MINUTOS, maximum: DURACION_MAXIMA_MINUTOS })
  @IsInt({ message: 'La duración debe ser un número entero de minutos' })
  @Min(DURACION_MINIMA_MINUTOS, { message: MENSAJE_DURACION_MINIMA })
  @Max(DURACION_MAXIMA_MINUTOS, { message: 'La visita no puede durar más de 24 horas' })
  duracionMinutos!: number;

  @ApiPropertyOptional({ type: String, maxLength: 8, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  placa?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 1000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string | null;

  @ApiProperty({
    description:
      'La casilla «El visitante autorizó el uso de su foto para el ingreso». Obligatoria.',
  })
  @IsBoolean()
  casillaMarcada!: boolean;
}

export class GenerarVisitaDto extends FormaDeVisitaDto {
  @ApiProperty({ minLength: 3, maxLength: 120 })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  nombre!: string;

  @ApiProperty({ enum: TIPOS_DE_DOCUMENTO })
  @IsIn(TIPOS_DE_DOCUMENTO)
  tipoDocumento!: (typeof TIPOS_DE_DOCUMENTO)[number];

  @ApiProperty({ minLength: 4, maxLength: 32 })
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  documento!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  viviendaId!: string;

  @ApiProperty({ type: FotoDeVisitaDto })
  @ValidateNested()
  @Type(() => FotoDeVisitaDto)
  foto!: FotoDeVisitaDto;
}

/** F1 en la app: la vivienda sale del vínculo del residente, nunca del cuerpo. */
export class MiVisitaDto extends FormaDeVisitaDto {
  @ApiProperty({ minLength: 3, maxLength: 120 })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  nombre!: string;

  @ApiProperty({ minLength: 4, maxLength: 32 })
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  documento!: string;

  @ApiProperty({ type: FotoDeVisitaDto })
  @ValidateNested()
  @Type(() => FotoDeVisitaDto)
  foto!: FotoDeVisitaDto;

  @ApiProperty({
    minLength: 8,
    maxLength: 128,
    description: 'La reusa cada reintento sin conexión',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  claveDeIdempotencia!: string;
}

/** F6 · «Volver a autorizar»: sólo cuándo, cuánto y la casilla. */
export class RepetirVisitaDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @IsISO8601()
  inicio!: string;

  @ApiProperty({ minimum: DURACION_MINIMA_MINUTOS, maximum: DURACION_MAXIMA_MINUTOS })
  @IsInt({ message: 'La duración debe ser un número entero de minutos' })
  @Min(DURACION_MINIMA_MINUTOS, { message: MENSAJE_DURACION_MINIMA })
  @Max(DURACION_MAXIMA_MINUTOS, { message: 'La visita no puede durar más de 24 horas' })
  duracionMinutos!: number;

  @ApiProperty()
  @IsBoolean()
  casillaMarcada!: boolean;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  claveDeIdempotencia!: string;
}

export class RechazoDeVisitaDto {
  @ApiProperty({ minLength: 3, maxLength: 300 })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  motivo!: string;
}

export class ConsultaDeVisitasDto {
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  desde?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  hasta?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  viviendaId?: string;

  @ApiPropertyOptional({ enum: ESTADOS_DE_VISITA })
  @IsOptional()
  @IsIn(ESTADOS_DE_VISITA)
  estado?: (typeof ESTADOS_DE_VISITA)[number];

  @ApiPropertyOptional({ maxLength: 80, description: 'Nombre o documento del visitante' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  texto?: string;
}

// ── Respuestas ───────────────────────────────────────────────────────────────

export class VisitaDto {
  @ApiProperty() autorizacionId!: string;
  @ApiProperty() visitante!: string;
  @ApiProperty() documento!: string;
  @ApiProperty() viviendaId!: string;
  @ApiProperty() vivienda!: string;
  @ApiProperty({ type: String, format: 'date-time' }) desde!: string;
  @ApiProperty({ type: String, format: 'date-time' }) hasta!: string;
  @ApiProperty({ enum: ESTADOS_DE_VISITA }) estado!: (typeof ESTADOS_DE_VISITA)[number];
  @ApiProperty({ type: String, nullable: true }) placa!: string | null;
  @ApiProperty({ type: String, nullable: true }) generadaPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) generadaEn!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) anuladaEn!: string | null;
  @ApiProperty({ type: String, nullable: true }) motivoAnulacion!: string | null;
  @ApiProperty() tieneFoto!: boolean;
  @ApiProperty({ type: String, nullable: true }) casillaDeclaradaPor!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) casillaEn!: string | null;
  @ApiProperty({ type: String, nullable: true }) plantillaId!: string | null;
  @ApiProperty() equiposSincronizados!: number;
  @ApiProperty() equiposFallidos!: number;
  /** C9 (15-M) · «Placa XXX registrada para la visita de …, del … al …», o nulo sin placa. */
  @ApiProperty({ type: String, nullable: true }) confirmacionDePlaca!: string | null;
}

export class ListaDeVisitasDto {
  @ApiProperty({ description: 'La lista es la del día, sin importar los filtros pedidos' })
  soloElDia!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) desde!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) hasta!: string | null;
  @ApiProperty({ type: [VisitaDto] }) visitas!: VisitaDto[];
}

export class FotoEnEquipoDto {
  @ApiProperty() dispositivoId!: string;
  @ApiProperty() equipo!: string;
  @ApiProperty({ enum: ESTADOS_EN_EQUIPO }) estado!: (typeof ESTADOS_EN_EQUIPO)[number];
  @ApiProperty({ type: String, nullable: true }) detalle!: string | null;
  @ApiProperty() intentos!: number;
  @ApiProperty({ type: String, format: 'date-time' }) actualizadoEn!: string;
}

export class ViviendaDeVisitaDto {
  @ApiProperty() id!: string;
  @ApiProperty() nombre!: string;
}

export class EquipoDeLaSincronizacionDto {
  @ApiProperty() dispositivoId!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty() sincronizada!: boolean;
  @ApiProperty() detalle!: string;
}

export class VisitaGeneradaDto {
  @ApiProperty() generada!: boolean;
  @ApiProperty({ type: String, nullable: true }) autorizacionId!: string | null;
  @ApiProperty({ type: [String], description: 'Por qué no sirvió la foto, si no sirvió' })
  motivosDeFoto!: string[];
  @ApiProperty({ description: 'Equipos con biblioteca de rostros de la copropiedad' })
  equipos!: number;
  @ApiProperty() sincronizadas!: number;
  @ApiProperty() fallidas!: number;
  @ApiProperty({ type: [EquipoDeLaSincronizacionDto] })
  porEquipo!: EquipoDeLaSincronizacionDto[];
  @ApiProperty({ type: String, nullable: true })
  avisoDeSincronizacion!: string | null;
  /** C9 (15-M) · la confirmación de la placa, tal cual se muestra; nulo sin placa. */
  @ApiProperty({ type: String, nullable: true })
  confirmacionDePlaca!: string | null;
}

export class VisitaRechazadaDto {
  @ApiProperty() equiposRetirados!: number;
  @ApiProperty() equiposPendientes!: number;
}

export class TextoDeLaCasillaDto {
  /** El texto con `{visitante}`, que el cliente sustituye por el nombre del formulario. */
  @ApiProperty({
    description:
      'Texto de la casilla con el marcador {visitante}: el cliente lo sustituye por el ' +
      'nombre escrito en el formulario',
  })
  plantilla!: string;
  @ApiProperty({ description: 'El marcador que se sustituye: {visitante}' })
  marcador!: string;
  @ApiProperty() version!: string;
}
