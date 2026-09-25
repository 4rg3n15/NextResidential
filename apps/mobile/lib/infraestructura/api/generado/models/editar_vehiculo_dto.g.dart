// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'editar_vehiculo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EditarVehiculoDto _$EditarVehiculoDtoFromJson(Map<String, dynamic> json) =>
    EditarVehiculoDto(
      placa: json['placa'] as String?,
      personaId: json['personaId'] as String?,
      marca: json['marca'] as String?,
      modelo: json['modelo'] as String?,
      color: json['color'] as String?,
      tipo: json['tipo'] == null
          ? null
          : EditarVehiculoDtoTipo.fromJson(json['tipo'] as String),
    );

Map<String, dynamic> _$EditarVehiculoDtoToJson(EditarVehiculoDto instance) =>
    <String, dynamic>{
      'placa': instance.placa,
      'personaId': instance.personaId,
      'marca': instance.marca,
      'modelo': instance.modelo,
      'color': instance.color,
      'tipo': instance.tipo,
    };
