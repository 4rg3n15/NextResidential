import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  LONGITUD_MAXIMA_DE_MOTIVO,
  LONGITUD_MINIMA_DE_MOTIVO,
} from '../aplicacion/apertura-manual';

/**
 * El DTO valida FORMA; la verdad —que sin motivo no se acciona— la valida el
 * caso de uso (§2.7.3). Las dos comprobaciones existen a propósito: quitar
 * cualquiera de las dos deja un agujero distinto. Sin el DTO, un cuerpo con
 * tipos inesperados llega al dominio; sin el caso de uso, la regla vive en la
 * capa que se puede saltar con un `curl`.
 */
export class OrdenManualDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  dispositivoId!: string;

  @ApiProperty({ enum: ['abrir', 'negar'] })
  @IsIn(['abrir', 'negar'])
  accion!: 'abrir' | 'negar';

  @ApiProperty({
    minLength: LONGITUD_MINIMA_DE_MOTIVO,
    maxLength: LONGITUD_MAXIMA_DE_MOTIVO,
    description:
      'Obligatorio. Sin motivo la puerta NO se acciona: no es un campo requerido del ' +
      'formulario, es una condición de la orden (RN-08, CA-16, CA-17).',
    example: 'Visitante esperado por la vivienda 4, confirmado por teléfono',
  })
  @IsString()
  @MinLength(LONGITUD_MINIMA_DE_MOTIVO)
  @MaxLength(LONGITUD_MAXIMA_DE_MOTIVO)
  motivo!: string;

  @ApiProperty({ required: false, format: 'uuid', description: 'Evento que se está atendiendo' })
  @IsOptional()
  @IsUUID()
  eventoId?: string;
}

export class OrdenEjecutadaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['abrir', 'negar'] }) accion!: string;
  @ApiProperty() motivo!: string;
  @ApiProperty({ format: 'uuid' }) operadorId!: string;
  @ApiProperty() rol!: string;
  @ApiProperty({ format: 'uuid' }) dispositivoId!: string;
  @ApiProperty({ format: 'date-time' }) momento!: string;
  @ApiProperty({ nullable: true, type: String }) eventoId!: string | null;

  /**
   * Cómo respondió el equipo. **Ninguno de los tres dice «se abrió»**: el
   * equipo confirma que recibió la orden, no que el vehículo pasó. Mientras la
   * señal de posición no esté cableada, el sistema no puede afirmarlo, y esta
   * respuesta no va a fingir que sí.
   *
   * `rechazada` e `inalcanzable` se separan porque se resuelven de forma
   * distinta: una desbloqueando el acceso, la otra llamando al técnico.
   */
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['aceptada', 'rechazada', 'inalcanzable'],
    description:
      'Respuesta del equipo. «aceptada» significa orden aceptada, NO paso franqueado. ' +
      'Nulo en una negación, que no acciona nada.',
  })
  resultado!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Lo que contestó el equipo.' })
  detalle!: string | null;
}

export class HistorialDeOrdenesDto {
  @ApiProperty({ type: [OrdenEjecutadaDto] }) ordenes!: OrdenEjecutadaDto[];
}

export class EnAtencionDto {
  @ApiProperty({ format: 'uuid' }) eventoId!: string;
  @ApiProperty({ format: 'date-time' }) ocurridoEn!: string;
  @ApiProperty({ nullable: true, type: String }) motivo!: string | null;
  @ApiProperty() resultado!: string;
  @ApiProperty({ format: 'uuid' }) dispositivoId!: string;
  @ApiProperty({ nullable: true, type: String }) viviendaId!: string | null;
  @ApiProperty({ nullable: true, type: String }) placaDetectada!: string | null;

  @ApiProperty({
    description:
      'Segundos que lleva esperando. Se CALCULA en cada consulta, no se guarda: una espera ' +
      'guardada envejece mal y la consola pintaría un número que dejó de ser cierto.',
  })
  esperaSegundos!: number;

  @ApiProperty({ enum: ['critica', 'normal'] }) urgencia!: string;
  @ApiProperty({ description: 'Pasado el umbral de KPI-34' }) demorado!: boolean;
}

