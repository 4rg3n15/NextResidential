import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Respuestas del hogar del residente y de su supervisión (ETAPA 15-I). */

export class VocabularioDeAltaDto {
  @ApiProperty() copropiedadNombre!: string;
  @ApiProperty({ type: String, nullable: true }) tipo!: string | null;
  @ApiProperty() etiquetaVivienda!: string;
  @ApiProperty() etiquetaAgrupacion!: string;
  @ApiProperty({ type: String, nullable: true, description: '15-W · prefijo de sus códigos' })
  codigoCorto!: string | null;
}

export class EstadoDeMiAltaDto {
  @ApiProperty() completa!: boolean;
  @ApiProperty() viviendaVinculada!: boolean;
  @ApiProperty({ description: '15-W · la cuenta ya trae vivienda (asignada o vinculada)' })
  viviendaAsignada!: boolean;
  @ApiProperty() debeDeclararOcupantes!: boolean;
  @ApiProperty({ type: VocabularioDeAltaDto }) vocabulario!: VocabularioDeAltaDto;
  @ApiProperty() pideAgrupacion!: boolean;
  @ApiProperty({ description: 'El texto de Ocupantes, con el tope de la vivienda (D-W10)' })
  avisoOcupantes!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: '15-W · «La administración debe asignarle su vivienda», o null',
  })
  aviso!: string | null;
}

export class CampoRechazadoDto {
  @ApiProperty() campo!: string;
  @ApiProperty() motivo!: string;
}

export class ResultadoDeAltaDto {
  @ApiProperty() vinculada!: boolean;
  @ApiProperty() debeDeclararOcupantes!: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: [
      'DEMASIADOS_INTENTOS',
      'VIVIENDA_INEXISTENTE',
      'AGRUPACION_REQUERIDA',
      'VIVIENDA_INACTIVA',
      'CODIGO_REQUERIDO',
      'CODIGO_INCORRECTO',
      'DOCUMENTO_EN_USO',
      'YA_VINCULADA',
      'VIVIENDA_SIN_TITULAR',
      'TITULAR_NO_SE_MUDA',
      'SIN_VIVIENDA',
      'CUENTA_BLOQUEADA_POR_EDAD',
    ],
  })
  motivo!: string | null;
  @ApiProperty({ type: String, nullable: true }) explicacion!: string | null;
  @ApiProperty({ type: [CampoRechazadoDto] }) campos!: CampoRechazadoDto[];
}

export class PlazaDeOcupanteDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() numero!: number;
  @ApiProperty() libre!: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Sólo en las libres, con el prefijo del conjunto: MIRA-ABCD-EFGH',
  })
  codigo!: string | null;
  @ApiProperty({ type: String, nullable: true }) ocupante!: string | null;
  @ApiProperty({ description: '15-W · la ocupa una persona sin cuenta (un menor)' })
  sinCuenta!: boolean;
}

export class MisOcupantesDto {
  @ApiProperty() declarados!: number;
  @ApiProperty() declarada!: boolean;
  @ApiProperty({ type: [PlazaDeOcupanteDto] }) plazas!: PlazaDeOcupanteDto[];
  @ApiProperty() aviso!: string;
  @ApiProperty({ description: '15-W · el tope de plazas de la vivienda, contando al titular' })
  tope!: number;
  @ApiProperty({ description: '15-W · quien pregunta es el titular' }) esTitular!: boolean;
}

export class PerfilDelResidenteDto {
  @ApiProperty({ type: String, nullable: true }) nombres!: string | null;
  @ApiProperty({ type: String, nullable: true }) apellidos!: string | null;
  @ApiProperty() nombreCompleto!: string;
  @ApiProperty({ type: String, nullable: true }) fechaNacimiento!: string | null;
  @ApiProperty({ type: String, nullable: true }) tipoDocumento!: string | null;
  @ApiProperty({ type: String, nullable: true }) numeroDocumento!: string | null;
  @ApiProperty({ type: String, nullable: true }) correo!: string | null;
  @ApiProperty({ type: String, nullable: true }) telefono!: string | null;
  @ApiProperty() copropiedadNombre!: string;
  @ApiProperty({ type: String, nullable: true }) copropiedadDireccion!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'D7 · null = el superadministrador no lo ha registrado',
  })
  telefonoPorteria!: string | null;
}

export class ResultadoDePerfilDto {
  @ApiProperty() guardado!: boolean;
  @ApiPropertyOptional({ type: PerfilDelResidenteDto, nullable: true })
  perfil!: PerfilDelResidenteDto | null;
  @ApiProperty({ type: String, nullable: true, enum: ['DOCUMENTO_EN_USO', 'SIN_VINCULO'] })
  motivo!: string | null;
  @ApiProperty({ type: [CampoRechazadoDto] }) campos!: CampoRechazadoDto[];
}

export class ResultadoDeVehiculoPropioDto {
  @ApiProperty() registrado!: boolean;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) id!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: [
      'TOPE_ALCANZADO',
      'PLACA_DUPLICADA',
      'VIVIENDA_INACTIVA',
      'OCUPANTE_AJENO',
      'SIN_OCUPANTES',
      'DATOS_INVALIDOS',
    ],
  })
  motivo!: string | null;
  @ApiProperty({ type: String, nullable: true }) explicacion!: string | null;
}

export class VehiculoDesactivadoDto {
  @ApiProperty() desactivado!: boolean;
}

export class CuentaDeResidenteDto {
  @ApiProperty({ format: 'uuid' }) usuarioId!: string;
  @ApiProperty({ type: String, nullable: true }) usuario!: string | null;
  @ApiProperty() nombre!: string;
  @ApiProperty({ type: String, nullable: true }) vivienda!: string | null;
  @ApiProperty() activa!: boolean;
  @ApiProperty() debeCambiarContrasena!: boolean;
  @ApiProperty() creadaEn!: string;
  @ApiProperty({
    enum: ['administracion', 'autorregistro'],
    description: '15-W · origen de la cuenta',
  })
  origen!: 'administracion' | 'autorregistro';
}

/** C9 (15-M) · lo que contesta la baja: hecha, y cuántas plantillas se suprimieron. */
export class CuentaDadaDeBajaDto {
  @ApiProperty() dadaDeBaja!: boolean;
  @ApiProperty() plantillasSuprimidas!: number;
}

export class CuentaDeResidenteCreadaDto {
  @ApiProperty({ format: 'uuid' }) usuarioId!: string;
}

export class VehiculoDeResidenteDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) viviendaId!: string;
  @ApiProperty() vivienda!: string;
  @ApiProperty() placa!: string;
  @ApiProperty({ type: String, nullable: true }) color!: string | null;
  @ApiProperty({ type: String, nullable: true }) modelo!: string | null;
  @ApiProperty({ type: String, nullable: true }) marca!: string | null;
  @ApiProperty() tipo!: string;
  @ApiProperty() registradoEn!: string;
  @ApiProperty({ type: String, nullable: true }) registradoPor!: string | null;
  @ApiProperty({ type: [String] }) ocupantes!: string[];
  @ApiProperty() activo!: boolean;
}

export class PlazaRetiradaDto {
  @ApiProperty() retirada!: boolean;
}
