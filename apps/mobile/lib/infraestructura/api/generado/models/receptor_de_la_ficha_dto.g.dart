// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'receptor_de_la_ficha_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReceptorDeLaFichaDto _$ReceptorDeLaFichaDtoFromJson(
  Map<String, dynamic> json,
) => ReceptorDeLaFichaDto(
  host: json['host'] as String?,
  puerto: json['puerto'] as num?,
  ruta: json['ruta'] as String,
);

Map<String, dynamic> _$ReceptorDeLaFichaDtoToJson(
  ReceptorDeLaFichaDto instance,
) => <String, dynamic>{
  'host': instance.host,
  'puerto': instance.puerto,
  'ruta': instance.ruta,
};
