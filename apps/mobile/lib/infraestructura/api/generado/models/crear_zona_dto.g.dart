// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'crear_zona_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CrearZonaDto _$CrearZonaDtoFromJson(Map<String, dynamic> json) => CrearZonaDto(
  nombre: json['nombre'] as String,
  tipo: CrearZonaDtoTipo.fromJson(json['tipo'] as String),
  aforoMaximo: json['aforoMaximo'] as num,
  icono: json['icono'] as String?,
  normas: (json['normas'] as List<dynamic>?)?.map((e) => e as String).toList(),
);

Map<String, dynamic> _$CrearZonaDtoToJson(CrearZonaDto instance) =>
    <String, dynamic>{
      'nombre': instance.nombre,
      'tipo': instance.tipo,
      'aforoMaximo': instance.aforoMaximo,
      'icono': instance.icono,
      'normas': instance.normas,
    };
