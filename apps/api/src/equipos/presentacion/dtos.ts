import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
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

  /**
   * Guardar un equipo que todavía no está instalado es legítimo: se monta el
   * lunes. Lo que no es legítimo es que la pantalla diga que está verificado.
   */
  @ApiPropertyOptional({ type: Boolean, default: true })
  @IsOptional()
  probarConexion?: boolean;
}

export class BajaDeEquipoDto {
  @ApiProperty({ type: String, maxLength: 300 })
  @IsString()
  @Length(3, 300)
  motivo!: string;
}

export class EquipoDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) nombre!: string;
  @ApiProperty({ type: String, enum: TIPOS_DE_EQUIPO }) tipo!: string;
  @ApiProperty({ type: String }) host!: string;
  @ApiProperty({ type: Number }) puerto!: number;
  @ApiProperty({ type: String, enum: ['http', 'https'] }) protocolo!: string;
  @ApiProperty({ type: String, nullable: true }) usuario!: string | null;
  @ApiProperty({ type: String, nullable: true }) modelo!: string | null;
  @ApiProperty({ type: String, nullable: true }) firmware!: string | null;
  @ApiProperty({ type: Number, nullable: true }) canalBarrera!: number | null;
  @ApiProperty({ type: Number, nullable: true }) numeroDePuerta!: number | null;
  @ApiProperty({ type: Number, nullable: true }) canalDeAudio!: number | null;
  @ApiProperty({ type: String, enum: ['no_verificado', 'verificado', 'rechazado'] })
  verificacion!: string;
  @ApiProperty({ type: String, nullable: true }) verificadoEn!: string | null;
  @ApiProperty({ type: String, nullable: true }) motivoNoVerificado!: string | null;
  @ApiProperty({ type: String, enum: ['activo', 'inactivo'] }) estado!: string;
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

export class FichaDelEquipoDto {
  @ApiProperty({ type: String, nullable: true }) modelo!: string | null;
  @ApiProperty({ type: String, nullable: true }) firmware!: string | null;
  @ApiProperty({ type: String, nullable: true }) serie!: string | null;
  @ApiProperty({ type: String, nullable: true }) horaDelEquipo!: string | null;
  @ApiProperty({ type: Number, nullable: true }) desvioDeRelojSegundos!: number | null;
  @ApiProperty({ type: [HallazgoDelEquipoDto] }) hallazgos!: HallazgoDelEquipoDto[];
  @ApiProperty({ type: [String] }) sinComprobar!: string[];
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
    type: FichaDelEquipoDto,
    description:
      'Qué hay que cambiar en el equipo, campo por campo. Ausente cuando no se sondeó: la ' +
      'falta de ficha no es una ficha vacía.',
  })
  ficha?: FichaDelEquipoDto;
}

export class EquiposDto {
  @ApiProperty({ type: [EquipoDto] }) equipos!: EquipoDto[];
}
