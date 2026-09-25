// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'respuesta_de_consentimiento_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RespuestaDeConsentimientoDto _$RespuestaDeConsentimientoDtoFromJson(
  Map<String, dynamic> json,
) => RespuestaDeConsentimientoDto(
  estado: json['estado'] as String,
  propagacion: (json['propagacion'] as List<dynamic>)
      .map((e) => SincronizacionTotalDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$RespuestaDeConsentimientoDtoToJson(
  RespuestaDeConsentimientoDto instance,
) => <String, dynamic>{
  'estado': instance.estado,
  'propagacion': instance.propagacion,
};
