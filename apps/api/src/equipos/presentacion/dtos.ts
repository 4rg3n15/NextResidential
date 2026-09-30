import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { AtestacionDeEquipoDto } from './dtos-atestacion';
import { EstadoDelEquipoDto } from './dto-estado-del-equipo';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { CORRECCIONES, TIPOS_DE_EQUIPO } from '../aplicacion/puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL SECRETO ENTRA POR AQUÍ Y NO SALE POR NINGUNA PARTE
 *
 * `AltaDeEquipoDto` —lo que entra— tiene `secreto`. `EquipoDto` —lo que sale—
 * **no tiene el campo**. Ni enmascarado ni vacío: el tipo generado para la
 * consola no lo declara, así que ni siquiera existe una propiedad que alguien
 * pueda rellenar por descuido dentro de seis meses.
 *
 * Un enmascarado («••••») habría sido peor que inútil: obliga a la consola a
 * distinguir «no lo cambies» de «ponlo a puntos», y el día que alguien reenvíe
 * el formulario entero la credencial del equipo pasa a ser literalmente
 * «••••••». Aquí, `secreto` ausente significa «no lo cambies» y punto.
 */
export class AltaDeEquipoDto {
  @ApiProperty({ type: String, maxLength: 120 })
  @IsString()
  @Length(1, 120)
  nombre!: string;

  @ApiProperty({ type: String, enum: TIPOS_DE_EQUIPO })
  @IsIn([...TIPOS_DE_EQUIPO])
  tipo!: (typeof TIPOS_DE_EQUIPO)[number];

  /**
   * IP o nombre. El patrón es de FORMA: impide que un «203.0.113.10 (la de la
   * entrada)» entre como host y produzca un «no responde» incomprensible.
   */
  @ApiProperty({ type: String, example: '203.0.113.10' })
  @IsString()
  @Length(3, 253)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9.-]*$/, {
    message: 'el host es una IP o un nombre, sin espacios ni comentarios',
  })
  host!: string;

  @ApiProperty({ type: Number, example: 80 })
  @IsInt()
  @Min(1)
  @Max(65535)
  puerto!: number;

  @ApiProperty({ type: String, enum: ['http', 'https'], default: 'http' })
  @IsIn(['http', 'https'])
  protocolo!: 'http' | 'https';

  @ApiProperty({ type: String, maxLength: 64 })
  @IsString()
  @Length(1, 64)
  usuario!: string;

  /** Ausente al editar = «no lo cambies». Obligatorio al dar de alta. */
  @ApiPropertyOptional({ type: String, maxLength: 128, writeOnly: true })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  secreto?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(16)
  canalBarrera?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(16)
  numeroDePuerta?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(16)
  canalDeAudio?: number;

  /** INFORMATIVO (O2): se muestra y se audita; ninguna decisión lo mira. */
  @ApiPropertyOptional({ type: String, maxLength: 80 })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  fabricante?: string;

  /** Terminal facial: lo que DECLARA ser. No se deduce del aparato (D2). */
  @ApiPropertyOptional({ type: String, enum: ['reporta_y_espera', 'decide_el_equipo'] })
  @IsOptional()
  @IsIn(['reporta_y_espera', 'decide_el_equipo'])
  modoDeTerminal?: 'reporta_y_espera' | 'decide_el_equipo';

  /** Si una persona habilitó el canal de audio EN EL APARATO (ADR-01). */
  @ApiPropertyOptional({ type: Boolean, default: false })
  @IsOptional()
  @IsBoolean()
  canalDeAudioHabilitado?: boolean;

  /**
   * C2/D2 (15-L) · el flujo de video: canal×100+flujo de la guía del
   * fabricante (101 el principal del canal 1, 102 su subflujo). Sin él, 102.
   */
  @ApiPropertyOptional({ type: String, pattern: '^[1-9][0-9]{2,3}$', example: '102' })
  @IsOptional()
  @IsString()
  @Length(3, 4)
  @Matches(/^[1-9][0-9]{2,3}$/, { message: 'canalDeVideo es canal×100+flujo, p. ej. 102' })
  canalDeVideo?: string;

  /** C2 (15-L) · la zona de la copropiedad donde está el equipo. */
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  zonaId?: string;

  /**
   * Guardar un equipo que todavía no está instalado es legítimo: se monta el
   * lunes. Lo que no es legítimo es que la pantalla diga que está verificado.
   */
  @ApiPropertyOptional({ type: Boolean, default: true })
  @IsOptional()
  probarConexion?: boolean;
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EDICIÓN · todo opcional, y lo ausente se CONSERVA (§6.1: leer-modificar-escribir)
 *
 * El cliente no recibe nunca la dirección ni el usuario del equipo (§7.1), así
 * que tampoco puede reenviarlos «tal cual» al editar. Lo que no viene, se deja
 * como está; lo que viene, sustituye. El secreto sigue la misma regla desde la
 * 15-B: ausente = no lo cambies.
 */
