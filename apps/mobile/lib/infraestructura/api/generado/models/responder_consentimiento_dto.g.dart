// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'responder_consentimiento_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ResponderConsentimientoDto _$ResponderConsentimientoDtoFromJson(
  Map<String, dynamic> json,
) => ResponderConsentimientoDto(
  acepta: json['acepta'] as bool,
  evidenciaId: json['evidenciaId'] as String?,
);

Map<String, dynamic> _$ResponderConsentimientoDtoToJson(
  ResponderConsentimientoDto instance,
) => <String, dynamic>{
  'acepta': instance.acepta,
  'evidenciaId': instance.evidenciaId,
};
