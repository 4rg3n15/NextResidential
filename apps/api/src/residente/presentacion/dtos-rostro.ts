import { ApiProperty } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MAX_BASE64_FOTOGRAFIA, MedidasDeFotoDto } from '../../visitas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · D2 · LO QUE ENTRA Y SALE DE «MI ROSTRO»
 *
 * Entra la foto —tipo declarado, base64 acotado ANTES de decodificar, medidas
 * de calidad—, la versión de la política que se mostró y la aceptación. Nada
 * más: ni `titularId`, ni `personaId`, ni `suprimirEn`, ni `estado`; el
 * `ValidationPipe` global (`forbidNonWhitelisted`) responde 400 a cualquiera
 * de ellos (asignación masiva). Sale el estado, NUNCA la imagen.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export class MiRostroDto {
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

  @ApiProperty({ description: 'La versión de la política que la app mostró', maxLength: 60 })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  versionPolitica!: string;

  // Booleano llano en el contrato, sin `enum: [true]`: el generador de Dart no
  // sabe emitir un enum booleano y el cliente no compilaría (como en la 15-W).
  // La verdad la pone `@Equals(true)`: un `false` es un 400.
  @ApiProperty({ type: Boolean, description: 'Acepta la política: debe ser true' })
  @IsBoolean()
  @Equals(true, { message: 'Hay que aceptar la política del rostro para registrarlo' })
  aceptaPolitica!: boolean;
}

/**
 * 15-X · D3 · el rostro de un menor de 15 a 17 años: lo mismo que el propio y
 * las dos declaraciones del titular como representante legal, las dos `true`
 * (booleano llano en el contrato, como `aceptaPolitica`). Ni `personaId` ni
 * `titularId`: el menor sale de la ruta, filtrado por la vivienda del ámbito.
 */
export class RostroDeMenorDto extends MiRostroDto {
  @ApiProperty({ type: Boolean, description: 'Soy su representante legal: debe ser true' })
  @IsBoolean()
  @Equals(true, { message: 'Hay que declarar que es su representante legal' })
  declaraRepresentacionLegal!: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'El menor fue informado y está de acuerdo: debe ser true',
  })
  @IsBoolean()
  @Equals(true, { message: 'El menor tiene que estar informado y de acuerdo' })
  menorInformadoYDeAcuerdo!: boolean;
}

export class EquipoDelRostroDto {
  @ApiProperty() nombre!: string;
  @ApiProperty({ enum: ['sincronizada', 'pendiente', 'fallida'] }) estado!: string;
}

export class PoliticaDelRostroDto {
  @ApiProperty() version!: string;
  @ApiProperty() texto!: string;
}

export class EstadoDeMiRostroDto {
  @ApiProperty({
    enum: ['sin_rostro', 'pendiente', 'activa', 'parcial', 'por_vencer', 'en_retiro'],
  })
  estado!: string;
  @ApiProperty({ type: Number, nullable: true }) calidad!: number | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) registradoEn!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) venceEn!: string | null;
  @ApiProperty({ type: Number, nullable: true }) diasParaVencer!: number | null;
  @ApiProperty() equiposConRostro!: number;
  @ApiProperty() equiposConMiRostro!: number;
  @ApiProperty({ type: [EquipoDelRostroDto] }) equipos!: EquipoDelRostroDto[];
}

export class MiRostroConPoliticaDto extends EstadoDeMiRostroDto {
  @ApiProperty({ type: PoliticaDelRostroDto }) politica!: PoliticaDelRostroDto;
}
