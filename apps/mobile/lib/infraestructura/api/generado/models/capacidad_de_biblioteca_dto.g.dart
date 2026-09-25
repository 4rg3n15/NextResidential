// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'capacidad_de_biblioteca_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CapacidadDeBibliotecaDto _$CapacidadDeBibliotecaDtoFromJson(
  Map<String, dynamic> json,
) => CapacidadDeBibliotecaDto(
  estado: CapacidadDeBibliotecaDtoEstado.fromJson(json['estado'] as String),
  maximo: json['maximo'] as num?,
  almacenadas: json['almacenadas'] as num?,
);

Map<String, dynamic> _$CapacidadDeBibliotecaDtoToJson(
  CapacidadDeBibliotecaDto instance,
) => <String, dynamic>{
  'estado': instance.estado,
  'maximo': instance.maximo,
  'almacenadas': instance.almacenadas,
};
