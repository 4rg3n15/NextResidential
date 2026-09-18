// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mi_vinculo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MiVinculoDto _$MiVinculoDtoFromJson(Map<String, dynamic> json) => MiVinculoDto(
  residenteId: json['residenteId'] as String,
  esTitular: json['esTitular'] as bool,
  nivelAcceso: json['nivelAcceso'] as String?,
);

Map<String, dynamic> _$MiVinculoDtoToJson(MiVinculoDto instance) =>
    <String, dynamic>{
      'residenteId': instance.residenteId,
      'esTitular': instance.esTitular,
      'nivelAcceso': instance.nivelAcceso,
    };
