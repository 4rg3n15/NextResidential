import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { TIPOS_DE_EQUIPO } from '../aplicacion/puertos';

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
}

export class EquiposDto {
  @ApiProperty({ type: [EquipoDto] }) equipos!: EquipoDto[];
}
