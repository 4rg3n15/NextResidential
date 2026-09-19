// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mi_zona_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MiZonaDto _$MiZonaDtoFromJson(Map<String, dynamic> json) => MiZonaDto(
  id: json['id'] as String,
  nombre: json['nombre'] as String,
  aforoMaximo: json['aforoMaximo'] as num,
  ocupacionActual: json['ocupacionActual'] as num,
  abiertaAhora: json['abiertaAhora'] as bool,
  franjasDeHoy: (json['franjasDeHoy'] as List<dynamic>)
      .map((e) => FranjaDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  requiereAutorizacion: json['requiereAutorizacion'] as bool,
);

Map<String, dynamic> _$MiZonaDtoToJson(MiZonaDto instance) => <String, dynamic>{
  'id': instance.id,
  'nombre': instance.nombre,
  'aforoMaximo': instance.aforoMaximo,
  'ocupacionActual': instance.ocupacionActual,
  'abiertaAhora': instance.abiertaAhora,
  'franjasDeHoy': instance.franjasDeHoy,
  'requiereAutorizacion': instance.requiereAutorizacion,
};
