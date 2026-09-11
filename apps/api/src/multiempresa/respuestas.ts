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
