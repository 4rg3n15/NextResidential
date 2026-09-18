// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'conteos_de_alertas_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConteosDeAlertasDto _$ConteosDeAlertasDtoFromJson(Map<String, dynamic> json) =>
    ConteosDeAlertasDto(
      pendientes: json['pendientes'] as num,
      severidadMaxima: json['severidadMaxima'] == null
          ? null
          : ConteosDeAlertasDtoSeveridadMaxima.fromJson(
              json['severidadMaxima'] as String,
            ),
    );

Map<String, dynamic> _$ConteosDeAlertasDtoToJson(
  ConteosDeAlertasDto instance,
) => <String, dynamic>{
  'pendientes': instance.pendientes,
  'severidadMaxima': instance.severidadMaxima,
};
