// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'zona_en_la_instantanea_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ZonaEnLaInstantaneaDto _$ZonaEnLaInstantaneaDtoFromJson(
  Map<String, dynamic> json,
) => ZonaEnLaInstantaneaDto(
  id: json['id'] as String,
  restringida: ZonaEnLaInstantaneaDtoRestringida.fromJson(
    json['restringida'] as bool,
  ),
  abierta: json['abierta'] as bool,
  aforoMaximo: json['aforoMaximo'] as num,
  ocupacionActual: json['ocupacionActual'] as num,
  desplazamientoUtcMinutos: json['desplazamientoUtcMinutos'] as num,
  franjas: (json['franjas'] as List<dynamic>)
      .map((e) => FranjaEnLaInstantaneaDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$ZonaEnLaInstantaneaDtoToJson(
  ZonaEnLaInstantaneaDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'restringida': instance.restringida,
  'abierta': instance.abierta,
  'aforoMaximo': instance.aforoMaximo,
  'ocupacionActual': instance.ocupacionActual,
  'desplazamientoUtcMinutos': instance.desplazamientoUtcMinutos,
  'franjas': instance.franjas,
};
