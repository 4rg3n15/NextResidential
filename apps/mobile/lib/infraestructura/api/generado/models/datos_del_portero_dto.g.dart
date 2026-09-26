// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'datos_del_portero_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DatosDelPorteroDto _$DatosDelPorteroDtoFromJson(Map<String, dynamic> json) =>
    DatosDelPorteroDto(
      nombre: json['nombre'] as String,
      sectores: (json['sectores'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      telefono: json['telefono'] as String?,
      correoContacto: json['correoContacto'] as String?,
      porteria: json['porteria'] as String?,
    );

Map<String, dynamic> _$DatosDelPorteroDtoToJson(DatosDelPorteroDto instance) =>
    <String, dynamic>{
      'nombre': instance.nombre,
      'telefono': instance.telefono,
      'correoContacto': instance.correoContacto,
      'porteria': instance.porteria,
      'sectores': instance.sectores,
    };
