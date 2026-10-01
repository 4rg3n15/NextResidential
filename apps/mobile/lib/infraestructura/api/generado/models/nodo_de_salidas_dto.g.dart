// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'nodo_de_salidas_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NodoDeSalidasDto _$NodoDeSalidasDtoFromJson(Map<String, dynamic> json) =>
    NodoDeSalidasDto(
      ruta: json['ruta'] as String,
      padre: json['padre'] as String?,
      nivel: json['nivel'] as num,
      tipo: NodoDeSalidasDtoTipo.fromJson(json['tipo'] as String),
      nombre: json['nombre'] as String,
      numeroDePuerta: json['numeroDePuerta'] as num?,
      estado: json['estado'] == null
          ? null
          : NodoDeSalidasDtoEstado.fromJson(json['estado'] as String),
      nota: json['nota'] as String?,
    );

Map<String, dynamic> _$NodoDeSalidasDtoToJson(NodoDeSalidasDto instance) =>
    <String, dynamic>{
      'ruta': instance.ruta,
      'padre': instance.padre,
      'nivel': instance.nivel,
      'tipo': instance.tipo,
      'nombre': instance.nombre,
      'numeroDePuerta': instance.numeroDePuerta,
      'estado': instance.estado,
      'nota': instance.nota,
    };
