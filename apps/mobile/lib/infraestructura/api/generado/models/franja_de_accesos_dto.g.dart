// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'franja_de_accesos_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FranjaDeAccesosDto _$FranjaDeAccesosDtoFromJson(Map<String, dynamic> json) =>
    FranjaDeAccesosDto(
      hora: json['hora'] as num,
      permitidos: json['permitidos'] as num,
      negados: json['negados'] as num,
    );

Map<String, dynamic> _$FranjaDeAccesosDtoToJson(FranjaDeAccesosDto instance) =>
    <String, dynamic>{
      'hora': instance.hora,
      'permitidos': instance.permitidos,
      'negados': instance.negados,
    };
