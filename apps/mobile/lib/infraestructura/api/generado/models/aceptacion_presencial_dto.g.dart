// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'aceptacion_presencial_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AceptacionPresencialDto _$AceptacionPresencialDtoFromJson(
  Map<String, dynamic> json,
) => AceptacionPresencialDto(
  nombreCompleto: json['nombreCompleto'] as String,
  numeroDocumento: json['numeroDocumento'] as String,
  versionPolitica: json['versionPolitica'] as String,
  aceptaPolitica: json['aceptaPolitica'] as bool,
);

Map<String, dynamic> _$AceptacionPresencialDtoToJson(
  AceptacionPresencialDto instance,
) => <String, dynamic>{
  'nombreCompleto': instance.nombreCompleto,
  'numeroDocumento': instance.numeroDocumento,
  'versionPolitica': instance.versionPolitica,
  'aceptaPolitica': instance.aceptaPolitica,
};
