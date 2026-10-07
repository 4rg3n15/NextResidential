// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'equipo_del_rostro_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EquipoDelRostroDto _$EquipoDelRostroDtoFromJson(Map<String, dynamic> json) =>
    EquipoDelRostroDto(
      nombre: json['nombre'] as String,
      estado: EquipoDelRostroDtoEstado.fromJson(json['estado'] as String),
    );

Map<String, dynamic> _$EquipoDelRostroDtoToJson(EquipoDelRostroDto instance) =>
    <String, dynamic>{'nombre': instance.nombre, 'estado': instance.estado};
