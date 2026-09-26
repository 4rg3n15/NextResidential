// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'configuracion_de_copropiedad_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConfiguracionDeCopropiedadDto _$ConfiguracionDeCopropiedadDtoFromJson(
  Map<String, dynamic> json,
) => ConfiguracionDeCopropiedadDto(
  nombre: json['nombre'] as String,
  direccion: json['direccion'] as String?,
  tipo: json['tipo'] == null
      ? null
      : ConfiguracionDeCopropiedadDtoTipo.fromJson(json['tipo'] as String),
  etiquetaVivienda: json['etiquetaVivienda'] as String,
  etiquetaAgrupacion: json['etiquetaAgrupacion'] as String,
  zonaHoraria: json['zonaHoraria'] as String,
  umbralConfianzaPlaca: json['umbralConfianzaPlaca'] as num,
  politicaContingenciaEdge:
      ConfiguracionDeCopropiedadDtoPoliticaContingenciaEdge.fromJson(
        json['politicaContingenciaEdge'] as String,
      ),
  umbralLatidoMinutos: json['umbralLatidoMinutos'] as num,
  nit: json['nit'] as String,
  estado: json['estado'] as String,
  plazoConsentimientoHoras: json['plazoConsentimientoHoras'] as num,
  margenCacheReglasHoras: json['margenCacheReglasHoras'] as num,
  versionReglasActual: json['versionReglasActual'] as num,
  codigoCorto: json['codigoCorto'] as String?,
  telefonoPorteria: json['telefonoPorteria'] as String?,
  topeVehiculosPropios: json['topeVehiculosPropios'] as num,
  aprobacionDeTerceros:
      ConfiguracionDeCopropiedadDtoAprobacionDeTerceros.fromJson(
        json['aprobacionDeTerceros'] as String,
      ),
  editables: (json['editables'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$ConfiguracionDeCopropiedadDtoToJson(
  ConfiguracionDeCopropiedadDto instance,
) => <String, dynamic>{
  'nombre': instance.nombre,
  'direccion': instance.direccion,
  'tipo': instance.tipo,
  'etiquetaVivienda': instance.etiquetaVivienda,
  'etiquetaAgrupacion': instance.etiquetaAgrupacion,
  'zonaHoraria': instance.zonaHoraria,
  'umbralConfianzaPlaca': instance.umbralConfianzaPlaca,
  'politicaContingenciaEdge': instance.politicaContingenciaEdge,
  'umbralLatidoMinutos': instance.umbralLatidoMinutos,
  'nit': instance.nit,
  'estado': instance.estado,
  'plazoConsentimientoHoras': instance.plazoConsentimientoHoras,
  'margenCacheReglasHoras': instance.margenCacheReglasHoras,
  'versionReglasActual': instance.versionReglasActual,
  'codigoCorto': instance.codigoCorto,
  'telefonoPorteria': instance.telefonoPorteria,
  'topeVehiculosPropios': instance.topeVehiculosPropios,
  'aprobacionDeTerceros': instance.aprobacionDeTerceros,
  'editables': instance.editables,
};
