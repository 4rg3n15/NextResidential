// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cola_de_atencion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ColaDeAtencionDto _$ColaDeAtencionDtoFromJson(Map<String, dynamic> json) =>
    ColaDeAtencionDto(
      cola: (json['cola'] as List<dynamic>)
          .map((e) => EnAtencionDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      total: json['total'] as num,
      criticos: json['criticos'] as num,
      esperaMaxima: json['esperaMaxima'] as num,
    );

Map<String, dynamic> _$ColaDeAtencionDtoToJson(ColaDeAtencionDto instance) =>
    <String, dynamic>{
      'cola': instance.cola,
      'total': instance.total,
      'criticos': instance.criticos,
      'esperaMaxima': instance.esperaMaxima,
    };
