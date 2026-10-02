// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'vehiculo_en_la_instantanea_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VehiculoEnLaInstantaneaDto _$VehiculoEnLaInstantaneaDtoFromJson(
  Map<String, dynamic> json,
) => VehiculoEnLaInstantaneaDto(
  placa: json['placa'] as String,
  vehiculoId: json['vehiculoId'] as String,
  personaId: json['personaId'] as String,
  viviendaId: json['viviendaId'] as String,
);

Map<String, dynamic> _$VehiculoEnLaInstantaneaDtoToJson(
  VehiculoEnLaInstantaneaDto instance,
) => <String, dynamic>{
  'placa': instance.placa,
  'vehiculoId': instance.vehiculoId,
  'personaId': instance.personaId,
  'viviendaId': instance.viviendaId,
};
