import { ApiProperty } from '@nestjs/swagger';

/**
 * DTOs de salida de la superficie del residente.
 *
 * Existen tipados —y no como `object`— porque el cliente Dart se GENERA desde
 * este contrato (§2.6). Una respuesta sin tipo en OpenAPI produce un `dynamic`
 * en Dart, y un `dynamic` es un campo que nadie revisa: el control
 * `contrato-tipado.mjs` rompe el build si aparece.
 *
 * Nada de lo que sale de aquí se calcula en el cliente. En particular
 * `etiquetaVivienda` y `etiquetaAgrupacion`: la palabra con la que ESTE
 * conjunto llama a sus viviendas la decide la copropiedad (migración 0029), así
 * que la app la pinta y no la elige. Un `switch` sobre el tipo de conjunto en
 * Dart sería una segunda verdad, y se separaría de la primera el día que un
 * conjunto use una palabra que la app no conoce.
 */
export class MiViviendaDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, description: 'El número, sin la palabra: «42».' })
  identificador!: string;
  @ApiProperty({ type: String, nullable: true }) agrupacion!: string | null;
  @ApiProperty({ type: String, description: 'Cómo llama esta copropiedad a sus viviendas.' })
  etiquetaVivienda!: string;
  @ApiProperty({ type: String }) etiquetaAgrupacion!: string;
  @ApiProperty({ type: String, nullable: true }) direccion!: string | null;
  @ApiProperty({ type: String }) copropiedadNombre!: string;
  @ApiProperty({
    type: String,
    description: 'Alimentado externamente; Next Control no calcula cartera (S-01).',
  })
  estadoAdministrativo!: string;
  @ApiProperty({
    type: Boolean,
    description: 'RN-13: inactiva conserva lo vigente y no genera autorizaciones nuevas.',
  })
  activa!: boolean;
}

export class MiVinculoDto {
  @ApiProperty({ type: String, format: 'uuid' }) residenteId!: string;
  @ApiProperty({ type: Boolean }) esTitular!: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'P-11 · por defecto el más restrictivo mientras no se defina.',
  })
  nivelAcceso!: string | null;
}

export class MiInicioDto {
  @ApiProperty({ type: MiViviendaDto }) vivienda!: MiViviendaDto;
  @ApiProperty({ type: MiVinculoDto }) vinculo!: MiVinculoDto;
  @ApiProperty({
    type: Boolean,
    description:
      'Si puede crear autorizaciones: exige vivienda activa (RN-13) y ser titular (RN-05). ' +
      'Lo decide el servidor; la app no repite la regla.',
  })
  puedeAutorizar!: boolean;
}

export class MiembroDeFamiliaDto {
  @ApiProperty({ type: String, format: 'uuid' }) residenteId!: string;
  @ApiProperty({ type: String }) nombre!: string;
  @ApiProperty({ type: String, nullable: true }) parentesco!: string | null;
  @ApiProperty({ type: Boolean }) esTitular!: boolean;
  @ApiProperty({ type: String, nullable: true }) nivelAcceso!: string | null;
  @ApiProperty({ type: Boolean, description: 'RN-19: el desactivado conserva historial.' })
  activo!: boolean;
}

export class MiVehiculoDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) placa!: string;
  @ApiProperty({ type: String, nullable: true }) marca!: string | null;
  @ApiProperty({ type: String, nullable: true }) modelo!: string | null;
  @ApiProperty({ type: String, nullable: true }) color!: string | null;
  @ApiProperty({ type: Boolean }) esPrincipal!: boolean;
  @ApiProperty({ type: Boolean }) activo!: boolean;
}

export class MiAutorizacionDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) visitante!: string;
  @ApiProperty({ type: String }) tipo!: string;
  @ApiProperty({ type: String, format: 'date-time' }) desde!: string;
  @ApiProperty({ type: String, format: 'date-time' }) hasta!: string;
  @ApiProperty({ type: String, nullable: true }) placa!: string | null;
  @ApiProperty({ type: Boolean }) permiteAccesoVehicular!: boolean;
  @ApiProperty({ type: String }) estado!: string;
  @ApiProperty({ type: Number }) acompanantes!: number;
}

export class MiEventoDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'date-time' }) ocurridoEn!: string;
  @ApiProperty({ type: String }) tipo!: string;
  @ApiProperty({ type: String, nullable: true }) resultado!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'El residente tiene derecho a entender la negación (mockup M-6).',
  })
  motivo!: string | null;
  @ApiProperty({ type: String }) metodo!: string;
  @ApiProperty({ type: String, nullable: true }) placaDetectada!: string | null;
  @ApiProperty({ type: String, nullable: true }) persona!: string | null;
  @ApiProperty({ type: String, nullable: true }) zona!: string | null;
  @ApiProperty({
    type: Boolean,
    description: 'KPI-31 · decidido por el Edge: la app lo marca, no lo esconde.',
  })
  decididoPorEdge!: boolean;
}

/**
 * M-4 · Lo que la app recibe al crear una visita.
 *
 * Es UN tipo para los dos desenlaces —creada y rechazada— y no dos códigos HTTP
 * distintos con cuerpos distintos. La razón es la app: la pantalla tiene que
 * pintar el rechazo **con su motivo**, y un 409 con un cuerpo de error genérico
 * la habría obligado a leer texto para distinguir cuál de los cuatro era. El
 * rechazo de una regla de negocio es una respuesta, no una avería.
 */
export class VisitaCreadaDto {
  @ApiProperty({ type: Boolean, description: 'false = una regla de negocio lo impidió' })
  creada!: boolean;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  id!: string | null;

  @ApiProperty({
    type: Boolean,
    description: 'true = este era un reintento y se devolvió la autorización anterior (RN-17)',
  })
  repetida!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['LISTA_NEGRA', 'VIVIENDA_INACTIVA', 'SIN_NIVEL_DE_ACCESO', 'PLACA_DUPLICADA'],
    description: 'Motivo TIPADO del rechazo (RN-06, RN-13, P-11, RN-04/CA-03)',
  })
  motivo!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'El mismo motivo en castellano llano; lo escribe el dominio, no la pantalla',
  })
  explicacion!: string | null;
}

/** M-7 · HU-34 · confirmación del registro del aparato. */
export class AparatoRegistradoDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
}

/** M-5 · HU-19 · una zona común tal como la ve el residente. */
export class FranjaDto {
  @ApiProperty({ type: String, format: 'date-time' }) desde!: string;
  @ApiProperty({ type: String, format: 'date-time' }) hasta!: string;
}

export class MiZonaDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) nombre!: string;
  @ApiProperty({ type: Number }) aforoMaximo!: number;
  @ApiProperty({
    type: Number,
    description:
      'Ocupación de ESTE instante. La interfaz lo refleja; el aforo lo garantiza la base.',
  })
  ocupacionActual!: number;
  @ApiProperty({ type: Boolean }) abiertaAhora!: boolean;
  @ApiProperty({
    type: [FranjaDto],
    description: 'Franjas de hoy ya resueltas; una que cruza medianoche llega como dos (S-09).',
  })
  franjasDeHoy!: FranjaDto[];
  @ApiProperty({ type: Boolean }) requiereAutorizacion!: boolean;
}
