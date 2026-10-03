// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'suscripcion_web_push_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SuscripcionWebPushDto _$SuscripcionWebPushDtoFromJson(
  Map<String, dynamic> json,
) => SuscripcionWebPushDto(
  endpoint: json['endpoint'] as String,
  keys: LlavesDeSuscripcionDto.fromJson(json['keys'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SuscripcionWebPushDtoToJson(
  SuscripcionWebPushDto instance,
) => <String, dynamic>{'endpoint': instance.endpoint, 'keys': instance.keys};
