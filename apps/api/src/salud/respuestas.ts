import { ApiProperty } from '@nestjs/swagger';

export class SaludDto {
  @ApiProperty({ example: 'vivo' }) estado!: string;
  @ApiProperty({ format: 'date-time' }) momento!: string;
}

export class ListoDto {
  @ApiProperty({ example: 'listo' }) estado!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Estado por dependencia. Un 503 devuelve esta misma forma con el detalle.',
    example: { configuracion: 'ok', jwks: 'ok', postgres: 'no-conectado-etapa-04' },
  })
  dependencias!: Record<string, string>;
}
