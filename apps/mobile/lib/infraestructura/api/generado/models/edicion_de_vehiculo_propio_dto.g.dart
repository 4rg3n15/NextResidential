// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'edicion_de_vehiculo_propio_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EdicionDeVehiculoPropioDto _$EdicionDeVehiculoPropioDtoFromJson(
  Map<String, dynamic> json,
) => EdicionDeVehiculoPropioDto(
  color: json['color'] as String,
  modelo: json['modelo'] as String,
  marca: json['marca'] as String?,
  ocupantes: (json['ocupantes'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  placa: json['placa'] as String?,
);

Map<String, dynamic> _$EdicionDeVehiculoPropioDtoToJson(
  EdicionDeVehiculoPropioDto instance,
) => <String, dynamic>{
  'color': instance.color,
  'modelo': instance.modelo,
  'marca': instance.marca,
  'ocupantes': instance.ocupantes,
  'placa': instance.placa,
};
