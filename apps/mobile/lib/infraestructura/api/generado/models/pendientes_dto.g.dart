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
    );

Map<String, dynamic> _$PendientesDtoToJson(PendientesDto instance) =>
    <String, dynamic>{'dispositivos': instance.dispositivos};
