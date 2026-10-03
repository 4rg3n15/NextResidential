// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ficha_de_edge_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FichaDeEdgeDto _$FichaDeEdgeDtoFromJson(Map<String, dynamic> json) =>
    FichaDeEdgeDto(
      id: json['id'] as String,
      nombre: json['nombre'] as String,
      puente: json['puente'] as bool,
      conectado: json['conectado'] as bool,
      versionDeReglas: json['versionDeReglas'] as num,
      puenteDesde: json['puenteDesde'] == null
          ? null
          : DateTime.parse(json['puenteDesde'] as String),
      conexionDesde: json['conexionDesde'] == null
          ? null
          : DateTime.parse(json['conexionDesde'] as String),
      ultimoLatido: json['ultimoLatido'] == null
          ? null
          : DateTime.parse(json['ultimoLatido'] as String),
    );

Map<String, dynamic> _$FichaDeEdgeDtoToJson(FichaDeEdgeDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'nombre': instance.nombre,
      'puente': instance.puente,
      'puenteDesde': instance.puenteDesde?.toIso8601String(),
      'conectado': instance.conectado,
      'conexionDesde': instance.conexionDesde?.toIso8601String(),
      'ultimoLatido': instance.ultimoLatido?.toIso8601String(),
      'versionDeReglas': instance.versionDeReglas,
    };
