// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'resultado_de_alta_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ResultadoDeAltaDto _$ResultadoDeAltaDtoFromJson(Map<String, dynamic> json) =>
    ResultadoDeAltaDto(
      vinculada: json['vinculada'] as bool,
      debeDeclararOcupantes: json['debeDeclararOcupantes'] as bool,
      motivo: json['motivo'] == null
          ? null
          : ResultadoDeAltaDtoMotivo.fromJson(json['motivo'] as String),
      explicacion: json['explicacion'] as String?,
      campos: (json['campos'] as List<dynamic>)
          .map((e) => CampoRechazadoDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$ResultadoDeAltaDtoToJson(ResultadoDeAltaDto instance) =>
    <String, dynamic>{
      'vinculada': instance.vinculada,
      'debeDeclararOcupantes': instance.debeDeclararOcupantes,
      'motivo': instance.motivo,
      'explicacion': instance.explicacion,
      'campos': instance.campos,
    };
