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
  @ApiProperty({ type: String, nullable: true }) agrupacion!: string | null;
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

/**
 * Un grupo de la vista previa: el recuento y los extremos, no las 300.
 *
 * Ver que la Torre C acaba en 303 y no en 503 es lo que detecta un patrón mal
 * puesto; ver las trescientas no ayuda a nadie.
 */
export class GrupoProyectadoDto {
  @ApiProperty({ type: String, nullable: true }) agrupacion!: string | null;
  @ApiProperty({ type: Number }) cantidad!: number;
  @ApiProperty({ type: [String] }) primeras!: string[];
  @ApiProperty({ type: [String] }) ultimas!: string[];
  @ApiProperty({ type: Boolean }) porExcepcion!: boolean;
}

export class ViviendaProyectadaDto {
  @ApiProperty({ type: String, nullable: true }) agrupacion!: string | null;
  @ApiProperty({ type: String }) identificador!: string;
}

export class VistaPreviaDeGeneracionDto {
  @ApiProperty({ type: Number }) total!: number;
  @ApiProperty({ type: [GrupoProyectadoDto] }) grupos!: GrupoProyectadoDto[];
  @ApiProperty({
    type: [ViviendaProyectadaDto],
    description:
      'Las que ya existen activas. Con una sola, la confirmacion se niega entera: la ' +
      'generacion solo inserta y nunca sustituye nada.',
  })
  colisiones!: ViviendaProyectadaDto[];
}

export class GeneracionAplicadaDto {
  @ApiProperty({ type: Number }) creadas!: number;
  @ApiProperty({ type: Number, description: 'Ya existían y se dejaron como estaban.' })
  conservadas!: number;
  @ApiProperty({ type: Number, description: 'De baja, reactivadas por «sobrescribir».' })
  reactivadas!: number;
}

export class EdicionAplicadaDto {
  @ApiProperty({ type: Boolean }) editado!: boolean;
}

export class BorradoDefinitivoDeVehiculoDto {
  @ApiProperty({ type: Boolean }) borrado!: boolean;
  @ApiProperty({ type: String }) placa!: string;
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
  @ApiProperty({
    type: Number,
    description:
      'Viviendas que hubo que crear porque el identificador de la hoja no existía. Una errata ' +
      'crea una vivienda que nadie quería, y este número la delata en el momento (D-72).',
  })
  viviendasCreadas!: number;
  @ApiProperty({
    type: Number,
    description: 'Personas nuevas. Las que ya tenían ese documento se reutilizan (RN-06).',
  })
  personasCreadas!: number;
  @ApiProperty({
    type: Number,
    description:
      'Identificadores que traían la palabra dentro («Casa 42») y se guardaron sin ella. Se ' +
      'recorta y se cuenta: contarlo es lo que impide que el recorte sea silencioso.',
  })
  identificadoresRecortados!: number;
}

/**
 * Persona resuelta por el buscador (D-72).
 *
 * `esResidente` y `viviendaIdentificador` no son adorno: sin ellos, dos
 * homónimos son indistinguibles en la lista y quien autoriza elige a ciegas —
 * la misma clase de defecto que pedir el UUID, pero más difícil de ver.
 */
export class PersonaDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) nombreCompleto!: string;
  @ApiProperty({
    type: String,
    enum: ['cedula', 'cedula_extranjeria', 'pasaporte', 'nit', 'otro'],
  })
  tipoDocumento!: string;
  @ApiProperty({ type: String }) numeroDocumento!: string;
  @ApiProperty({ type: Boolean }) esResidente!: boolean;
  @ApiProperty({ type: String, nullable: true }) viviendaIdentificador!: string | null;
}

/**
 * Resultado del alta. `yaExistia` es la diferencia entre «creé a esta persona»
 * y «esta persona ya estaba con ese documento»: la consola lo dice en vez de
 * fingir un alta que no ocurrió (RN-06 — el documento ES la identidad).
 */
export class PersonaResueltaDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) nombreCompleto!: string;
  @ApiProperty({ type: Boolean }) yaExistia!: boolean;
}

/**
 * B.2 · resultado del borrado definitivo. Devuelve el identificador que se
 * borró para que la consola pueda decir «se borró la 42» y no «listo»: la
 * confirmación de un borrado tiene que nombrar lo borrado.
 */
export class BorradoDefinitivoDto {
  @ApiProperty({ type: Boolean }) borrada!: boolean;
  @ApiProperty({ type: String }) identificador!: string;
}
