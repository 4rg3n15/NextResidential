// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'token_de_notificacion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TokenDeNotificacionDto _$TokenDeNotificacionDtoFromJson(
  Map<String, dynamic> json,
) => TokenDeNotificacionDto(
  instalacionId: json['instalacionId'] as String,
  token: json['token'] as String,
  plataforma: TokenDeNotificacionDtoPlataforma.fromJson(
    json['plataforma'] as String,
  ),
);

Map<String, dynamic> _$TokenDeNotificacionDtoToJson(
  TokenDeNotificacionDto instance,
) => <String, dynamic>{
  'instalacionId': instance.instalacionId,
  'token': instance.token,
  'plataforma': instance.plataforma,
};
