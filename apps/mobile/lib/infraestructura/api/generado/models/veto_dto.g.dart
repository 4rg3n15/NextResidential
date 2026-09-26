// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'veto_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VetoDto _$VetoDtoFromJson(Map<String, dynamic> json) => VetoDto(
  motivo: json['motivo'] as String,
  placa: json['placa'] as String?,
  documento: json['documento'] as String?,
);

Map<String, dynamic> _$VetoDtoToJson(VetoDto instance) => <String, dynamic>{
  'placa': instance.placa,
  'documento': instance.documento,
  'motivo': instance.motivo,
};
