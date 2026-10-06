// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'estado_del_registro_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EstadoDelRegistroDto _$EstadoDelRegistroDtoFromJson(
  Map<String, dynamic> json,
) => EstadoDelRegistroDto(
  suspendido: json['suspendido'] as bool,
  hasta: json['hasta'] == null ? null : DateTime.parse(json['hasta'] as String),
  fallosRecientes: json['fallosRecientes'] as num,
);

Map<String, dynamic> _$EstadoDelRegistroDtoToJson(
  EstadoDelRegistroDto instance,
) => <String, dynamic>{
  'suspendido': instance.suspendido,
  'hasta': instance.hasta?.toIso8601String(),
  'fallosRecientes': instance.fallosRecientes,
};
