import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { TIPOS_DE_HECHO } from '../../comun/bitacora-de-identidad';

// ─── Entrada ────────────────────────────────────────────────────────────────

export class DatosDelPorteroDto {
  @ApiProperty({ type: String, maxLength: 200 })
  @IsString()
  @Length(1, 200)
  nombre!: string;

  @ApiPropertyOptional({ type: String, maxLength: 30, nullable: true })
  @IsOptional()
  @IsString()
  @Length(5, 30)
  @Matches(/^[0-9+() -]+$/, {
    message: 'el teléfono admite dígitos, espacios, +, guion y paréntesis',
  })
  telefono?: string;

  @ApiPropertyOptional({ type: String, maxLength: 254, nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  correoContacto?: string;

  @ApiPropertyOptional({ type: String, maxLength: 80, nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  porteria?: string;

  @ApiProperty({
    type: [String],
    maxItems: 50,
    description: 'Torres, sectores o fincas. INFORMATIVOS (P-17): no filtran alarmas.',
  })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Length(1, 60, { each: true })
  sectores!: string[];
}

export class AltaDePorteroDto extends DatosDelPorteroDto {
  @ApiProperty({
    type: String,
    maxLength: 32,
    description: 'Identificación del portero como usuario',
  })
  @IsString()
  @Length(3, 32)
  usuario!: string;

  @ApiProperty({ type: String, maxLength: 256, format: 'password' })
  @IsString()
  @Length(1, 256)
  contrasenaInicial!: string;
}

export class DatosDeTurnoDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  porteroId!: string;

  @ApiPropertyOptional({ type: String, maxLength: 80, nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  porteria?: string;

  @ApiProperty({
    type: String,
    example: '2026-09-25',
    description: 'Día en la zona de la copropiedad',
  })
  @IsString()
  @Length(10, 10)
  dia!: string;

  @ApiProperty({ type: String, example: '22:00' })
  @IsString()
  @Length(5, 5)
  horaInicio!: string;

  @ApiProperty({
    type: String,
    example: '06:00',
    description: 'Si no es posterior al inicio, cruza la medianoche',
  })
  @IsString()
  @Length(5, 5)
  horaFin!: string;

  @ApiProperty({ type: String, enum: ['programado', 'extra'] })
  @IsIn(['programado', 'extra'])
  tipo!: 'programado' | 'extra';

  @ApiPropertyOptional({
    type: String,
    maxLength: 300,
    description: 'Obligatorio en un turno extra',
  })
  @IsOptional()
  @IsString()
  @Length(1, 300)
  motivo?: string;
}

export class RetiroDeTurnoDto {
  @ApiProperty({ type: String, maxLength: 300 })
  @IsString()
  @Length(5, 300)
  motivo!: string;
}

export class RangoDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @IsString()
  @Length(10, 40)
  desde!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @IsString()
  @Length(10, 40)
  hasta!: string;
}

export class ConsultaDeBitacoraDto extends RangoDto {
  @ApiPropertyOptional({ type: String, enum: TIPOS_DE_HECHO })
  @IsOptional()
  @IsIn([...TIPOS_DE_HECHO])
  tipo?: (typeof TIPOS_DE_HECHO)[number];
}

export class DesbloqueoDto {
  @ApiProperty({ type: String, example: '0427', description: 'El código que la consola mostraba' })
  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'el código son 4 dígitos' })
  codigo!: string;
}

// ─── Salida ─────────────────────────────────────────────────────────────────

export class TurnoDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) porteroId!: string;
  @ApiProperty({ type: String, nullable: true }) porteria!: string | null;
  @ApiProperty({ type: String }) dia!: string;
  @ApiProperty({ type: String }) horaInicio!: string;
  @ApiProperty({ type: String }) horaFin!: string;
  @ApiProperty({ type: String, format: 'date-time' }) inicio!: string;
  @ApiProperty({ type: String, format: 'date-time' }) fin!: string;
  @ApiProperty({ type: Boolean }) cruzaMedianoche!: boolean;
  @ApiProperty({ type: String, enum: ['programado', 'extra'] }) tipo!: 'programado' | 'extra';
  @ApiProperty({ type: String, nullable: true }) motivo!: string | null;
}