export class EdicionDeEquipoDto extends PartialType(
  OmitType(AltaDeEquipoDto, ['zonaId'] as const),
) {
  /**
   * O2 (15-N) · DT-15M-04 · la edición es parcial y lo ausente se conserva;
   * por eso «sin zona» no puede ser «ausente». `null` la QUITA; ausente no la
   * toca. Cualquier otro valor tiene que ser un UUID, como en el alta.
   */
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  zonaId?: string | null;
}

export class BajaDeEquipoDto {
  /** C4 (15-M) · el motivo es la constancia de la baja (RN-19): cinco letras como mínimo. */
  @ApiProperty({ type: String, minLength: 5, maxLength: 300 })
  @IsString()
  @Length(5, 300, { message: 'El motivo de la baja debe tener entre 5 y 300 caracteres' })
  motivo!: string;
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LAS CAPACIDADES · O2, ETAPA 15-D
 *
 * Tres estados por capacidad, y `desconocida` NO se pinta como `si`: es lo
 * que la consola tiene que enseñar para que quien mira la ficha sepa qué
 * puede pedirle a ese equipo y qué falta por descubrir.
 */
const ESTADOS_DE_CAPACIDAD = ['si', 'no', 'desconocida'] as const;

export class CapacidadDeBibliotecaDto {
  @ApiProperty({ type: String, enum: ESTADOS_DE_CAPACIDAD }) estado!: string;
  @ApiProperty({ type: Number, nullable: true }) maximo!: number | null;
  @ApiProperty({ type: Number, nullable: true }) almacenadas!: number | null;
}

export class CapacidadDeAudioDto {
  @ApiProperty({ type: String, enum: ESTADOS_DE_CAPACIDAD }) estado!: string;
  @ApiProperty({ type: Number, nullable: true }) canal!: number | null;
  @ApiProperty({ type: String, nullable: true }) formato!: string | null;
}

/** E2/C1 (15-M) · un canal de video que el equipo declara en su lista de flujos. */
export class CanalDeVideoDto {
  @ApiProperty({ type: String, description: 'canal×100+flujo, p. ej. 102' }) id!: string;
  @ApiProperty({ type: String, nullable: true, description: '«H.264», «H.265»…' })
  codec!: string | null;
}

/** D2 (15-L) · el video que el equipo describe por RTSP. */
export class CapacidadDeVideoDto {
  @ApiProperty({ type: String, enum: ESTADOS_DE_CAPACIDAD }) estado!: string;
  @ApiProperty({ type: String, nullable: true, description: '«H.264», «H.265»…' })
  codec!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Canal preguntado (canal×100+flujo)' })
  canal!: string | null;
  /** E2/C1 · los canales descubiertos; ausente si el equipo no los listó. */
  @ApiProperty({
    type: [CanalDeVideoDto],
    required: false,
    description: 'Canales de video que el equipo declara; la ficha los ofrece en una lista',
  })
  canales?: readonly CanalDeVideoDto[];
}

export class CapacidadesDeEquipoDto {
  @ApiProperty({ type: String, enum: ['descubiertas', 'declaradas', 'sin_consultar'] })
  origen!: string;
  @ApiProperty({ type: String, enum: ESTADOS_DE_CAPACIDAD }) aperturaRemota!: string;
  @ApiProperty({ type: String, enum: ESTADOS_DE_CAPACIDAD }) verificacionRemota!: string;
  @ApiProperty({ type: CapacidadDeBibliotecaDto }) bibliotecaDeRostros!: CapacidadDeBibliotecaDto;
  @ApiProperty({ type: String, enum: ESTADOS_DE_CAPACIDAD }) gestionDePersonas!: string;
  @ApiProperty({ type: CapacidadDeAudioDto }) audioBidireccional!: CapacidadDeAudioDto;
  @ApiProperty({ type: String, enum: ESTADOS_DE_CAPACIDAD }) senalizacionDeLlamada!: string;
  @ApiProperty({ type: String, enum: ESTADOS_DE_CAPACIDAD }) suscripcionDeEventos!: string;
  @ApiProperty({ type: String, enum: ESTADOS_DE_CAPACIDAD }) reconocimientoDePlacas!: string;
  @ApiProperty({ type: String, enum: ESTADOS_DE_CAPACIDAD }) estadoDeBarrera!: string;
  @ApiProperty({ type: CapacidadDeVideoDto }) video!: CapacidadDeVideoDto;
}

/**
 * Lo que la consola RECIBE de un equipo. **Sin dirección, puerto, protocolo ni
 * usuario** (ETAPA 15-D, §7.1): el cliente nunca necesita conocer la red
 * privada del conjunto; con el equipo habla el servidor. Hasta la 15-C la
 * dirección salía para los roles administrativos (C-11); C-28 lo revoca.
 */
export class EquipoDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) nombre!: string;
  @ApiProperty({ type: String, enum: TIPOS_DE_EQUIPO }) tipo!: string;
  @ApiProperty({ type: String, nullable: true }) modelo!: string | null;
  @ApiProperty({ type: String, nullable: true }) firmware!: string | null;
  @ApiProperty({ type: Number, nullable: true }) canalBarrera!: number | null;
  @ApiProperty({ type: Number, nullable: true }) numeroDePuerta!: number | null;
  @ApiProperty({ type: Number, nullable: true }) canalDeAudio!: number | null;
  @ApiProperty({ type: String, nullable: true }) fabricante!: string | null;
  @ApiProperty({ type: String, nullable: true, enum: ['reporta_y_espera', 'decide_el_equipo'] })
  modoDeTerminal!: string | null;
  @ApiProperty({ type: Boolean }) canalDeAudioHabilitado!: boolean;
  @ApiProperty({ type: String, nullable: true, description: 'Flujo de video; `null` = 102' })
  canalDeVideo!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) zonaId!: string | null;
  @ApiProperty({ type: CapacidadesDeEquipoDto, nullable: true })
  capacidades!: CapacidadesDeEquipoDto | null;
  @ApiProperty({ type: String, enum: ['no_verificado', 'verificado', 'rechazado'] })
  verificacion!: string;
  @ApiProperty({ type: String, nullable: true }) verificadoEn!: string | null;
  @ApiProperty({ type: String, nullable: true }) motivoNoVerificado!: string | null;
  @ApiProperty({ type: String, enum: ['activo', 'inactivo'] }) estado!: string;
  @ApiProperty({
    type: AtestacionDeEquipoDto,
    nullable: true,
    description:
      'D-11 · la atestación física más reciente del instalador, con su vigencia. `null` si ' +
      'nunca se atestó.',
  })
  atestacion!: AtestacionDeEquipoDto | null;
  /** E5 (15-M) · el estado unificado: lista, ficha y tablero, el mismo criterio. */
  @ApiProperty({ type: EstadoDelEquipoDto }) estadoDelEquipo!: EstadoDelEquipoDto;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) sondeadoEn!: string | null;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Cuándo se leyeron modelo y firmware del propio equipo («dato del …»)',
  })
  identidadLeidaEn!: string | null;
}

