import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MOTIVOS_ACCESO } from '@ncr/domain-core';

/**
 * El DTO valida FORMA; el agregado valida VERDAD (§2.7.3). Aquí no se comprueba
 * que la vigencia sea coherente ni que el patrón tenga sentido: eso es del
 * objeto de valor, y duplicarlo aquí crearía dos verdades que se separan.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AQUÍ VIVÍAN CINCO DTO MUERTOS · D-92
 *
 * `PatronDto`, `CrearAutorizacionDto`, `AcompananteDto`, `MotivoDto` y
 * `VetarDto` estaban declarados aquí y **nadie los importaba**: los vivos son
 * los de `dtos-autorizacion.ts`, que es lo que el controlador usa. Eran copias
 * envejecidas con los mismos nombres.
 *
 * No era solo ruido. En OpenAPI el nombre de la clase ES el nombre del esquema,
 * así que dos clases con el mismo nombre se pisan y **solo una sobrevive en el
 * contrato**. El generador de clientes —TypeScript y Dart— produce entonces la
 * forma equivocada para la otra, sin un solo error. Se borraron, y el paso 10b
 * comprueba desde ahora que ningún nombre de esquema se repita.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Evento normalizado del Alarm Server. La ETAPA 15 traduce el XML del
 * fabricante a ESTA forma; la ingesta no conoce ninguna otra.
 */
export class EventoIngestaDto {
  @ApiProperty() @IsUUID() copropiedadId!: string;
  @ApiProperty() @IsString() @MaxLength(128) dispositivoId!: string;
  @ApiProperty({ enum: ['placa', 'facial', 'manual', 'remoto', 'tarjeta'] })
  @IsIn(['placa', 'facial', 'manual', 'remoto', 'tarjeta'])
  metodo!: 'placa' | 'facial' | 'manual' | 'remoto' | 'tarjeta';
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() personaId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(16) placaLeida?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() zonaId?: string;
  @ApiProperty({ description: 'Confianza de la lectura, 0..1' })
  @IsInt({ message: 'confianza se envía en centésimas enteras: 95 = 0,95' })
  @Min(0)
  @Max(100)
  confianzaCentesimas!: number;
  @ApiProperty({ description: 'Identificador del evento en el equipo (RN-17)' })
  @IsString()
  @MaxLength(128)
  referenciaExterna!: string;
}

/**
 * ETAPA 12 · La decisión que el Edge YA tomó, sellada con su versión de reglas.
 *
 * Viaja como dato y no se recalcula (RN-16, CA-21). El DTO valida su FORMA; que
 * la versión exista de verdad y pertenezca a esa copropiedad lo comprueba el
 * dominio al construir el `VersionDeReglas`, como todo lo demás.
 */
export class DecisionDelEdgeDto {
  @ApiProperty({ description: 'Lo que el Edge resolvió en la portería' })
  @IsBoolean()
  permitido!: boolean;

  @ApiProperty({
    required: false,
    enum: MOTIVOS_ACCESO,
    description: 'Obligatorio cuando `permitido` es falso (CA-16)',
  })
  @IsOptional()
  @IsIn(MOTIVOS_ACCESO)
  motivo?: (typeof MOTIVOS_ACCESO)[number];

  @ApiProperty({ description: 'Qué política resolvió. Es la traza de CA-21.' })
  @IsString()
  @MaxLength(128)
  reglaAplicada!: string;

  @ApiProperty({ description: 'La versión de reglas con la que decidió (RN-16)' })
  @IsInt()
  @Min(1)
  versionDeReglas!: number;

  @ApiProperty({ required: false, description: 'Lectura de baja confianza (CU-01 3a)' })
  @IsOptional()
  @IsBoolean()
  requiereConfirmacionHumana?: boolean;
}

/** Un acceso decidido en el Edge durante un corte, listo para reconciliar. */
export class EventoReconciliadoDto extends EventoIngestaDto {
  @ApiProperty({
    description: 'Instante REAL del acceso, no el de la reconciliación (CA-22)',
  })
  @IsISO8601({ strict: true })
  ocurridoEn!: string;

  @ApiProperty({ type: DecisionDelEdgeDto })
  @ValidateNested()
  @Type(() => DecisionDelEdgeDto)
  decision!: DecisionDelEdgeDto;

  @ApiProperty({
    description: 'KPI-31 · decidido con una caché que pudo haber envejecido',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  cachePotencialmenteObsoleto?: boolean;
}

/**
 * El lote. Se envía en orden y se procesa en orden: un histórico que recibe los
 * eventos de un corte desordenados es un histórico en el que alguien salió
 * antes de entrar (CA-22).
 */
export class LoteDeReconciliacionDto {
  @ApiProperty({ type: [EventoReconciliadoDto], maxItems: 500 })
  @IsArray()
  @ArrayMaxSize(500, { message: 'El lote no puede superar 500 eventos' })
  @ValidateNested({ each: true })
  @Type(() => EventoReconciliadoDto)
  eventos!: EventoReconciliadoDto[];
}

/** Qué pasó con UNA clave del lote reconciliado. */
export class ResultadoDeReconciliacionDto {
  @ApiProperty({ description: 'La clave con la que el Edge lo reconocerá en su bandeja' })
  claveIdempotencia!: string;

  @ApiProperty() aceptado!: boolean;

  @ApiProperty({
    description:
      'La nube ya lo tenía. NO es un error: el Edge reenvía porque no sabe si llegó (CA-22)',
  })
  duplicado!: boolean;

  @ApiProperty({ required: false, description: 'Por qué no se aceptó, si no se aceptó' })
  detalle?: string;
}

export class LoteReconciliadoDto {
  @ApiProperty() aceptado!: boolean;

  @ApiProperty({
    type: [ResultadoDeReconciliacionDto],
    description: 'Uno por evento procesado, EN ORDEN. Se corta en el primero que falla.',
  })
  resultados!: ResultadoDeReconciliacionDto[];
}
