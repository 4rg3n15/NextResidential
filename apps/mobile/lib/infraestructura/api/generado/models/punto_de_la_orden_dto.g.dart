// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'punto_de_la_orden_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PuntoDeLaOrdenDto _$PuntoDeLaOrdenDtoFromJson(Map<String, dynamic> json) =>
    PuntoDeLaOrdenDto(
      id: json['id'] as String,
      nombre: json['nombre'] as String,
      numeroDePuerta: json['numeroDePuerta'] as num,
    );

Map<String, dynamic> _$PuntoDeLaOrdenDtoToJson(PuntoDeLaOrdenDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'nombre': instance.nombre,
      'numeroDePuerta': instance.numeroDePuerta,
    };
