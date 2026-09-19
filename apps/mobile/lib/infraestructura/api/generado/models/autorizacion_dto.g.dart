// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'autorizacion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AutorizacionDto _$AutorizacionDtoFromJson(Map<String, dynamic> json) =>
    AutorizacionDto(
      id: json['id'] as String,
      viviendaId: json['viviendaId'] as String,
      vivienda: json['vivienda'] as String,
      visitante: json['visitante'] as String,
      documento: json['documento'] as String,
      desde: DateTime.parse(json['desde'] as String),
      hasta: DateTime.parse(json['hasta'] as String),
      tipo: AutorizacionDtoTipo.fromJson(json['tipo'] as String),
      estado: AutorizacionDtoEstado.fromJson(json['estado'] as String),
      placa: json['placa'] as String?,
      acompanantes: (json['acompanantes'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      patron: json['patron'] == null
          ? null
          : PatronDto.fromJson(json['patron'] as Map<String, dynamic>),
      revocadaEn: json['revocadaEn'] == null
          ? null
          : DateTime.parse(json['revocadaEn'] as String),
      motivoRevocacion: json['motivoRevocacion'] as String?,
    );

Map<String, dynamic> _$AutorizacionDtoToJson(AutorizacionDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'viviendaId': instance.viviendaId,
      'vivienda': instance.vivienda,
      'visitante': instance.visitante,
      'documento': instance.documento,
      'desde': instance.desde.toIso8601String(),
      'hasta': instance.hasta.toIso8601String(),
      'tipo': instance.tipo,
      'estado': instance.estado,
      'placa': instance.placa,
      'acompanantes': instance.acompanantes,
      'patron': instance.patron,
      'revocadaEn': instance.revocadaEn?.toIso8601String(),
      'motivoRevocacion': instance.motivoRevocacion,
    };
