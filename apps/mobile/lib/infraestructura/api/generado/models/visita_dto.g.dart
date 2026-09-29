// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'visita_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VisitaDto _$VisitaDtoFromJson(Map<String, dynamic> json) => VisitaDto(
  autorizacionId: json['autorizacionId'] as String,
  visitante: json['visitante'] as String,
  documento: json['documento'] as String,
  viviendaId: json['viviendaId'] as String,
  vivienda: json['vivienda'] as String,
  desde: DateTime.parse(json['desde'] as String),
  hasta: DateTime.parse(json['hasta'] as String),
  estado: VisitaDtoEstado.fromJson(json['estado'] as String),
  placa: json['placa'] as String?,
  generadaPor: json['generadaPor'] as String?,
  generadaEn: DateTime.parse(json['generadaEn'] as String),
  anuladaEn: json['anuladaEn'] == null
      ? null
      : DateTime.parse(json['anuladaEn'] as String),
  motivoAnulacion: json['motivoAnulacion'] as String?,
  tieneFoto: json['tieneFoto'] as bool,
  casillaDeclaradaPor: json['casillaDeclaradaPor'] as String?,
  casillaEn: json['casillaEn'] == null
      ? null
      : DateTime.parse(json['casillaEn'] as String),
  plantillaId: json['plantillaId'] as String?,
  equiposSincronizados: json['equiposSincronizados'] as num,
  equiposFallidos: json['equiposFallidos'] as num,
  confirmacionDePlaca: json['confirmacionDePlaca'] as String?,
);

Map<String, dynamic> _$VisitaDtoToJson(VisitaDto instance) => <String, dynamic>{
  'autorizacionId': instance.autorizacionId,
  'visitante': instance.visitante,
  'documento': instance.documento,
  'viviendaId': instance.viviendaId,
  'vivienda': instance.vivienda,
  'desde': instance.desde.toIso8601String(),
  'hasta': instance.hasta.toIso8601String(),
  'estado': instance.estado,
  'placa': instance.placa,
  'generadaPor': instance.generadaPor,
  'generadaEn': instance.generadaEn.toIso8601String(),
  'anuladaEn': instance.anuladaEn?.toIso8601String(),
  'motivoAnulacion': instance.motivoAnulacion,
  'tieneFoto': instance.tieneFoto,
  'casillaDeclaradaPor': instance.casillaDeclaradaPor,
  'casillaEn': instance.casillaEn?.toIso8601String(),
  'plantillaId': instance.plantillaId,
  'equiposSincronizados': instance.equiposSincronizados,
  'equiposFallidos': instance.equiposFallidos,
  'confirmacionDePlaca': instance.confirmacionDePlaca,
};
