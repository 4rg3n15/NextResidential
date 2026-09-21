// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'decision_del_edge_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DecisionDelEdgeDto _$DecisionDelEdgeDtoFromJson(Map<String, dynamic> json) =>
    DecisionDelEdgeDto(
      permitido: json['permitido'] as bool,
      reglaAplicada: json['reglaAplicada'] as String,
      versionDeReglas: json['versionDeReglas'] as num,
      motivo: json['motivo'] == null
          ? null
          : DecisionDelEdgeDtoMotivo.fromJson(json['motivo'] as String),
      requiereConfirmacionHumana: json['requiereConfirmacionHumana'] as bool?,
    );

Map<String, dynamic> _$DecisionDelEdgeDtoToJson(DecisionDelEdgeDto instance) =>
    <String, dynamic>{
      'permitido': instance.permitido,
      'motivo': instance.motivo,
      'reglaAplicada': instance.reglaAplicada,
      'versionDeReglas': instance.versionDeReglas,
      'requiereConfirmacionHumana': instance.requiereConfirmacionHumana,
    };
