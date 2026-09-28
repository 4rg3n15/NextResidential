// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'visitante_reciente_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VisitanteRecienteDto _$VisitanteRecienteDtoFromJson(
  Map<String, dynamic> json,
) => VisitanteRecienteDto(
  autorizacionId: json['autorizacionId'] as String,
  visitante: json['visitante'] as String,
  documento: json['documento'] as String,
  ultimaVisita: DateTime.parse(json['ultimaVisita'] as String),
  placa: json['placa'] as String?,
  tieneFoto: json['tieneFoto'] as bool,
);

Map<String, dynamic> _$VisitanteRecienteDtoToJson(
  VisitanteRecienteDto instance,
) => <String, dynamic>{
  'autorizacionId': instance.autorizacionId,
  'visitante': instance.visitante,
  'documento': instance.documento,
  'ultimaVisita': instance.ultimaVisita.toIso8601String(),
  'placa': instance.placa,
  'tieneFoto': instance.tieneFoto,
};
