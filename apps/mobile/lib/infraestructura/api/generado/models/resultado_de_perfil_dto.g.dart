// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'resultado_de_perfil_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ResultadoDePerfilDto _$ResultadoDePerfilDtoFromJson(
  Map<String, dynamic> json,
) => ResultadoDePerfilDto(
  guardado: json['guardado'] as bool,
  motivo: json['motivo'] == null
      ? null
      : ResultadoDePerfilDtoMotivo.fromJson(json['motivo'] as String),
  campos: (json['campos'] as List<dynamic>)
      .map((e) => CampoRechazadoDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  perfil: json['perfil'] == null
      ? null
      : PerfilDelResidenteDto.fromJson(json['perfil'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ResultadoDePerfilDtoToJson(
  ResultadoDePerfilDto instance,
) => <String, dynamic>{
  'guardado': instance.guardado,
  'perfil': instance.perfil,
  'motivo': instance.motivo,
  'campos': instance.campos,
};
