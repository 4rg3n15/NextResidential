// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mi_autorizacion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MiAutorizacionDto _$MiAutorizacionDtoFromJson(Map<String, dynamic> json) =>
    MiAutorizacionDto(
      id: json['id'] as String,
      visitante: json['visitante'] as String,
      tipo: json['tipo'] as String,
      desde: DateTime.parse(json['desde'] as String),
      hasta: DateTime.parse(json['hasta'] as String),
      placa: json['placa'] as String?,
      permiteAccesoVehicular: json['permiteAccesoVehicular'] as bool,
      estado: json['estado'] as String,
      acompanantes: json['acompanantes'] as num,
      situacion: MiAutorizacionDtoSituacion.fromJson(
        json['situacion'] as String,
      ),
      motivoRechazo: json['motivoRechazo'] as String?,
    );

Map<String, dynamic> _$MiAutorizacionDtoToJson(MiAutorizacionDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'visitante': instance.visitante,
      'tipo': instance.tipo,
      'desde': instance.desde.toIso8601String(),
      'hasta': instance.hasta.toIso8601String(),
      'placa': instance.placa,
      'permiteAccesoVehicular': instance.permiteAccesoVehicular,
      'estado': instance.estado,
      'acompanantes': instance.acompanantes,
      'situacion': instance.situacion,
      'motivoRechazo': instance.motivoRechazo,
    };
