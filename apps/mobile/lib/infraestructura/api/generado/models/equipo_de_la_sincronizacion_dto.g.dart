// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'equipo_de_la_sincronizacion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EquipoDeLaSincronizacionDto _$EquipoDeLaSincronizacionDtoFromJson(
  Map<String, dynamic> json,
) => EquipoDeLaSincronizacionDto(
  dispositivoId: json['dispositivoId'] as String,
  nombre: json['nombre'] as String,
  sincronizada: json['sincronizada'] as bool,
  detalle: json['detalle'] as String,
);

Map<String, dynamic> _$EquipoDeLaSincronizacionDtoToJson(
  EquipoDeLaSincronizacionDto instance,
) => <String, dynamic>{
  'dispositivoId': instance.dispositivoId,
  'nombre': instance.nombre,
  'sincronizada': instance.sincronizada,
  'detalle': instance.detalle,
};
