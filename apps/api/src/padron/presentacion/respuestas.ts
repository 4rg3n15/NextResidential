import { ApiProperty } from '@nestjs/swagger';

/**
 * DTOs de SALIDA del padrón — el contrato que consume la ETAPA 09-B.
 *
 * Tres reglas que el control `contrato-tipado.mjs` obliga a cumplir y que aquí
 * se cumplen a propósito, no por inercia:
 *
 *  1. **Son DTOs, no agregados.** Nada de esto se serializa desde una entidad
 *     de dominio: si un día `Vivienda` gana un campo interno, el contrato no se
 *     entera. Un agregado serializado crudo publica su interior en la primera
 *     refactorización que nadie revisa (§2.2).
 *  2. **Cada propiedad declara su `type`.** `@ApiProperty({ nullable: true })`
 *     sin `type` produce un esquema sin tipo, que `openapi-typescript` traduce
 *     a `Record<string, never>`: el DTO *parece* tipado y no lo está. Es el
 *     defecto que destapó el propio contrato en la 09-A.
 *  3. **No sale nada que no deba salir.** Ni identificadores de actor, ni
 *     campos de auditoría interna, ni referencias a bóveda.
 */
export class ViviendaDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) identificador!: string;
  @ApiProperty({ type: String, nullable: true }) manzana!: string | null;
  @ApiProperty({ type: String, nullable: true }) direccion!: string | null;
  @ApiProperty({ type: String, enum: ['activo', 'inactivo'] }) estado!: 'activo' | 'inactivo';
  @ApiProperty({ type: String }) estadoAdministrativo!: string;
  @ApiProperty({ type: Number }) residentes!: number;
  @ApiProperty({ type: Number }) vehiculos!: number;
  @ApiProperty({
    type: Number,
    description:
      'Autorizaciones vigentes que la vivienda conserva. RN-13: una vivienda inactiva no ' +
      'genera autorizaciones nuevas pero conserva las vigentes.',
  })
  autorizacionesVigentes!: number;
  @ApiProperty({ type: String, nullable: true }) desactivadaEn!: string | null;
  @ApiProperty({ type: String, nullable: true }) motivoDesactivacion!: string | null;
}

export class TotalesDeViviendasDto {
  @ApiProperty({ type: Number }) activas!: number;
  @ApiProperty({ type: Number }) inactivas!: number;
}

export class PaginaDeViviendasDto {
  @ApiProperty({ type: TotalesDeViviendasDto }) totales!: TotalesDeViviendasDto;
  @ApiProperty({ type: [ViviendaDto] }) viviendas!: ViviendaDto[];
}

export class VehiculoDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) placa!: string;
  @ApiProperty({ type: String, nullable: true }) marca!: string | null;
  @ApiProperty({ type: String, nullable: true }) modelo!: string | null;
  @ApiProperty({ type: String, nullable: true }) color!: string | null;
  @ApiProperty({ type: String, enum: ['automovil', 'motocicleta', 'bicicleta', 'otro'] })
  tipo!: string;
  @ApiProperty({ type: String, enum: ['activo', 'inactivo'] }) estado!: 'activo' | 'inactivo';
  @ApiProperty({ type: String, format: 'uuid' }) viviendaId!: string;
  @ApiProperty({ type: String }) viviendaIdentificador!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) propietarioId!: string | null;
  @ApiProperty({ type: String, nullable: true }) propietarioNombre!: string | null;
}

export class IdCreadoDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
}

export class BajaDto {
  @ApiProperty({ type: Boolean }) desactivado!: boolean;
}

export class ErrorDeFilaDto {
  @ApiProperty({ type: Number }) fila!: number;
  @ApiProperty({ type: String }) motivo!: string;
}

export class ResultadoDeCargaDto {
  @ApiProperty({ type: Number }) aceptadas!: number;
  @ApiProperty({
    type: [ErrorDeFilaDto],
    description: 'Errores fila a fila. Si hay uno solo, `aplicada` es falso: la carga es atómica.',
  })
  errores!: ErrorDeFilaDto[];
  @ApiProperty({
    type: Boolean,
    description: 'Verdadero solo si entró el padrón ENTERO. Una carga a medias no existe (HU-03).',
  })
  aplicada!: boolean;
  @ApiProperty({ type: Number }) filasLeidas!: number;
}
