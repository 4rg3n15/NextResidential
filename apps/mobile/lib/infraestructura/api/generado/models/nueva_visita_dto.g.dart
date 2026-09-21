// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'nueva_visita_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NuevaVisitaDto _$NuevaVisitaDtoFromJson(Map<String, dynamic> json) =>
    NuevaVisitaDto(
      visitante: json['visitante'] as String,
      desde: json['desde'] as String,
      hasta: json['hasta'] as String,
      claveDeIdempotencia: json['claveDeIdempotencia'] as String,
      permiteAccesoVehicular: json['permiteAccesoVehicular'] as bool? ?? false,
      documento: json['documento'] as String?,
      placa: json['placa'] as String?,
      acompanantes: (json['acompanantes'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      zonasPermitidas: (json['zonasPermitidas'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      observaciones: json['observaciones'] as String?,
      patron: json['patron'] == null
          ? null
          : PatronDeVisitaDto.fromJson(json['patron'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$NuevaVisitaDtoToJson(NuevaVisitaDto instance) =>
    <String, dynamic>{
      'visitante': instance.visitante,
      'documento': instance.documento,
      'desde': instance.desde,
      'hasta': instance.hasta,
      'placa': instance.placa,
      'permiteAccesoVehicular': instance.permiteAccesoVehicular,
      'acompanantes': instance.acompanantes,
      'zonasPermitidas': instance.zonasPermitidas,
      'observaciones': instance.observaciones,
      'patron': instance.patron,
      'claveDeIdempotencia': instance.claveDeIdempotencia,
    };
