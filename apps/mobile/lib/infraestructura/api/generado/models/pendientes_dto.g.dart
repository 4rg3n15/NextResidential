// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pendientes_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PendientesDto _$PendientesDtoFromJson(Map<String, dynamic> json) =>
    PendientesDto(
      dispositivos: (json['dispositivos'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      ejecutaContraElEquipo: json['ejecutaContraElEquipo'] as bool,
      detalleDeEjecucion: json['detalleDeEjecucion'] as String,
    );

Map<String, dynamic> _$PendientesDtoToJson(PendientesDto instance) =>
    <String, dynamic>{
      'dispositivos': instance.dispositivos,
      'ejecutaContraElEquipo': instance.ejecutaContraElEquipo,
      'detalleDeEjecucion': instance.detalleDeEjecucion,
    };