/**
 * C6 (15-M) · la respuesta del ALTA. Es un `EquipoDto` más el secreto con el
 * que la cámara publicará en el Alarm Server, que la API acaba de emitir y que
 * sale por aquí UNA sola vez: ninguna lectura posterior lo devuelve, y «Enviar
 * eventos a este Mac» lo escribe en la cámara sin enseñarlo. `null` para todo
 * lo que no es una cámara LPR.
 */
export class EquipoCreadoDto extends EquipoDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Secreto de Alarm Server de la cámara, emitido en el alta y mostrado SOLO aquí. ' +
      'La ruta que la cámara publica es /alarm-server/<secreto>. `null` si no es cámara LPR.',
  })
  secretoDelAlarmServer!: string | null;
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA FICHA · lo que la consola pinta de un equipo, con la MISMA forma por campo
 *
 * El diagnóstico devuelve seis veredictos con estructuras distintas, cada uno
 * fiel a lo que el equipo declara. Eso está bien para razonar y mal para
 * pintar: la consola acabaría con seis bloques que se parecen y no se parecen.
 *
 * Aquí todo es una lista de hallazgos con el mismo tipo. Y `no_comprobado` es
 * un estado propio: una consulta que el equipo no contestó **no es un verde**,
 * y pintarla igual sería el falso verde que este proyecto persigue.
 */
