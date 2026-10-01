import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      '15-O · por qué una dependencia no está `ok`, en palabras y sin el texto del error ' +
      '(la ruta es pública).',
    example: { postgres: 'el pooler no admite más clientes (límite de conexiones alcanzado)' },
  })
  motivos?: Record<string, string>;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      '15-O · lo que conviene saber y NO saca la API del balanceador: el planificador ' +
      '(pg-boss) parado o reintentando, un corte reciente de la base ya repuesto.',
    example: { planificador: 'reintentando: la base no respondió a tiempo; intento 2' },
  })
  avisos?: Record<string, string>;
}
