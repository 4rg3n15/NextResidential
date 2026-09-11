import { ApiProperty } from '@nestjs/swagger';
import { ROLES } from '../autenticacion';

export class CopropiedadDto {
  @ApiProperty({ format: 'uuid' }) id!: string;

  @ApiProperty({
    enum: [...ROLES],
    description: 'Rol con el que el llamante alcanza esta copropiedad',
  })
  alcance!: string;
}

export class IngestaAceptadaDto {
  @ApiProperty({ example: true }) aceptado!: boolean;
}

export class CopropiedadResumenDto {
  @ApiProperty({ format: 'uuid' }) id!: string;

  @ApiProperty({ example: 'Urbanización Mira' }) nombre!: string;

  @ApiProperty({
    example: 'America/Bogota',
    description:
      'Decide qué significa «hoy» en el tablero. Viaja con cada copropiedad porque un ' +
      'superadministrador puede conmutar entre husos distintos en la misma sesión.',
  })
  zonaHoraria!: string;
}

export class AlcanceDeCopropiedadesDto {
  @ApiProperty({
    type: [CopropiedadResumenDto],
    description:
      'Las copropiedades que el token alcanza, y solo esas. Para el superadministrador ' +
      'son todas las activas; para un administrador, la suya; para un operador de ' +
      'central, las de su turno. Un arreglo vacío es una respuesta legítima.',
  })
  copropiedades!: CopropiedadResumenDto[];

  @ApiProperty({
    description:
      'true cuando el alcance es global y no viene de una pertenencia concreta ' +
      '(superadministrador). La consola lo usa para explicar por qué puede conmutar.',
  })
  alcanceGlobal!: boolean;
}

/**
 * Configuración de una copropiedad: lo editable, lo de solo lectura, y **qué
 * puede tocar el llamante**.
 *
 * `editables` viaja en la respuesta a propósito. La alternativa —que la consola
 * reprodujera la tabla de permisos— garantiza que las dos se separen: el día
 * que un ajuste cambie de rol, la consola seguiría pintando el campo abierto y
 * el servidor devolviendo 422. Aquí la regla se declara una vez, en la API, y
 * la consola la obedece.
 */
export class ConfiguracionDeCopropiedadDto {
  @ApiProperty({ example: 'Urbanización Mira' }) nombre!: string;
  @ApiProperty({ example: 'America/Bogota' }) zonaHoraria!: string;

  @ApiProperty({
    example: 0.85,
    description:
      'Por debajo de este valor la lectura de placa NO decide sola: escala al portero ' +
      '(CU-01, excepción 3a). Sólo el superadministrador lo cambia.',
  })
  umbralConfianzaPlaca!: number;

  @ApiProperty({
    enum: ['denegar', 'escalar_portero'],
    description:
      'Respuesta del Edge cuando la regla no está en su caché (RN-16). «denegar» es el ' +
      'valor conservador que impone §2.1.4.',
  })
  politicaContingenciaEdge!: string;

  @ApiProperty({ example: 5 }) umbralLatidoMinutos!: number;

  @ApiProperty({ description: 'Solo lectura: identidad fiscal, con índice único.' })
  nit!: string;

  @ApiProperty({ description: 'Solo lectura: suspender un tenant no es configurar.' })
  estado!: string;

  @ApiProperty({
    example: 24,
    description: 'Solo lectura: cota legal de la Ley 1581 de 2012, no valor por defecto.',
  })
  plazoConsentimientoHoras!: number;

  @ApiProperty({
    example: 24,
    description: 'Solo lectura: sostiene el marcado de decisión con caché obsoleto (KPI-31).',
  })
  margenCacheReglasHoras!: number;

  @ApiProperty({ example: 3 }) versionReglasActual!: number;

  @ApiProperty({
    type: [String],
    description: 'Ajustes que ESTE rol puede cambiar. La consola deshabilita el resto.',
  })
  editables!: string[];
}

export class RechazoDeAjusteDto {
  @ApiProperty({ example: 'umbralConfianzaPlaca' }) clave!: string;
  @ApiProperty({ example: 'debe estar entre 0,500 y 1,000' }) motivo!: string;
}

export class ConfiguracionRechazadaDto {
  @ApiProperty({ example: 422 }) codigo!: number;

  @ApiProperty({
    type: [RechazoDeAjusteDto],
    description:
      'TODOS los rechazos, no el primero: quien corrige un formulario necesita ver los ' +
      'cinco errores de una vez, no descubrirlos de uno en uno.',
  })
  rechazos!: RechazoDeAjusteDto[];
}