export class HallazgoDelEquipoDto {
  @ApiProperty({ type: String }) campo!: string;
  @ApiProperty({ type: String, enum: ['conforme', 'aviso', 'bloqueo', 'no_comprobado'] })
  estado!: string;
  @ApiProperty({ type: String, nullable: true }) valorLeido!: string | null;
  @ApiProperty({ type: String, nullable: true }) valorCorrecto!: string | null;
  @ApiProperty({ type: String }) detalle!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: [...CORRECCIONES],
    description: 'Qué corrección lo arregla desde la consola. Nulo si no la hay.',
  })
  correccion!: string | null;
}

export class DocumentoCrudoDelEquipoDto {
  @ApiProperty({ type: String }) titulo!: string;
  @ApiProperty({ type: String }) contenido!: string;
}

/** E4 (15-M) · a dónde publica el equipo, con la ruta sin su secreto. */
export class ReceptorDeLaFichaDto {
  @ApiProperty({ type: String, nullable: true }) host!: string | null;
  @ApiProperty({ type: Number, nullable: true }) puerto!: number | null;
  @ApiProperty({ type: String, description: 'La ruta con el secreto oculto: /alarm-server/••••' })
  ruta!: string;
}

export class FichaDelEquipoDto {
  @ApiPropertyOptional({
    type: [ReceptorDeLaFichaDto],
    description: 'E4 · los receptores («HTTP listening») que el equipo tiene escritos',
  })
  receptores?: ReceptorDeLaFichaDto[];
  @ApiProperty({ type: String, nullable: true }) modelo!: string | null;
  @ApiProperty({ type: String, nullable: true }) firmware!: string | null;
  @ApiProperty({ type: String, nullable: true }) serie!: string | null;
  @ApiProperty({ type: String, nullable: true }) horaDelEquipo!: string | null;
  @ApiProperty({ type: Number, nullable: true }) desvioDeRelojSegundos!: number | null;
  @ApiProperty({ type: [HallazgoDelEquipoDto] }) hallazgos!: HallazgoDelEquipoDto[];
  @ApiProperty({ type: [String] }) sinComprobar!: string[];
  @ApiPropertyOptional({
    type: [DocumentoCrudoDelEquipoDto],
    description:
      'H-SITIO-01 · lo que el equipo CONTESTÓ, saneado (sin claves, IPs enmascaradas), ' +
      'para leer el veredicto contra el documento y no contra una interpretación. ' +
      'Ausente cuando la familia no lo aporta.',
  })
  crudos?: DocumentoCrudoDelEquipoDto[];
}

