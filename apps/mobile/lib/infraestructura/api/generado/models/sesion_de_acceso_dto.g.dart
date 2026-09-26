// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sesion_de_acceso_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SesionDeAccesoDto _$SesionDeAccesoDtoFromJson(Map<String, dynamic> json) =>
    SesionDeAccesoDto(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      expiraEn: json['expiraEn'] as num,
      debeCambiarContrasena: json['debeCambiarContrasena'] as bool,
    );

Map<String, dynamic> _$SesionDeAccesoDtoToJson(SesionDeAccesoDto instance) =>
    <String, dynamic>{
      'accessToken': instance.accessToken,
      'refreshToken': instance.refreshToken,
      'expiraEn': instance.expiraEn,
      'debeCambiarContrasena': instance.debeCambiarContrasena,
    };
