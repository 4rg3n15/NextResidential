// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'veto_listado_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VetoListadoDto _$VetoListadoDtoFromJson(Map<String, dynamic> json) =>
    VetoListadoDto(
      id: json['id'] as String,
      placa: json['placa'] as String?,
      personaId: json['personaId'] as String?,
      persona: json['persona'] as String?,
      documento: json['documento'] as String?,
      motivo: json['motivo'] as String,
      creadoEn: DateTime.parse(json['creadoEn'] as String),
    );

Map<String, dynamic> _$VetoListadoDtoToJson(VetoListadoDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'placa': instance.placa,
      'personaId': instance.personaId,
      'persona': instance.persona,
      'documento': instance.documento,
      'motivo': instance.motivo,
      'creadoEn': instance.creadoEn.toIso8601String(),
    };
