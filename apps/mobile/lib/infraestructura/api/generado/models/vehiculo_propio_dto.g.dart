// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'vehiculo_propio_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VehiculoPropioDto _$VehiculoPropioDtoFromJson(Map<String, dynamic> json) =>
    VehiculoPropioDto(
      placa: json['placa'] as String,
      color: json['color'] as String,
      modelo: json['modelo'] as String,
      tipo: VehiculoPropioDtoTipo.fromJson(json['tipo'] as String),
      ocupantes: (json['ocupantes'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      marca: json['marca'] as String?,
    );

Map<String, dynamic> _$VehiculoPropioDtoToJson(VehiculoPropioDto instance) =>
    <String, dynamic>{
      'placa': instance.placa,
      'color': instance.color,
      'modelo': instance.modelo,
      'marca': instance.marca,
      'tipo': instance.tipo,
      'ocupantes': instance.ocupantes,
    };