export class TurnoGuardadoDto {
  @ApiProperty({ type: TurnoDto }) turno!: TurnoDto;
  @ApiProperty({
    type: [TurnoDto],
    description: 'Solapes con la misma portería: se permiten y se registran',
  })
  solapes!: TurnoDto[];
}

export class TurnosDto {
  @ApiProperty({ type: [TurnoDto] }) turnos!: TurnoDto[];
}

export class SesionAbiertaDto {
  @ApiProperty({ type: String, enum: ['activa', 'patrullaje'] }) estado!: 'activa' | 'patrullaje';
  @ApiProperty({ type: String, format: 'date-time' }) iniciadaEn!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) patrullajeDesde!:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true, description: 'Origen que declaró la consola' })
  origen!: string | null;
}

export class PorteroDto {
  @ApiProperty({ type: String, format: 'uuid' }) usuarioId!: string;
  @ApiProperty({ type: String, nullable: true }) usuario!: string | null;
  @ApiProperty({ type: String }) nombre!: string;
  @ApiProperty({ type: String, nullable: true }) telefono!: string | null;
  @ApiProperty({ type: String, nullable: true }) correoContacto!: string | null;
  @ApiProperty({ type: String, nullable: true }) porteria!: string | null;
  @ApiProperty({ type: [String] }) sectores!: string[];
  @ApiProperty({ type: Boolean }) debeCambiarContrasena!: boolean;
  @ApiProperty({ type: TurnoDto, nullable: true }) turnoVigente!: TurnoDto | null;
  @ApiProperty({ type: SesionAbiertaDto, nullable: true }) sesionAbierta!: SesionAbiertaDto | null;
}

export class PorterosDto {
  @ApiProperty({ type: [PorteroDto] }) porteros!: PorteroDto[];
}

export class PorteroCreadoDto {
  @ApiProperty({ type: String, format: 'uuid' }) usuarioId!: string;
}

export class HechoDeBitacoraDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, enum: TIPOS_DE_HECHO }) tipo!: (typeof TIPOS_DE_HECHO)[number];
  @ApiProperty({ type: String, format: 'date-time' }) ocurridoEn!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) usuarioId!: string | null;
  @ApiProperty({ type: String, nullable: true }) nombreUsuario!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) actorId!: string | null;
  @ApiProperty({ type: String, nullable: true }) nombreActor!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) turnoId!: string | null;
  @ApiProperty({ type: Number, nullable: true }) duracionSegundos!: number | null;
  @ApiProperty({ type: String, nullable: true, description: 'Dirección que llamó a la API' })
  origenIp!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Dirección del navegador según la consola',
  })
  origenDeclarado!: string | null;
  @ApiProperty({ type: String, nullable: true }) agente!: string | null;
  @ApiProperty({ type: String, nullable: true }) detalle!: string | null;
}

export class BitacoraDePorteriaDto {
  @ApiProperty({ type: [HechoDeBitacoraDto] }) hechos!: HechoDeBitacoraDto[];
}

export class EstadoDeSesionDto {
  @ApiProperty({
    type: String,
    enum: ['activa', 'patrullaje', 'cerrada', 'fuera_de_turno', 'sin_registro'],
  })
  estado!: 'activa' | 'patrullaje' | 'cerrada' | 'fuera_de_turno' | 'sin_registro';
  @ApiProperty({ type: String, nullable: true, description: 'Sólo con la sesión activa' })
  codigo!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) turnoInicio!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) turnoFin!: string | null;
  @ApiProperty({ type: String, nullable: true }) porteria!: string | null;
  @ApiProperty({ type: Number, nullable: true }) intentosRestantes!: number | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) patrullajeDesde!:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true }) motivoCierre!: string | null;
}

export class ResultadoDeDesbloqueoDto {
  @ApiProperty({
    type: String,
    enum: ['desbloqueada', 'incorrecto', 'agotado', 'no_en_patrullaje'],
  })
  resultado!: 'desbloqueada' | 'incorrecto' | 'agotado' | 'no_en_patrullaje';
}

export class HechoDePorteriaDto {
  @ApiProperty({ type: String, enum: ['portero_editado', 'turno_retirado'] })
  hecho!: 'portero_editado' | 'turno_retirado';
}
