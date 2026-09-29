// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'nombre_de_equipo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NombreDeEquipoDto _$NombreDeEquipoDtoFromJson(Map<String, dynamic> json) =>
    NombreDeEquipoDto(
      id: json['id'] as String,
      nombre: json['nombre'] as String,
      tipo: NombreDeEquipoDtoTipo.fromJson(json['tipo'] as String),
      activo: json['activo'] as bool,
    );

Map<String, dynamic> _$NombreDeEquipoDtoToJson(NombreDeEquipoDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'nombre': instance.nombre,
      'tipo': instance.tipo,
      'activo': instance.activo,
    };
