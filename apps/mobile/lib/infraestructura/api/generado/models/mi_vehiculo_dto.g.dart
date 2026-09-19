// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mi_vehiculo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MiVehiculoDto _$MiVehiculoDtoFromJson(Map<String, dynamic> json) =>
    MiVehiculoDto(
      id: json['id'] as String,
      placa: json['placa'] as String,
      marca: json['marca'] as String?,
      modelo: json['modelo'] as String?,
      color: json['color'] as String?,
      esPrincipal: json['esPrincipal'] as bool,
      activo: json['activo'] as bool,
    );

Map<String, dynamic> _$MiVehiculoDtoToJson(MiVehiculoDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'placa': instance.placa,
      'marca': instance.marca,
      'modelo': instance.modelo,
      'color': instance.color,
      'esPrincipal': instance.esPrincipal,
      'activo': instance.activo,
    };
