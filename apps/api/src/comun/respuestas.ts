import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { MOTIVOS_ACCESO } from '@ncr/domain-core';

/**
 * Cuerpo de error de la API, tal como lo emite `FiltroGlobalDeExcepciones`.
 *
 * Se declara para que el cliente generado tenga un tipo también en el camino de
 * fallo. Sin esto la consola recibe `unknown` en cada `catch` y termina
 * inspeccionando el error con comparaciones de cadena — que es exactamente lo
 * que esta etapa vino a eliminar.
 *
 * `mensaje` es `string | object` porque el `ValidationPipe` devuelve un arreglo
 * de mensajes de validación y el resto de excepciones, una cadena. Se declara
 * la unión real en vez de mentir con `string`: un contrato que promete menos de
 * lo que entrega obliga al consumidor a hacer `as`, y ahí se pierde el tipado.
 */
export class DetalleDeErrorDto {
  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    description:
      'Un mensaje, o el arreglo que devuelve el ValidationPipe con un renglón por campo ' +
      'rechazado. La consola muestra el arreglo campo a campo; una cadena, tal cual.',
  })
  message!: string | string[];

  @ApiProperty({ type: String, required: false, example: 'Bad Request' })
  error?: string;

  @ApiProperty({ type: Number, required: false, example: 400 })
  statusCode?: number;
}

@ApiExtraModels(DetalleDeErrorDto)
export class ErrorApiDto {
  @ApiProperty({ type: Number, example: 404, description: 'Código HTTP, repetido en el cuerpo' })
  estado!: number;

  @ApiProperty({
    type: String,
    example: 'a1b2c3d4',
    description: 'Identificador de correlación para seguir la petición en la bitácora',
  })
  correlacion!: string;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { $ref: getSchemaPath(DetalleDeErrorDto) }],
    description:
      'Detalle para el cliente en 4xx. En 5xx es siempre «Error interno»: el mensaje ' +
      'original no sale, porque suele llevar nombres de tabla o fragmentos de consulta.',
  })
  mensaje!: string | DetalleDeErrorDto;
}

/**
 * Los diez motivos de denegación del dominio, listados desde `MOTIVOS_ACCESO`.
 *
 * Se toma la constante y no una copia escrita a mano: la undécima que alguien
 * añada al dominio aparece sola en el contrato, y la consola —que discrimina
 * por este enumerado y no por el texto— la recibe tipada el mismo día.
 */
export const ENUM_MOTIVO_ACCESO = [...MOTIVOS_ACCESO];
