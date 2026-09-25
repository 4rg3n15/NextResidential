// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'enlace_de_consentimiento_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EnlaceDeConsentimientoDto _$EnlaceDeConsentimientoDtoFromJson(
  Map<String, dynamic> json,
) => EnlaceDeConsentimientoDto(
  consentimientoId: json['consentimientoId'] as String,
  estado: json['estado'] as String,
  token: json['token'] as String,
  ruta: json['ruta'] as String,
  url: json['url'] as String?,
  expiraEn: json['expiraEn'] as String,
);

Map<String, dynamic> _$EnlaceDeConsentimientoDtoToJson(
  EnlaceDeConsentimientoDto instance,
) => <String, dynamic>{
  'consentimientoId': instance.consentimientoId,
  'estado': instance.estado,
  'token': instance.token,
  'ruta': instance.ruta,
  'url': instance.url,
  'expiraEn': instance.expiraEn,
};