export class ColaDeAtencionDto {
  @ApiProperty({
    type: [EnAtencionDto],
    description:
      'Ordenada por espera DESCENDENTE, con lo crítico delante. No por recencia: una bandeja ' +
      'por recencia hunde al que lleva más tiempo esperando cada vez que llega otro.',
  })
  cola!: EnAtencionDto[];

  @ApiProperty() total!: number;
  @ApiProperty() criticos!: number;
  @ApiProperty() esperaMaxima!: number;
}

export class SolicitudDeCanalDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  dispositivoId!: string;
}

export class EstadoDeCanalDto {
  @ApiProperty({ format: 'uuid' }) dispositivoId!: string;

  @ApiProperty({
    enum: ['abierta', 'en_espera', 'cerrada'],
    description:
      'El canal de audio del equipo admite UNA conversación a la vez (ADR-01). El segundo ' +
      'operador no se rechaza: se encola.',
  })
  estado!: string;

  @ApiProperty({ description: 'Cuántos van delante. 0 cuando se tiene la palabra.' })
  porDelante!: number;

  @ApiProperty({ nullable: true, type: String, description: 'Quién tiene la palabra ahora' })
  titular!: string | null;

  @ApiProperty({ description: 'Segundos tras los que el canal se libera solo por inactividad' })
  timeoutSegundos!: number;
}

export class AvisoAlResidenteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  viviendaId!: string;

  @ApiProperty({ minLength: 4, maxLength: 200 })
  @IsString()
  @MinLength(4)
  @MaxLength(200)
  texto!: string;
}

export class EmergenciaDto {
  @ApiProperty({ minLength: 8, maxLength: 300, description: 'Qué ocurre. Obligatorio.' })
  @IsString()
  @MinLength(8)
  @MaxLength(300)
  motivo!: string;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  dispositivoId?: string;
}

export class AceptadoDto {
  @ApiProperty({ example: true }) aceptado!: boolean;
  @ApiProperty({ required: false }) detalle?: string;
}

/**
 * Bloqueo y desbloqueo de un acceso — orden de administración, no de portería.
 *
 * `bloqueado` es un estado, no un pulso: mientras esté puesto, ninguna placa
 * autorizada abre. Por eso el motivo pesa aquí tanto o más que en la apertura.
 */
export class OrdenDeBloqueoDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  dispositivoId!: string;

  @ApiProperty({
    type: Boolean,
    description:
      'Verdadero deja el acceso bloqueado hasta que alguien lo revierta: ninguna ' +
      'autorización abre mientras tanto.',
  })
  @IsBoolean()
  bloqueado!: boolean;

  @ApiProperty({
    minLength: LONGITUD_MINIMA_DE_MOTIVO,
    maxLength: LONGITUD_MAXIMA_DE_MOTIVO,
    description:
      'Obligatorio (RN-08). Sin motivo NO se bloquea: un acceso bloqueado sin ' +
      'justificación registrada deja al conjunto sin entrada y sin a quién preguntar.',
    example: 'Mantenimiento de la talanquera, coordinado con la administración',
  })
  @IsString()
  @MinLength(LONGITUD_MINIMA_DE_MOTIVO)
  @MaxLength(LONGITUD_MAXIMA_DE_MOTIVO)
  motivo!: string;
}

/** El estado vigente **con dueño**: quién lo dejó así y desde cuándo. */
export class BloqueoVigenteDto {
  @ApiProperty({ format: 'uuid' }) dispositivoId!: string;
  @ApiProperty({ type: Boolean }) bloqueado!: boolean;
  @ApiProperty() motivo!: string;
  @ApiProperty({ format: 'uuid' }) operadorId!: string;
  @ApiProperty() rol!: string;
  @ApiProperty({ format: 'date-time' }) desde!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['aceptada', 'rechazada', 'inalcanzable'],
  })
  resultado!: string | null;
  @ApiProperty({ type: String, nullable: true }) detalle!: string | null;
}

export class BloqueosVigentesDto {
  @ApiProperty({ type: [BloqueoVigenteDto] }) bloqueos!: BloqueoVigenteDto[];
}