/**
 * Lo que la consola envía para corregir un campo del equipo.
 *
 * `confirmadaPor` no es un adorno de auditoría: **sin él no se emite la
 * petición al aparato**. Cambiar quién controla una barrera es la clase de
 * acción que nadie ve venir si la hace un proceso automático.
 */
export class CorreccionDeEquipoDto {
  @ApiProperty({ type: String, enum: [...CORRECCIONES] })
  @IsIn([...CORRECCIONES])
  correccion!: (typeof CORRECCIONES)[number];

  @ApiProperty({
    type: String,
    maxLength: 300,
    description: 'Por qué se corrige. Queda en la auditoría junto a quién y cuándo.',
  })
  @IsString()
  @Length(3, 300)
  motivo!: string;
}

export class ResultadoDeCorreccionDto {
  @ApiProperty({ type: String, enum: [...CORRECCIONES] }) correccion!: string;
  @ApiProperty({ type: Boolean }) aplicada!: boolean;
  @ApiProperty({ type: String, nullable: true }) valorAnterior!: string | null;
  @ApiProperty({ type: String, nullable: true }) valorNuevo!: string | null;
  @ApiProperty({ type: String }) detalle!: string;
}

export class ResultadoDeSondeoDto {
  @ApiProperty({
    type: String,
    enum: ['alcanzado', 'decide_solo', 'credencial', 'inalcanzable'],
    description:
      'Cuatro resultados distintos, nunca uno genérico: cada uno se resuelve de una manera.',
  })
  clase!: string;

  @ApiProperty({ type: String }) detalle!: string;
  @ApiProperty({ type: String, nullable: true }) modelo!: string | null;
  @ApiProperty({ type: String, nullable: true }) firmware!: string | null;
  @ApiProperty({ type: Number, nullable: true }) latenciaMs!: number | null;
  @ApiProperty({ type: Boolean }) verificado!: boolean;
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'E5 · 10 · cuando el sondeo actual no leyó modelo y firmware, la fecha en que se leyeron ' +
      'los que se enseñan («dato del DD-MM-YYYY»). Ausente o nulo = son de este sondeo.',
  })
  identidadDel?: string | null;
  @ApiPropertyOptional({
    type: FichaDelEquipoDto,
    description:
      'Qué hay que cambiar en el equipo, campo por campo. Ausente cuando no se sondeó: la ' +
      'falta de ficha no es una ficha vacía.',
  })
  ficha?: FichaDelEquipoDto;
  @ApiPropertyOptional({
    type: CapacidadesDeEquipoDto,
    description: 'Lo que el equipo declaró poder hacer. Ausente cuando no se alcanzó.',
  })
  capacidades?: CapacidadesDeEquipoDto;
}

export class EquiposDto {
  @ApiProperty({ type: [EquipoDto] }) equipos!: EquipoDto[];
}

/**
 * C4 (15-M) · la baja devuelve el equipo y lo que pasó con sus rostros: los
 * que se retiraron del aparato y los que quedaron PENDIENTES porque no
 * contestó (RN-11). Nunca se da por retirado lo que sigue en él.
 */
export class BajaDeEquipoResultadoDto extends EquipoDto {
  @ApiProperty({ type: Number }) plantillasRetiradas!: number;
  @ApiProperty({ type: Number, description: 'Siguen en el equipo: no contestó al retirarlas' })
  plantillasPendientes!: number;
}
