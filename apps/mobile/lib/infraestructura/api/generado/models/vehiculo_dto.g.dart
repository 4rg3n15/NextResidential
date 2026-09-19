// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'vehiculo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VehiculoDto _$VehiculoDtoFromJson(Map<String, dynamic> json) => VehiculoDto(
  id: json['id'] as String,
  placa: json['placa'] as String,
  marca: json['marca'] as String?,
  modelo: json['modelo'] as String?,
  color: json['color'] as String?,
  tipo: VehiculoDtoTipo.fromJson(json['tipo'] as String),
  estado: VehiculoDtoEstado.fromJson(json['estado'] as String),
  viviendaId: json['viviendaId'] as String,
  viviendaIdentificador: json['viviendaIdentificador'] as String,
  propietarioId: json['propietarioId'] as String?,
  propietarioNombre: json['propietarioNombre'] as String?,
);

Map<String, dynamic> _$VehiculoDtoToJson(VehiculoDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'placa': instance.placa,
      'marca': instance.marca,
      'modelo': instance.modelo,
      'color': instance.color,
      'tipo': instance.tipo,
      'estado': instance.estado,
      'viviendaId': instance.viviendaId,
      'viviendaIdentificador': instance.viviendaIdentificador,
      'propietarioId': instance.propietarioId,
      'propietarioNombre': instance.propietarioNombre,
    };
