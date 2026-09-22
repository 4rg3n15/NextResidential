import { ApiProperty } from '@nestjs/swagger';

export class DefinicionKpiDto {
  @ApiProperty({ example: 'KPI-32' })
  clave!: string;

  @ApiProperty()
  titulo!: string;

  @ApiProperty({ description: 'Techo comprometido, en milisegundos' })
  umbralMs!: number;

  @ApiProperty({ description: 'Dónde arranca y dónde para el cronómetro' })
  segmento!: string;

  @ApiProperty({ description: 'Lo que la cifra NO contiene. Se lee antes que la cifra' })
  noIncluye!: string;

  @ApiProperty({ example: 'RNF-01.3' })
  rnf!: string;

  // `type` explícito: con `string | null` la reflexión de TypeScript entrega
  // `Object` y el esquema saldría sin forma. El contrato tiene que decir de qué
  // tipo es cada campo o el cliente generado lo tipa como `unknown`.
  @ApiProperty({ type: String, required: false, nullable: true, example: 'CA-20' })
  ca!: string | null;
}

export class FilaDeLatenciaDto {
  @ApiProperty({ type: DefinicionKpiDto })
  definicion!: DefinicionKpiDto;

  @ApiProperty({ description: 'Muestras dentro de la ventana deslizante' })
  muestras!: number;

  @ApiProperty({ description: 'Observaciones desde el arranque; no las borra la ventana' })
  observadas!: number;

  @ApiProperty({ description: 'Muestras por encima del umbral desde el arranque' })
  incumplimientos!: number;

  @ApiProperty({ type: Number, required: false, nullable: true })
  p50!: number | null;

  @ApiProperty({ type: Number, required: false, nullable: true })
  p95!: number | null;

  @ApiProperty({ type: Number, required: false, nullable: true })
  p99!: number | null;

  @ApiProperty({ type: Number, required: false, nullable: true })
  maximo!: number | null;

  @ApiProperty({
    type: Boolean,
    required: false,
    nullable: true,
    description: '`null` significa SIN MUESTRAS, que no es lo mismo que incumplir',
  })
  cumple!: boolean | null;
}

export class LatenciasDto {
  @ApiProperty({ description: 'Arranque del proceso que sirve esta respuesta' })
  desde!: string;

  @ApiProperty({ description: 'Tamaño de la ventana deslizante, en muestras' })
  ventana!: number;

  @ApiProperty({
    description:
      'Por proceso, no por despliegue: con varias instancias cada una lleva su ventana (D-29)',
  })
  porProceso!: boolean;

  @ApiProperty({ type: [FilaDeLatenciaDto] })
  filas!: FilaDeLatenciaDto[];
}
