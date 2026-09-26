// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'vocabulario_de_alta_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VocabularioDeAltaDto _$VocabularioDeAltaDtoFromJson(
  Map<String, dynamic> json,
) => VocabularioDeAltaDto(
  copropiedadNombre: json['copropiedadNombre'] as String,
  tipo: json['tipo'] as String?,
  etiquetaVivienda: json['etiquetaVivienda'] as String,
  etiquetaAgrupacion: json['etiquetaAgrupacion'] as String,
);

Map<String, dynamic> _$VocabularioDeAltaDtoToJson(
  VocabularioDeAltaDto instance,
) => <String, dynamic>{
  'copropiedadNombre': instance.copropiedadNombre,
  'tipo': instance.tipo,
  'etiquetaVivienda': instance.etiquetaVivienda,
  'etiquetaAgrupacion': instance.etiquetaAgrupacion,
};
