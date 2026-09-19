// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fila_de_informe_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FilaDeInformeDto _$FilaDeInformeDtoFromJson(Map<String, dynamic> json) =>
    FilaDeInformeDto(
      momento: DateTime.parse(json['momento'] as String),
      titular: json['titular'] as String,
      vivienda: json['vivienda'] as String,
      dispositivo: json['dispositivo'] as String,
      metodo: json['metodo'] as String,
      resultado: FilaDeInformeDtoResultado.fromJson(
        json['resultado'] as String,
      ),
      detalle: json['detalle'] as String,
    );

Map<String, dynamic> _$FilaDeInformeDtoToJson(FilaDeInformeDto instance) =>
    <String, dynamic>{
      'momento': instance.momento.toIso8601String(),
      'titular': instance.titular,
      'vivienda': instance.vivienda,
      'dispositivo': instance.dispositivo,
      'metodo': instance.metodo,
      'resultado': instance.resultado,
      'detalle': instance.detalle,
    };
