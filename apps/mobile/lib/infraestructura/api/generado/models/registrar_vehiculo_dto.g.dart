// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'registrar_vehiculo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RegistrarVehiculoDto _$RegistrarVehiculoDtoFromJson(
  Map<String, dynamic> json,
) => RegistrarVehiculoDto(
  viviendaId: json['viviendaId'] as String,
  placa: json['placa'] as String,
  personaId: json['personaId'] as String?,
  marca: json['marca'] as String?,
  modelo: json['modelo'] as String?,
  color: json['color'] as String?,
  tipo: json['tipo'] == null
      ? null
      : RegistrarVehiculoDtoTipo.fromJson(json['tipo'] as String),
);

Map<String, dynamic> _$RegistrarVehiculoDtoToJson(
  RegistrarVehiculoDto instance,
) => <String, dynamic>{
  'viviendaId': instance.viviendaId,
  'placa': instance.placa,
  'personaId': instance.personaId,
  'marca': instance.marca,
  'modelo': instance.modelo,
  'color': instance.color,
  'tipo': instance.tipo,
};
