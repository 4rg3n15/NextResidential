// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'registrar_residente_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RegistrarResidenteDto _$RegistrarResidenteDtoFromJson(
  Map<String, dynamic> json,
) => RegistrarResidenteDto(
  viviendaId: json['viviendaId'] as String,
  personaId: json['personaId'] as String,
  esTitular: json['esTitular'] as bool?,
  parentesco: json['parentesco'] as String?,
);

Map<String, dynamic> _$RegistrarResidenteDtoToJson(
  RegistrarResidenteDto instance,
) => <String, dynamic>{
  'viviendaId': instance.viviendaId,
  'personaId': instance.personaId,
  'esTitular': instance.esTitular,
  'parentesco': instance.parentesco,
};
